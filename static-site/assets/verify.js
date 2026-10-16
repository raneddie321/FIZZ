/* Checks a project the way a reviewer would before saying "done": JavaScript syntax (acorn), imports that point at
   missing files or names a module doesn't export, broken links between files, invalid JSON, unbalanced CSS,
   placeholder code, and errors in the running preview. FIZZ DEV runs it when Fizz Code finishes, and sends what it
   finds back to Fizz Code to fix. */
(function () {
  "use strict";
  const F = window.FIZZ;
  const isBinary = (v) => typeof v === "string" && v.startsWith("\u0000blob:");
  const isText = (v) => typeof v === "string" && !isBinary(v);
  const EXTERNAL = /^([a-z][a-z0-9+.-]*:|\/\/|#|\{\{|\$\{)/i;

  let acornLoad = null;
  function acorn() {
    if (window.acorn) return Promise.resolve(window.acorn);
    return (acornLoad ||= new Promise((ok, bad) => {
      const s = document.createElement("script");
      s.src = "vendor/acorn/acorn.js";
      s.onload = () => (window.acorn ? ok(window.acorn) : bad(new Error("acorn didn't load")));
      s.onerror = () => { acornLoad = null; bad(new Error("acorn didn't load")); };
      document.head.appendChild(s);
    }));
  }

  function resolve(from, ref) {
    const clean = ref.split("#")[0].split("?")[0];
    const parts = clean.startsWith("/") ? [] : from.split("/").slice(0, -1);
    for (const s of clean.split("/")) {
      if (!s || s === ".") continue;
      if (s === "..") { if (!parts.length) return null; parts.pop(); } else parts.push(s);
    }
    return parts.join("/");
  }
  const lineOf = (text, index) => text.slice(0, index).split("\n").length;

  /** Parses a script; returns { ast } or { error: { line, message } }. */
  function parse(lib, code, preferModule) {
    const opts = (sourceType) => ({ ecmaVersion: "latest", sourceType, allowHashBang: true, allowAwaitOutsideFunction: true, allowReturnOutsideFunction: sourceType === "script", locations: true });
    const order = preferModule ? ["module", "script"] : ["script", "module"];
    let first = null;
    for (const t of order) {
      try { return { ast: lib.parse(code, opts(t)), module: t === "module" }; } catch (e) { first ||= e; }
    }
    return { error: { line: first.loc?.line, column: first.loc ? first.loc.column + 1 : undefined, message: String(first.message).replace(/\s*\(\d+:\d+\)$/, "") } };
  }

  /** What a module imports and exports, from its AST. */
  function moduleInfo(ast) {
    const imports = [], exports = new Set();
    let star = false;
    const walkDynamic = (node) => {
      if (!node || typeof node !== "object") return;
      if (node.type === "ImportExpression" && node.source?.type === "Literal" && typeof node.source.value === "string") imports.push({ spec: node.source.value, names: [], line: node.loc?.start.line });
      for (const k in node) if (k !== "loc" && node[k] && typeof node[k] === "object") Array.isArray(node[k]) ? node[k].forEach(walkDynamic) : walkDynamic(node[k]);
    };
    for (const n of ast.body) {
      if (n.type === "ImportDeclaration") imports.push({ spec: n.source.value, names: n.specifiers.map((s) => (s.type === "ImportDefaultSpecifier" ? "default" : s.type === "ImportSpecifier" ? (s.imported.name ?? s.imported.value) : null)).filter(Boolean), line: n.loc?.start.line });
      else if (n.type === "ExportDefaultDeclaration") exports.add("default");
      else if (n.type === "ExportAllDeclaration") { if (n.exported) exports.add(n.exported.name ?? n.exported.value); else star = true; imports.push({ spec: n.source.value, names: [], line: n.loc?.start.line }); }
      else if (n.type === "ExportNamedDeclaration") {
        if (n.source) imports.push({ spec: n.source.value, names: n.specifiers.map((s) => s.local.name ?? s.local.value).filter((x) => x !== "default"), line: n.loc?.start.line });
        for (const s of n.specifiers) exports.add(s.exported.name ?? s.exported.value);
        const d = n.declaration;
        if (d?.id) exports.add(d.id.name);
        if (d?.declarations) for (const v of d.declarations) collectNames(v.id, exports);
      }
    }
    walkDynamic(ast);
    return { imports, exports, star };
  }
  function collectNames(pattern, out) {
    if (!pattern) return;
    if (pattern.type === "Identifier") out.add(pattern.name);
    else if (pattern.type === "ObjectPattern") pattern.properties.forEach((p) => collectNames(p.value || p.argument, out));
    else if (pattern.type === "ArrayPattern") pattern.elements.forEach((e) => collectNames(e, out));
    else if (pattern.type === "RestElement") collectNames(pattern.argument, out);
    else if (pattern.type === "AssignmentPattern") collectNames(pattern.left, out);
  }

  function cssBalance(css) {
    const s = css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, "\"\"");
    let depth = 0;
    for (let i = 0; i < s.length; i++) {
      if (s[i] === "{") depth++;
      else if (s[i] === "}" && --depth < 0) return `an extra "}" on line ${lineOf(s, i)}`;
    }
    return depth > 0 ? `${depth} unclosed "{"` : "";
  }

  const PLACEHOLDER = /(\/\/|\/\*|<!--|#)\s*\.{3}\s*(rest|remaining|existing|same|other|more|previous|unchanged)\b|\b(rest of (the )?(code|file|styles|functions|component|implementation)|same as before|code unchanged|implementation goes here|your code here)\b|\bTODO:?\s*implement\b/i;

  /**
   * Checks the project. `changed` limits the placeholder check to files written this turn; `preview(path)` returns
   * the console errors of a rendered page.
   */
  async function check(files, { changed = [], preview = null } = {}) {
    const issues = [];
    // Only what this turn touched: problems in changed files, or problems that mention them (a broken import of a
    // file that was renamed), plus errors in the running pages. Old problems elsewhere aren't this turn's job.
    const relevant = (path, text) => !changed.length || changed.includes(path) || changed.some((c) => text.includes(c));
    const add = (path, line, text, runtime = false) => { if (issues.length < 40 && (runtime || relevant(path, text)) && !issues.some((x) => x.path === path && x.text === text)) issues.push({ path, line, text }); };
    const paths = Object.keys(files).filter((p) => !p.startsWith(".git/") && !p.includes("node_modules/"));
    const exists = (p) => p != null && files[p] !== undefined;
    let lib = null;
    try { lib = await acorn(); } catch {}
    const modules = new Map();
    const htmlRefs = (p) => /\.html?$/i.test(p) ? [...files[p].matchAll(/<script\b[^>]*type=["']module["'][^>]*src=["']([^"']+)["']|<script\b[^>]*src=["']([^"']+)["'][^>]*type=["']module["']/gi)].map((m) => resolve(p, m[1] || m[2])) : [];
    const moduleEntries = new Set(paths.flatMap(htmlRefs));

    // JavaScript: syntax, imports, exports.
    const jsCode = [];
    for (const p of paths) {
      if (!isText(files[p])) continue;
      if (/\.(m?js|cjs)$/i.test(p) && !/\.min\.js$/i.test(p) && files[p].length < 600_000) jsCode.push({ path: p, code: files[p], from: p, module: /\.mjs$/i.test(p) || moduleEntries.has(p) || /^\s*(import|export)\b/m.test(files[p]) });
      if (/\.html?$/i.test(p)) {
        for (const m of files[p].matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
          if (/\bsrc=/i.test(m[1]) || !m[2].trim() || /type=["'](?!module|text\/javascript|application\/javascript)[^"']*["']/i.test(m[1])) continue;
          jsCode.push({ path: p, code: m[2], from: p, module: /type=["']module["']/i.test(m[1]), offset: lineOf(files[p], m.index) - 1 });
        }
      }
    }
    if (lib) {
      for (const j of jsCode) {
        const r = parse(lib, j.code, j.module);
        if (r.error) { add(j.path, r.error.line != null ? r.error.line + (j.offset || 0) : undefined, `JavaScript syntax error: ${r.error.message}`); continue; }
        const info = moduleInfo(r.ast);
        if (!j.offset) modules.set(j.path, info);
        for (const im of info.imports) {
          if (!/^\.{0,2}\//.test(im.spec)) continue;
          const target = resolve(j.from, im.spec);
          const hit = [target, `${target}.js`, `${target}/index.js`].find(exists);
          if (!hit) add(j.path, (im.line || 0) + (j.offset || 0) || undefined, `imports "${im.spec}", but ${target || im.spec} doesn't exist in the project`);
          else if (hit !== target) add(j.path, (im.line || 0) + (j.offset || 0) || undefined, `imports "${im.spec}" without the file extension — browsers need the full path ("${im.spec}${hit.slice(target.length)}")`);
          if (hit && im.names.length) (j.pending ||= []).push({ hit, names: im.names, line: (im.line || 0) + (j.offset || 0), spec: im.spec });
        }
      }
      for (const j of jsCode) for (const x of j.pending || []) {
        const target = modules.get(x.hit);
        if (!target || target.star) continue;
        const missing = x.names.filter((n) => !target.exports.has(n));
        if (missing.length) add(j.path, x.line || undefined, `imports ${missing.map((n) => (n === "default" ? "a default export" : `"${n}"`)).join(", ")} from "${x.spec}", but ${x.hit} doesn't export ${missing.length === 1 ? "it" : "them"}${target.exports.size ? ` (it exports: ${[...target.exports].slice(0, 12).join(", ")})` : " anything"}`);
      }
    }

    for (const p of paths) {
      const v = files[p];
      if (!isText(v)) continue;
      if (/\.json$/i.test(p) && v.length < 2_000_000) { try { JSON.parse(v); } catch (e) { add(p, undefined, `invalid JSON: ${e.message}`); } }
      if (/\.css$/i.test(p)) { const b = cssBalance(v); if (b) add(p, undefined, `CSS has ${b}`); }
      if (/\.html?$/i.test(p)) {
        let doc = null;
        try { doc = new DOMParser().parseFromString(v, "text/html"); } catch {}
        if (!doc) continue;
        const refs = [
          ...[...doc.querySelectorAll("script[src]")].map((e) => ["script", e.getAttribute("src")]),
          ...[...doc.querySelectorAll("link[href]")].filter((e) => /stylesheet|icon|manifest|preload/i.test(e.getAttribute("rel") || "")).map((e) => ["stylesheet or icon", e.getAttribute("href")]),
          ...[...doc.querySelectorAll("img[src], source[src], video[src], audio[src], iframe[src], image[href]")].map((e) => ["media", e.getAttribute("src") || e.getAttribute("href")]),
          ...[...doc.querySelectorAll("a[href]")].map((e) => e.getAttribute("href")).filter((h) => /\.html?([#?]|$)/i.test(h || "")).map((h) => ["page link", h]),
        ];
        for (const [kind, ref] of refs) {
          if (!ref || EXTERNAL.test(ref.trim())) continue;
          const target = resolve(p, ref.trim());
          if (target === null) add(p, undefined, `the ${kind} "${ref}" points outside the project`);
          else if (!exists(target)) add(p, undefined, `the ${kind} "${ref}" points to ${target}, which doesn't exist`);
        }
        if (/(^|\/)index\.html?$/i.test(p) && !/<meta[^>]+name=["']viewport["']/i.test(v) && /<html|<body|<head/i.test(v)) add(p, undefined, `has no <meta name="viewport"> tag, so it won't fit phone screens`);
      }
    }
    for (const p of changed) if (isText(files[p]) && PLACEHOLDER.test(files[p])) {
      const m = PLACEHOLDER.exec(files[p]);
      add(p, lineOf(files[p], m.index), `looks unfinished: "${m[0].trim()}" — write the real code`);
    }

    // Runtime: errors in the pages that changed (or the main page).
    if (preview) {
      const pages = [...new Set([...changed.filter((p) => /\.html?$/i.test(p) && exists(p)), exists("index.html") ? "index.html" : paths.find((p) => /\.html?$/i.test(p))].filter(Boolean))].slice(0, 3);
      const touchedWeb = changed.some((p) => /\.(html?|m?js|css|json)$/i.test(p));
      if (touchedWeb) for (const page of pages) {
        try {
          const errors = await preview(page);
          for (const e of (errors || []).slice(0, 8)) add(page, undefined, `error while the page runs: ${String(e).slice(0, 300)}`, true);
        } catch {}
      }
    }
    return { issues, checked: { files: paths.length, scripts: jsCode.length, syntax: Boolean(lib) } };
  }

  const format = (issues) => issues.map((x) => `- ${x.path}${x.line ? `:${x.line}` : ""} — ${x.text}`).join("\n");

  F.verify = { check, format, parse: (code, module = true) => acorn().then((lib) => parse(lib, code, module)) };
})();
