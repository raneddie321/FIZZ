/* Fizz Code's tools for looking around a project without carrying all of it in the prompt:
     <fizz-tree path="src" depth="3"/>            the folder tree with sizes
     <fizz-grep pattern="useState\(" glob="*.jsx"/>   where something is (regular expression, or plain text)
     <fizz-read path="src/app.js" lines="120-260"/>   that part of a file, with line numbers
     <fizz-symbols path="src/app.js"/>            an outline: functions, classes, selectors, headings
   They only read, so they are allowed in read-only and plan mode. The logic is in the shared agent core. */
(function () {
  "use strict";
  const F = window.FIZZ;
  const C = F.agentCore;
  const SECRET = /(^|\/)\.env(\.(?!example$|sample$|template$)[^/]*)?$/;
  const BIG_FILE = 1_500_000;
  const isBin = (v) => typeof v !== "string" || Boolean(F.blobs?.isBlob?.(v));
  const sizeOf = (v) => (typeof v === "string" && !F.blobs?.isBlob?.(v) ? v.length : F.blobs?.info?.(v)?.size || 0);
  const mask = (text) => String(text).split("\n").map((l) => (/^\s*(export\s+)?[A-Za-z_][\w.]*\s*=/.test(l) ? l.replace(/=.*$/, "=•••• (set — the value is hidden from you)") : l)).join("\n");
  const clean = (p) => String(p || "").trim().replace(/^\.?\/+/, "").replace(/\/+$/, "");
  const entries = (files) => Object.entries(files).map(([path, v]) => ({ path, size: sizeOf(v) }));
  const looks = (target) => () => ({ kind: "read", target, readOnly: true });

  // ---------- a repository that lives in the cloud sandbox (project.remote) ----------
  const remote = (p) => p?.remote;
  const look = (p, body) => F.conn.sandbox({ action: "look", projectId: p.id, ...body });
  /** Files the agent reads are pulled into the project, so it can edit them (and the rest stays in the sandbox). */
  async function pull(ctx, paths) {
    const p = ctx.project();
    const want = paths.filter((x) => p.files[x] === undefined);
    if (!want.length) return {};
    const r = await look(p, { kind: "read", paths: want });
    const got = {};
    for (const [path, v] of Object.entries(r.files || {})) {
      if (typeof v === "string") { p.files[path] = v; got[path] = v; }
      else got[path] = v; // null (missing), { tooBig } or { binary }
    }
    ctx.save?.();
    ctx.rerender?.();
    return got;
  }
  const remoteEntries = (p) => (p.remote.tree || []).map((e) => ({ path: e.path, size: p.files[e.path] !== undefined ? sizeOf(p.files[e.path]) : e.size }));
  /** The path the agent means in a remote project: exact, or a unique file name. */
  function findRemote(p, raw) {
    const path = clean(raw);
    const all = (p.remote.tree || []).map((e) => e.path);
    if (p.files[path] !== undefined || all.includes(path)) return { path };
    const name = path.split("/").pop().toLowerCase(), stem = name.replace(/\.[^.]+$/, "");
    const near = all.filter((f) => { const b = f.toLowerCase().split("/").pop(); return b === name || b.replace(/\.[^.]+$/, "") === stem; }).slice(0, 5);
    return { miss: `There is no file ${path || "(no path given)"} in the repository.${near.length ? ` Did you mean: ${near.join(", ")}?` : " Use <fizz-tree/> or <fizz-grep/> to find it."}` };
  }
  /** The file a path means, or a helpful miss: the closest names. */
  function find(files, raw) {
    const path = clean(raw);
    if (files[path] !== undefined) return { path };
    // Same file name elsewhere, or the same name with another extension.
    const name = path.split("/").pop().toLowerCase(), stem = name.replace(/\.[^.]+$/, "");
    const near = Object.keys(files).filter((f) => { const b = f.toLowerCase().split("/").pop(); return b === name || b.replace(/\.[^.]+$/, "") === stem || (stem.length > 3 && b.includes(stem)); }).slice(0, 5);
    return { miss: `There is no file ${path || "(no path given)"}.${near.length ? ` Did you mean: ${near.join(", ")}?` : " Use <fizz-tree/> to see what exists."}` };
  }

  F.agentTools.register("tree", {
    icon: "folder", feedback: true,
    label: (t) => `Looked at ${clean(t.attrs.path) || "the project"}'s files`,
    summary: (k) => `listed files ${k} time${k === 1 ? "" : "s"}`,
    prompt: '<fizz-tree path="src" depth="3"/> lists the files under a folder as a tree with sizes (path and depth are optional; deeper folders are folded to a count). Use it to find your way in a project you can\'t see all of.',
    perm: (t) => looks(`tree ${clean(t.attrs.path)}`)(),
    async run(t, ctx) {
      const depth = Math.min(8, Math.max(1, Number(t.attrs.depth) || 3));
      const p = ctx.project();
      if (remote(p)) {
        if (t.attrs.refresh === "true") { const r = await look(p, { kind: "tree" }); p.remote.tree = r.tree; ctx.save?.(); }
        return { ok: true, text: C.treeText(remoteEntries(p), { path: clean(t.attrs.path), depth, max: 400 }) };
      }
      return { ok: true, text: C.treeText(entries(p.files), { path: clean(t.attrs.path), depth, max: 400 }) };
    },
  });

  F.agentTools.register("grep", {
    icon: "search", feedback: true,
    label: (t) => `Searched the code for ${String(t.attrs.pattern || t.body).slice(0, 80)}`,
    summary: (k) => `searched the code ${k} time${k === 1 ? "" : "s"}`,
    prompt: '<fizz-grep pattern="function\\s+render" path="src" glob="*.js"/> finds lines in the project\'s files (a regular expression; plain text works too; path and glob are optional; add ignore-case="true" when needed). It answers path:line: text for up to 80 matches. Use it to find where something is defined or used before you read or change it.',
    perm: (t) => looks(`grep ${String(t.attrs.pattern || t.body).slice(0, 120)}`)(),
    async run(t, ctx) {
      const pattern = String(t.attrs.pattern || t.body || "");
      if (!pattern.trim()) return { ok: false, text: "Give a pattern to search for: <fizz-grep pattern=\"…\"/>." };
      const max = Math.min(200, Math.max(1, Number(t.attrs.max) || 80));
      if (remote(ctx.project())) {
        // Files changed in FIZZ but not yet run in the sandbox are searched here; the rest with git grep there.
        const r = await look(ctx.project(), { kind: "grep", pattern, path: clean(t.attrs.path), glob: t.attrs.glob || "", ignoreCase: t.attrs["ignore-case"] === "true", max });
        if (r.error) return { ok: false, text: `The search failed: ${r.error}` };
        const local = C.grepFiles(ctx.project().files, { pattern, path: clean(t.attrs.path), glob: t.attrs.glob || "", ignoreCase: t.attrs["ignore-case"] === "true", max, skip: (p, text) => isBin(text) || SECRET.test(p) });
        const seen = new Set(local.matches.map((m) => m.path));
        const matches = [...local.matches, ...r.matches.filter((m) => !seen.has(m.path) && !SECRET.test(m.path))].slice(0, max);
        if (!matches.length) return { ok: true, text: `No matches for ${pattern} in the repository.` };
        return { ok: true, text: `${matches.length}${r.truncated ? "+" : ""} match${matches.length === 1 ? "" : "es"}${r.truncated ? " (more exist: narrow the pattern, path or glob)" : ""}:\n${matches.map((m) => `${m.path}:${m.line}: ${m.text}`).join("\n")}` };
      }
      const r = C.grepFiles(ctx.project().files, { pattern, path: clean(t.attrs.path), glob: t.attrs.glob || "", ignoreCase: t.attrs["ignore-case"] === "true", max, skip: (p, text) => isBin(text) || SECRET.test(p) || text.length > BIG_FILE });
      if (!r.matches.length) return { ok: true, text: `No matches for ${pattern}${t.attrs.path ? ` under ${clean(t.attrs.path)}` : ""}${t.attrs.glob ? ` in ${t.attrs.glob}` : ""}.${r.literal ? " (Searched as plain text: it isn't a valid regular expression.)" : ""}` };
      return { ok: true, text: `${r.matches.length}${r.truncated ? "+" : ""} match${r.matches.length === 1 ? "" : "es"} in ${r.files} file${r.files === 1 ? "" : "s"}${r.truncated ? " (more exist: narrow the pattern, path or glob)" : ""}:\n${r.matches.map((m) => `${m.path}:${m.line}: ${m.text}`).join("\n")}` };
    },
  });

  F.agentTools.register("read", {
    icon: "file", feedback: true,
    label: (t) => `Read ${clean(t.attrs.path)}${t.attrs.lines ? ` (lines ${t.attrs.lines})` : ""}`,
    summary: (k) => `read ${k} file part${k === 1 ? "" : "s"}`,
    prompt: '<fizz-read path="src/app.js" lines="120-260"/> shows that part of a file with line numbers (up to 400 lines; without lines, from the top). Read the part you are going to change, then change it with <fizz-edit> using text copied from what you read (without the line numbers).',
    perm: (t) => looks(`read ${clean(t.attrs.path)}`)(),
    async run(t, ctx) {
      const p = ctx.project();
      const files = p.files;
      const f = remote(p) ? findRemote(p, t.attrs.path || t.body) : find(files, t.attrs.path || t.body);
      if (f.miss) return { ok: false, text: f.miss };
      if (remote(p) && files[f.path] === undefined) {
        const got = (await pull(ctx, [f.path]))[f.path];
        if (typeof got !== "string") return { ok: false, text: got?.tooBig ? `${f.path} is too large to open (${Math.round(got.tooBig / 1000)} kB). Search it with <fizz-grep path="${f.path}"/>.` : got?.binary ? `${f.path} is a binary file.` : `${f.path} couldn't be read from the sandbox.` };
      }
      const v = files[f.path];
      if (isBin(v)) return { ok: true, text: `${f.path} is a binary file (${F.blobs?.describe?.(v) || "not text"}); it can't be read as text.` };
      const r = C.readLines(SECRET.test(f.path) ? mask(v) : v, t.attrs.lines || "");
      return { ok: true, text: `${f.path} — lines ${r.from}–${r.to} of ${r.total}${SECRET.test(f.path) ? " (values hidden)" : ""}:\n${r.text}${r.more ? `\n… ${r.total - r.to} more line${r.total - r.to === 1 ? "" : "s"}: ask for lines="${r.to + 1}-${Math.min(r.total, r.to + 400)}".` : ""}` };
    },
  });

  F.agentTools.register("symbols", {
    icon: "list", feedback: true,
    label: (t) => `Outlined ${clean(t.attrs.path)}`,
    summary: (k) => `outlined ${k} file${k === 1 ? "" : "s"}`,
    prompt: '<fizz-symbols path="src/app.js"/> gives a file\'s outline — functions, classes, exports, CSS selectors, headings — with line numbers, so you can read just the part you need.',
    perm: (t) => looks(`symbols ${clean(t.attrs.path)}`)(),
    async run(t, ctx) {
      const p = ctx.project();
      const files = p.files;
      const f = remote(p) ? findRemote(p, t.attrs.path || t.body) : find(files, t.attrs.path || t.body);
      if (f.miss) return { ok: false, text: f.miss };
      if (remote(p) && files[f.path] === undefined) await pull(ctx, [f.path]);
      const v = files[f.path];
      if (v === undefined) return { ok: false, text: `${f.path} couldn't be read from the sandbox.` };
      if (isBin(v) || SECRET.test(f.path)) return { ok: true, text: `${f.path} has no outline (binary or secret).` };
      const list = C.symbolsOf(v, f.path);
      return { ok: true, text: list.length ? `${f.path} — ${v.split("\n").length} lines, ${list.length} symbol${list.length === 1 ? "" : "s"}:\n${list.map((x) => `${String(x.line).padStart(5)}  ${x.text}`).join("\n")}` : `${f.path} — ${v.split("\n").length} lines; no functions, classes or headings found. Read it with <fizz-read path="${f.path}"/>.` };
    },
  });

  /** Clones a GitHub repository into the project's cloud sandbox. → the project's remote info. */
  async function cloneInto(project, { owner, repo, branch }) {
    const r = await F.conn.sandbox({ action: "clone", projectId: project.id, url: `https://github.com/${owner}/${repo}`, branch });
    project.remote = { owner, repo, branch: r.branch, sha: r.sha, tree: r.tree, at: Date.now() };
    // The files that tell what the project is come along; the rest is fetched when Fizz Code reads it.
    const first = ["FIZZ.md", "README.md", "package.json", "AGENTS.md", "CLAUDE.md"].filter((x) => r.tree.some((e) => e.path === x));
    if (first.length) { const got = await look(project, { kind: "read", paths: first }); for (const [k, v] of Object.entries(got.files || {})) if (typeof v === "string") project.files[k] = v; }
    return project.remote;
  }
  F.codeTools = { entries, sizeOf, remoteEntries, cloneInto, pull };
})();
