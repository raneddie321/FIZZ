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
    run(t, ctx) {
      const depth = Math.min(8, Math.max(1, Number(t.attrs.depth) || 3));
      return { ok: true, text: C.treeText(entries(ctx.project().files), { path: clean(t.attrs.path), depth, max: 400 }) };
    },
  });

  F.agentTools.register("grep", {
    icon: "search", feedback: true,
    label: (t) => `Searched the code for ${String(t.attrs.pattern || t.body).slice(0, 80)}`,
    summary: (k) => `searched the code ${k} time${k === 1 ? "" : "s"}`,
    prompt: '<fizz-grep pattern="function\\s+render" path="src" glob="*.js"/> finds lines in the project\'s files (a regular expression; plain text works too; path and glob are optional; add ignore-case="true" when needed). It answers path:line: text for up to 80 matches. Use it to find where something is defined or used before you read or change it.',
    perm: (t) => looks(`grep ${String(t.attrs.pattern || t.body).slice(0, 120)}`)(),
    run(t, ctx) {
      const pattern = String(t.attrs.pattern || t.body || "");
      if (!pattern.trim()) return { ok: false, text: "Give a pattern to search for: <fizz-grep pattern=\"…\"/>." };
      const max = Math.min(200, Math.max(1, Number(t.attrs.max) || 80));
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
    run(t, ctx) {
      const files = ctx.project().files;
      const f = find(files, t.attrs.path || t.body);
      if (f.miss) return { ok: false, text: f.miss };
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
    run(t, ctx) {
      const files = ctx.project().files;
      const f = find(files, t.attrs.path || t.body);
      if (f.miss) return { ok: false, text: f.miss };
      const v = files[f.path];
      if (isBin(v) || SECRET.test(f.path)) return { ok: true, text: `${f.path} has no outline (binary or secret).` };
      const list = C.symbolsOf(v, f.path);
      return { ok: true, text: list.length ? `${f.path} — ${v.split("\n").length} lines, ${list.length} symbol${list.length === 1 ? "" : "s"}:\n${list.map((x) => `${String(x.line).padStart(5)}  ${x.text}`).join("\n")}` : `${f.path} — ${v.split("\n").length} lines; no functions, classes or headings found. Read it with <fizz-read path="${f.path}"/>.` };
    },
  });

  F.codeTools = { entries, sizeOf };
})();
