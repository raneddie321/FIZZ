/* FIZZ DEV terminal: a bash-like shell over the project's files (see shell.js), JavaScript in a Web Worker,
   Python 3 with Pyodide, and real Linux bash in the cloud sandbox for npm, git and everything else. */
(function () {
  "use strict";

  const C = { reset: "\x1b[0m", dim: "\x1b[2m", red: "\x1b[31m", green: "\x1b[32m", yellow: "\x1b[33m", cyan: "\x1b[36m", magenta: "\x1b[35m", gray: "\x1b[90m", bold: "\x1b[1m" };
  // Python 3 runs in the browser with Pyodide (WebAssembly), pinned to one release.
  const PYODIDE_CDN = "https://cdn.jsdelivr.net/pyodide/v314.0.7/full/";
  const PY_WORKER_SRC = `
  let py = null, booting = null;
  async function boot(base) {
    if (py) return py;
    booting ||= (async () => { const { loadPyodide } = await import(base + "pyodide.mjs"); py = await loadPyodide({ indexURL: base }); return py; })();
    return booting;
  }
  const walk = (FS, dir, out = []) => { for (const n of FS.readdir(dir)) { if (n === "." || n === "..") continue; const p = dir + "/" + n; const st = FS.stat(p); if (FS.isDir(st.mode)) walk(FS, p, out); else out.push(p); } return out; };
  const TEXT = /\\.(py|txt|md|csv|json|html?|css|js|mjs|ts|xml|svg|ya?ml|toml|ini|cfg|log|tsv|sql|sh)$/i;
  self.onmessage = async (e) => {
    const { id, kind, files, entry, args, code, pkgs, base } = e.data;
    const out = (stream, text) => self.postMessage({ type: "out", id, stream, text });
    try {
      if (!py) out("dim", "Starting Python (first time takes a few seconds)…");
      const p = await boot(base);
      p.setStdout({ batched: (t) => out("out", t) });
      p.setStderr({ batched: (t) => out("err", t) });
      if (kind === "pip") {
        await p.loadPackage("micropip", { messageCallback: (m) => out("dim", m) });
        await p.pyimport("micropip").install(pkgs);
        out("out", "Installed " + pkgs.join(", "));
        return self.postMessage({ type: "done", id, code: 0 });
      }
      const FS = p.FS, root = "/project";
      try { for (const f of walk(FS, root)) FS.unlink(f); } catch { FS.mkdirTree(root); }
      const before = {};
      for (const [path, v] of Object.entries(files)) {
        const full = root + "/" + path;
        FS.mkdirTree(full.slice(0, full.lastIndexOf("/")));
        FS.writeFile(full, v instanceof ArrayBuffer ? new Uint8Array(v) : v);
        before[full] = v instanceof ArrayBuffer ? v.byteLength + ":bin" : v;
      }
      FS.chdir(root);
      const src = code != null ? code : files[entry];
      await p.loadPackagesFromImports(src, { messageCallback: (m) => out("dim", m) });
      p.runPython("import sys; sys.argv = " + JSON.stringify([entry || "-c", ...(args || [])]) + "; sys.path.insert(0, '/project')");
      let status = 0;
      try { await p.runPythonAsync(src, { filename: entry || "<string>" }); }
      catch (err) {
        const msg = String(err && err.message || err);
        const m = /SystemExit: (\\d+)/.exec(msg);
        if (m) status = Number(m[1]);
        else { const ls = msg.split("\\n"); const at = ls.findIndex((l) => /^\\s*File "/.test(l) && !/^\\s*File "(\\/lib\\/|<exec>|\\/home\\/pyodide\\/)|_pyodide/.test(l)); out("err", (at > 0 ? ["Traceback (most recent call last):", ...ls.slice(at)] : ls).join("\\n").trim()); status = 1; }
      }
      // Send back files the script created or changed.
      for (const full of walk(FS, root)) {
        const rel = full.slice(root.length + 1);
        if (rel.startsWith("__pycache__/") || rel.includes("/__pycache__/")) continue;
        const bytes = FS.readFile(full);
        if (TEXT.test(rel)) { const text = new TextDecoder().decode(bytes); if (before[full] !== text) self.postMessage({ type: "file", id, path: rel, text }); }
        else if (before[full] !== bytes.byteLength + ":bin") { const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength); self.postMessage({ type: "file", id, path: rel, bytes: buf }, [buf]); }
      }
      self.postMessage({ type: "done", id, code: status });
    } catch (err) {
      out("err", String(err && err.message || err));
      self.postMessage({ type: "done", id, code: 1 });
    }
  };`;

  const WORKER_SRC = `
  const fmt = (v) => { try { if (typeof v === "string") return v; if (v instanceof Error) return v.stack || v.message; if (v === undefined) return "undefined"; if (typeof v === "function") return "[Function]"; const one = JSON.stringify(v); return one && one.length > 80 ? JSON.stringify(v, null, 2) : String(one); } catch { return String(v); } };
  let timers = 0;
  const _st = self.setTimeout, _ct = self.clearTimeout, _si = self.setInterval, _ci = self.clearInterval;
  const live = new Set();
  self.setTimeout = (fn, ms, ...a) => { const id = _st(() => { live.delete(id); try { fn(...a); } catch (e) { send("err", [e]); } }, ms); live.add(id); return id; };
  self.clearTimeout = (id) => { live.delete(id); _ct(id); };
  self.setInterval = (fn, ms, ...a) => { const id = _si(() => { try { fn(...a); } catch (e) { send("err", [e]); } }, ms); live.add(id); return id; };
  self.clearInterval = (id) => { live.delete(id); _ci(id); };
  function send(stream, args) { self.postMessage({ type: "out", stream, text: args.map(fmt).join(" ") }); }
  const consoleShim = { log: (...a) => send("out", a), info: (...a) => send("out", a), debug: (...a) => send("out", a), warn: (...a) => send("err", a), error: (...a) => send("err", a), table: (...a) => send("out", a) };
  class Exit { constructor(code) { this.code = code; } }
  // Document libraries the scripts can use (loaded on first use): require("docx"), require("xlsx")…
  const LIBS = { docx: ["docx.min.js", "docx"], xlsx: ["xlsx.full.min.js", "XLSX"], pptxgenjs: ["pptxgen.bundle.js", "PptxGenJS"], jspdf: ["jspdf.umd.min.js", "jspdf"], "pdf-lib": ["pdf-lib.min.js", "PDFLib"] };
  let BASE = "";
  function lib(name) {
    const l = LIBS[name];
    if (!l) return null;
    if (!self[l[1]]) importScripts(BASE + "vendor/docs/" + l[0]);
    return self[l[1]];
  }
  const writes = [];
  function writeOut(path, data) {
    path = String(path).replace(/^\\.?\\/+/, "");
    if (typeof data === "string") { self.postMessage({ type: "file", path, text: data }); return; }
    const p = Promise.resolve(data instanceof Blob ? data.arrayBuffer() : data).then((d) => {
      const buf = d instanceof ArrayBuffer ? d : d && d.buffer ? d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength) : null;
      if (!buf) throw new Error("fizz.writeFile: data must be a string, Uint8Array, ArrayBuffer or Blob");
      self.postMessage({ type: "file", path, bytes: buf }, [buf]);
    });
    writes.push(p);
    return p;
  }
  self.onmessage = async (e) => {
    const { files, entry, args, base } = e.data;
    BASE = base || "";
    const dir = (p) => p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "";
    const norm = (p) => { const out = []; for (const s of p.split("/")) { if (!s || s === ".") continue; if (s === "..") out.pop(); else out.push(s); } return out.join("/"); };
    const cache = {};
    const process = { argv: ["node", entry, ...args], env: {}, platform: "browser", cwd: () => "/", exit: (c = 0) => { throw new Exit(c); }, stdout: { write: (s) => send("raw", [String(s)]) } };
    const readText = (p) => { p = norm(p); if (typeof files[p] !== "string") throw new Error("ENOENT: no such file '" + p + "'" + (files[p] === null ? " (binary files can't be read here)" : "")); return files[p]; };
    const fizz = { writeFile: writeOut, readFile: readText, use: (n) => { const m = lib(n); if (!m) throw new Error("Unknown library " + n + ". Available: " + Object.keys(LIBS).join(", ")); return m; } };
    self.fizz = fizz;
    const fs = { writeFileSync: (p, d) => { writeOut(p, d); }, readFileSync: (p) => readText(p), existsSync: (p) => files[norm(p)] !== undefined, promises: { writeFile: async (p, d) => writeOut(p, d), readFile: async (p) => readText(p) } };
    function req(from, name) {
      if (name === "fs" || name === "node:fs") return fs;
      if (name === "fs/promises" || name === "node:fs/promises") return fs.promises;
      if (name === "path" || name === "node:path") return { join: (...a) => norm(a.join("/")), basename: (p) => p.split("/").pop(), dirname: dir, extname: (p) => (p.match(/\\.[^./]+$/) || [""])[0] };
      if (LIBS[name]) { const m = lib(name); return name === "jspdf" ? m : m; }
      if (!name.startsWith(".") && !name.startsWith("/")) throw new Error("Module '" + name + "' isn't available in the browser runner. Available: your project's files, fs, path and " + Object.keys(LIBS).join(", ") + ".");
      let p = norm((name.startsWith("/") ? "" : dir(from) + "/") + name);
      for (const c of [p, p + ".js", p + ".cjs", p + "/index.js"]) if (files[c] !== undefined) { p = c; break; }
      if (p.endsWith(".json") && files[p] !== undefined) return JSON.parse(files[p]);
      return load(p);
    }
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    function load(p, top) {
      if (cache[p]) return cache[p].exports;
      if (typeof files[p] !== "string") throw new Error("Cannot find module '" + p + "'");
      const module = { exports: {} };
      cache[p] = module;
      let fn;
      const Ctor = top ? AsyncFunction : Function;
      try { fn = new Ctor("module", "exports", "require", "console", "process", "__filename", "__dirname", "fizz", files[p]); }
      catch (err) { if (/import|export/.test(String(err.message))) throw new Error(p + ": ES module syntax (import/export) isn't supported by the browser runner. Use require()/module.exports, or run it in a full sandbox."); throw err; }
      const out = fn(module, module.exports, (n) => req(p, n), consoleShim, process, p, dir(p), fizz);
      return top ? out : module.exports;
    }
    let code = 0;
    try { await load(entry, true); await Promise.all(writes); } catch (err) { if (err instanceof Exit) code = err.code; else { send("err", [err && err.stack ? err.stack.split("\\n").slice(0, 6).join("\\n") : String(err)]); code = 1; } }
    let idle = 0;
    const check = () => { if (live.size === 0) { if (++idle >= 2) return self.postMessage({ type: "done", code }); } else idle = 0; _st(check, 50); };
    _st(check, 0);
  };`;

  const F = window.FIZZ;
  function createTerminal(host, api) {
    const term = new Terminal({
      fontFamily: '"JetBrains Mono", ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace',
      fontSize: 13,
      cursorBlink: true,
      convertEol: true,
      theme: { background: "#1c1b1a", foreground: "#ecebe6", cursor: "#ecebe6", cursorAccent: "#1c1b1a", selectionBackground: "#ecebe633", black: "#1c1b1a", red: "#ef7d70", green: "#9fc27a", yellow: "#e5bd78", blue: "#a9b8c9", magenta: "#cdb0ec", cyan: "#9fc9c0", white: "#d9d8d2", brightBlack: "#77756d", brightRed: "#f29a8f", brightGreen: "#b3cc86", brightYellow: "#ecc98d", brightBlue: "#c2cedc", brightMagenta: "#dcc6f2", brightCyan: "#b6d8d1", brightWhite: "#ffffff" },
    });
    const fit = new FitAddon.FitAddon();
    term.loadAddon(fit);
    term.open(host);
    const doFit = () => { try { fit.fit(); } catch {} };
    new ResizeObserver(doFit).observe(host);
    setTimeout(doFit, 50);

    let cwd = "";
    let line = "", pos = 0, history = [], hIdx = -1, busy = null;
    // fizzdev/<user>/<project>[/folder] $
    const prompt = () => `${C.gray}fizzdev/${userSlug()}/${C.reset}${C.bold}${projSlug()}${C.reset}${cwd ? `${C.gray}/${cwd}${C.reset}` : ""}${cloudMode ? ` ${C.yellow}(cloud)${C.reset}` : ""} ${C.bold}$${C.reset} `;
    let capture = null;
    const w = (s) => { if (capture) capture.push(s); term.write(s); };
    const wl = (s = "") => w(s + "\r\n");

    const abs = (p = "") => {
      const parts = (p.startsWith("/") ? [] : cwd.split("/").filter(Boolean));
      for (const s of p.split("/")) { if (!s || s === ".") continue; if (s === "..") parts.pop(); else parts.push(s); }
      return parts.join("/");
    };
    const files = () => api.files();
    const isDir = (p) => p === "" || Object.keys(files()).some((f) => f.startsWith(p + "/"));
    const isFile = (p) => files()[p] !== undefined;
    function list(dir) {
      const pre = dir ? dir + "/" : "";
      const names = new Map();
      for (const f of Object.keys(files())) {
        if (!f.startsWith(pre)) continue;
        const rest = f.slice(pre.length);
        const i = rest.indexOf("/");
        if (i === -1) names.set(rest, "file"); else names.set(rest.slice(0, i), "dir");
      }
      return [...names.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    }

    const termIO = { tty: true, out: (s) => w(String(s).replace(/\n/g, "\r\n")), err: (s) => wl(`${C.red}${String(s).replace(/\n/g, "\r\n")}${C.reset}`) };
    function runNode(path, args, io = termIO) {
      return new Promise((resolve) => {
        const worker = new Worker(URL.createObjectURL(new Blob([WORKER_SRC], { type: "text/javascript" })));
        const kill = (code, msg) => { worker.terminate(); if (msg) io.err(msg); busy = () => {}; resolve(code); };
        const timer = setTimeout(() => kill(124, "Stopped: the script ran longer than 60 seconds."), 60000);
        busy = () => { clearTimeout(timer); kill(130, "^C"); };
        const pendingWrites = [];
        worker.onmessage = (e) => {
          const m = e.data;
          if (m.type === "file") {
            const job = m.bytes ? api.writeBinary(abs(m.path), m.bytes) : Promise.resolve(api.write(abs(m.path), m.text));
            pendingWrites.push(job.then(() => wl(`${C.dim}wrote ${m.path}${m.bytes ? ` (${F.blobs.human(m.bytes.byteLength)})` : ""}${C.reset}`)).catch((err) => io.err(`couldn't save ${m.path}: ${err.message}`)));
            return;
          }
          if (m.type === "out") {
            if (m.stream === "raw") io.out(m.text);
            else if (m.stream === "err") io.err(m.text);
            else io.out(m.text + "\n");
          } else if (m.type === "done") { clearTimeout(timer); Promise.all(pendingWrites).then(() => kill(m.code)); }
        };
        worker.onerror = (e) => { clearTimeout(timer); kill(1, e.message); };
        const text = Object.fromEntries(Object.entries(files()).map(([k, v]) => [k, F.blobs?.isBlob(v) ? null : v]));
        worker.postMessage({ files: text, entry: path, args, base: new URL(".", location.href).href });
      });
    }

    let pyWorker = null;
    /** Runs Python in a persistent Pyodide worker (kept warm between runs). */
    function runPython(job, io = termIO) {
      return new Promise(async (resolve) => {
        if (!pyWorker) pyWorker = new Worker(URL.createObjectURL(new Blob([PY_WORKER_SRC], { type: "text/javascript" })), { type: "module" });
        const w = pyWorker;
        const id = Math.random().toString(36).slice(2);
        const pendingWrites = [];
        const finish = (code, msg) => { clearTimeout(timer); w.removeEventListener("message", on); if (msg) io.err(msg); busy = () => {}; Promise.all(pendingWrites).then(() => resolve(code)); };
        const timer = setTimeout(() => { w.terminate(); pyWorker = null; finish(124, "Stopped: Python ran longer than 3 minutes."); }, 180000);
        busy = () => { w.terminate(); pyWorker = null; finish(130, "^C"); };
        function on(e) {
          const m = e.data;
          if (m.id !== id) return;
          if (m.type === "out") { if (m.stream === "err") io.err(m.text); else if (m.stream === "dim") wl(`${C.dim}${m.text.replace(/\n/g, "\r\n")}${C.reset}`); else io.out(m.text + "\n"); }
          if (m.type === "file") pendingWrites.push((m.bytes ? api.writeBinary(m.path, m.bytes) : Promise.resolve(api.write(m.path, m.text))).then(() => wl(`${C.dim}wrote ${m.path}${C.reset}`)));
          if (m.type === "done") finish(m.code);
        }
        w.addEventListener("message", on);
        const files = {};
        for (const [k, v] of Object.entries(api.files())) {
          if (F.blobs?.isBlob(v)) { const b = await F.blobs.get(v); if (b && b.size < 20 * 1048576) files[k] = await b.arrayBuffer(); }
          else files[k] = v;
        }
        w.postMessage({ ...job, id, files, base: window.FIZZ_PYODIDE_BASE || PYODIDE_CDN });
      });
    }

    // ---------- the shell ----------
    const S = F.shell;
    const vars = { HOME: "/", PWD: "/", SHELL: "/bin/fizzsh", TERM: "xterm-256color", LANG: "en_US.UTF-8", "?": "0" };
    let cloudMode = false, lastCode = 0;
    const slug = (s, d) => String(s || d).toLowerCase().normalize("NFKD").replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "") || d;
    const userSlug = () => slug(api.userName?.(), "user");
    const projSlug = () => slug(api.projectName(), "project");
    vars.USER = userSlug();

    const HELP = [
      ["Files", "ls [-la]  tree  cd  pwd  cat  head  tail  less  touch  mkdir [-p]  rm [-rf]  rmdir  cp [-r]  mv  find  du  stat  file"],
      ["Text", "echo  printf  grep [-inrvclE]  sed [-i]  awk  sort [-rnu]  uniq [-c]  cut  tr  wc  nl  rev  tac  tee  diff  xargs  jq  base64  sha256sum"],
      ["Run", "node file.js  python file.py  python -c \"…\"  pip install pkg  curl/wget URL  zip/unzip"],
      ["Shell", "a | b   a && b   a || b   a ; b   > file   >> file   < file   2>&1   $VAR   export X=1   *.js   ~"],
      ["Editor", "open/code/nano/vim file   preview [file.html]   history   clear   whoami   date   uname   env   which"],
      ["Cloud", "npm  npx  git  make  gcc  cargo  go  java  … and anything else run in real Linux bash in the cloud sandbox. 'cloud' switches every command to the cloud."],
    ];

    const err = (io, cmd, msg) => { io.err(`${cmd}: ${msg}`); return 1; };
    const inputOf = async (io, cmd, paths) => {
      if (!paths.length) return io.stdin ?? "";
      let s = "";
      for (const a of paths) { const p = abs(a); if (!isFile(p)) { io.err(`${cmd}: ${a}: No such file or directory`); continue; } const v = files()[p]; s += F.blobs?.isBlob(v) ? "" : v; }
      return s;
    };
    const flags = (args, spec = "") => {
      const f = {}, rest = [];
      for (let k = 0; k < args.length; k++) {
        const a = args[k];
        if (a === "--") { rest.push(...args.slice(k + 1)); break; }
        if (/^-[A-Za-z]+$/.test(a) && a.length > 1) { for (const ch of a.slice(1)) { if (spec.includes(ch + ":")) { f[ch] = args[++k]; } else f[ch] = true; } continue; }
        if (/^-\d+$/.test(a)) { f.n = a.slice(1); continue; }
        if (/^--[\w-]+(=.*)?$/.test(a)) { const [k2, v] = a.slice(2).split("="); f[k2] = v ?? true; continue; }
        rest.push(a);
      }
      return [f, rest];
    };
    const allPaths = () => { const set = new Set(); for (const f of Object.keys(files())) { set.add(f); const parts = f.split("/"); for (let k = 1; k < parts.length; k++) set.add(parts.slice(0, k).join("/")); } return [...set]; };
    function expandGlobs(cmd) {
      const out = [];
      cmd.argv.forEach((a, k) => {
        if (!cmd.globs[k]) return out.push(a);
        const absPat = abs(a);
        const re = S.globRe(absPat);
        const hits = allPaths().filter((p) => re.test(p) && !p.split("/").pop().startsWith(".")).sort();
        if (!hits.length) return out.push(a);
        const prefix = cwd ? cwd + "/" : "";
        out.push(...hits.map((h) => (a.startsWith("/") ? "/" + h : h.startsWith(prefix) ? h.slice(prefix.length) : "/" + h)));
      });
      return out;
    }

    /** Built-in commands: (args, io) → exit code. io: { stdin, out(text), err(text), tty } */
    const B = {
      help(a, io) { io.out(`${C.bold}FIZZ DEV terminal${C.reset} — your project at fizzdev/${userSlug()}/${projSlug()}\n`); for (const [k, v] of HELP) io.out(`  ${C.bold}${k.padEnd(7)}${C.reset} ${v}\n`); io.out(`${C.dim}${api.sandboxAvailable?.() ? "The cloud sandbox is on: npm, git and other programs run in real Linux." : "The cloud sandbox is off on this site, so npm, git and other programs can't run (the site owner sets FIZZ_SANDBOX=on)."}${C.reset}\n`); return 0; },
      clear() { term.clear(); return 0; },
      pwd(a, io) { io.out("/" + cwd + "\n"); return 0; },
      cd(a, io) { const t = a[0] === "-" ? vars.OLDPWD?.slice(1) ?? "" : abs(a[0] || "/"); if (!isDir(t)) return err(io, "cd", `${a[0]}: No such file or directory`); vars.OLDPWD = "/" + cwd; cwd = t; vars.PWD = "/" + cwd; return 0; },
      ls(a, io) {
        const [f, rest] = flags(a);
        if (f.n === "1") f["1"] = true;
        const targets = rest.length ? rest : [""];
        let code = 0;
        targets.forEach((t, k) => {
          const p = abs(t);
          if (isFile(p)) { io.out(t + "\n"); return; }
          if (!isDir(p)) { io.err(`ls: cannot access '${t}': No such file or directory`); code = 2; return; }
          if (targets.length > 1) io.out(`${k ? "\n" : ""}${t}:\n`);
          const items = list(p).filter(([n]) => f.a || f.A || !n.startsWith("."));
          if (f.l) {
            io.out(`total ${items.length}\n`);
            for (const [n, ty] of items) {
              const full = p ? `${p}/${n}` : n, v = files()[full];
              const size = ty === "dir" ? Object.keys(files()).filter((x) => x.startsWith(full + "/")).length : F.blobs?.isBlob(v) ? F.blobs.info(v)?.size || 0 : new TextEncoder().encode(v || "").length;
              io.out(`${ty === "dir" ? "drwxr-xr-x" : "-rw-r--r--"} 1 ${userSlug()} fizzdev ${String(f.h ? S.human(size) : size).padStart(8)} ${ty === "dir" ? `${C.bold}${n}/${C.reset}` : n}\n`);
            }
          } else if (!io.tty || f["1"]) items.forEach(([n]) => io.out(n + "\n"));
          else if (items.length) io.out(items.map(([n, ty]) => (ty === "dir" ? `${C.bold}${n}/${C.reset}` : n)).join("  ") + "\n");
        });
        return code;
      },
      dir(a, io) { return B.ls(a, io); },
      tree(a, io) {
        const [f, rest] = flags(a, "L:");
        const max = Number(f.L) || 99;
        let dirs = 0, nfiles = 0;
        const walk = (d, indent, depth) => list(d).filter(([n]) => f.a || !n.startsWith(".")).forEach(([n, t], i, arr) => {
          const last = i === arr.length - 1;
          io.out(`${indent}${last ? "└── " : "├── "}${t === "dir" ? `${C.bold}${n}${C.reset}` : n}\n`);
          if (t === "dir") { dirs++; if (depth < max) walk(d ? `${d}/${n}` : n, indent + (last ? "    " : "│   "), depth + 1); } else nfiles++;
        });
        io.out((rest[0] || ".") + "\n"); walk(abs(rest[0] || ""), "", 1); io.out(`\n${dirs} director${dirs === 1 ? "y" : "ies"}, ${nfiles} file${nfiles === 1 ? "" : "s"}\n`);
        return 0;
      },
      async cat(a, io) {
        const [f, rest] = flags(a);
        if (!rest.length) { io.out(io.stdin ?? ""); return 0; }
        let code = 0;
        for (const x of rest) {
          const p = abs(x);
          if (!isFile(p)) { io.err(`cat: ${x}: No such file or directory`); code = 1; continue; }
          const v = files()[p];
          if (F.blobs?.isBlob(v)) { io.err(`cat: ${x}: binary file (${F.blobs.describe(v)})`); continue; }
          io.out(f.n ? S.lines(v).map((l, i) => `${String(i + 1).padStart(6)}\t${l}`).join("\n") + "\n" : v.endsWith("\n") || !v ? v : v + "\n");
        }
        return code;
      },
      async head(a, io, cmd = "head") {
        const [f, rest] = flags(a, "n:c:");
        const n = Number(f.n ?? 10);
        const s = await inputOf(io, cmd, rest);
        if (f.c) { io.out(cmd === "head" ? s.slice(0, Number(f.c)) : s.slice(-Number(f.c))); return 0; }
        const ls = S.lines(s);
        const pick = cmd === "head" ? ls.slice(0, n) : ls.slice(-n);
        if (pick.length) io.out(pick.join("\n") + "\n");
        return 0;
      },
      tail(a, io) { return B.head(a, io, "tail"); },
      async wc(a, io) {
        const [f, rest] = flags(a);
        const all = !f.l && !f.w && !f.c && !f.m;
        const row = (s, name) => [all || f.l ? S.lines(s).length + (s && !s.endsWith("\n") ? 0 : 0) : null, all || f.w ? s.split(/\s+/).filter(Boolean).length : null, all || f.c || f.m ? new TextEncoder().encode(s).length : null].filter((x) => x !== null).map((x) => String(x).padStart(7)).join(" ") + (name ? ` ${name}` : "");
        if (!rest.length) { io.out(row(io.stdin ?? "") + "\n"); return 0; }
        for (const x of rest) { const p = abs(x); if (!isFile(p)) { io.err(`wc: ${x}: No such file or directory`); continue; } io.out(row(files()[p], x) + "\n"); }
        return 0;
      },
      async grep(a, io) {
        const [f, rest] = flags(a, "e:m:A:B:C:");
        const pat = f.e ?? rest.shift();
        if (pat == null) return err(io, "grep", "usage: grep [-inrvclowE] pattern [file…]");
        let re;
        try { re = new RegExp(f.F ? pat.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : pat.replace(/\\\|/g, "|").replace(/\\\(/g, "(").replace(/\\\)/g, ")"), f.i ? "i" : ""); } catch (e) { return err(io, "grep", e.message); }
        if (f.w) re = new RegExp(`\\b(?:${re.source})\\b`, re.flags);
        const recursive = f.r || f.R;
        let sources;
        if (!rest.length && !recursive) sources = [["", io.stdin ?? ""]];
        else {
          const bases = (rest.length ? rest : ["."]).map(abs);
          sources = [];
          for (const b of bases) {
            if (isFile(b)) sources.push([b, files()[b]]);
            else if (recursive && isDir(b)) Object.keys(files()).filter((x) => (!b || x.startsWith(b + "/")) && !x.includes("node_modules/")).sort().forEach((x) => sources.push([x, files()[x]]));
            else io.err(`grep: ${b || "."}: ${isDir(b) ? "Is a directory" : "No such file or directory"}`);
          }
        }
        const multi = sources.length > 1 || recursive;
        let hits = 0;
        for (const [name, text] of sources) {
          if (typeof text !== "string" || F.blobs?.isBlob(text)) continue;
          let n = 0;
          S.lines(text).forEach((l, k) => {
            const ok = re.test(l) !== Boolean(f.v);
            if (!ok) return;
            n++; hits++;
            if (f.c || f.l || f.q) return;
            const shown = f.o ? (l.match(new RegExp(re.source, re.flags + "g")) || []).join("\n") : io.tty ? l.replace(new RegExp(re.source, re.flags + "g"), (m) => `${C.red}${C.bold}${m}${C.reset}`) : l;
            io.out(`${multi ? (io.tty ? `${C.magenta}${name}${C.reset}:` : `${name}:`) : ""}${f.n ? (io.tty ? `${C.green}${k + 1}${C.reset}:` : `${k + 1}:`) : ""}${shown}\n`);
          });
          if (f.c) io.out(`${multi ? name + ":" : ""}${n}\n`);
          if (f.l && n) io.out(name + "\n");
        }
        return hits ? 0 : 1;
      },
      egrep(a, io) { return B.grep(["-E", ...a], io); },
      find(a, io) {
        let base = "", k = 0;
        if (a[0] && !a[0].startsWith("-")) { base = a[0]; k = 1; }
        let name = null, iname = null, type = null, maxdepth = 99;
        for (; k < a.length; k++) {
          if (a[k] === "-name") name = S.globRe(a[++k]);
          else if (a[k] === "-iname") iname = new RegExp(S.globRe(a[++k]).source, "i");
          else if (a[k] === "-type") type = a[++k];
          else if (a[k] === "-maxdepth") maxdepth = Number(a[++k]);
        }
        const root = abs(base || ".");
        if (!isDir(root) && !isFile(root)) return err(io, "find", `'${base}': No such file or directory`);
        const shown = base || ".";
        const res = (isFile(root) ? [root] : allPaths().filter((p) => !root || p === root || p.startsWith(root + "/"))).filter((p) => {
          const depth = (root ? p.slice(root.length) : "/" + p).split("/").filter(Boolean).length;
          if (depth > maxdepth) return false;
          const leaf = p.split("/").pop();
          if (name && !name.test(leaf)) return false;
          if (iname && !iname.test(leaf)) return false;
          if (type === "f" && !isFile(p)) return false;
          if (type === "d" && isFile(p)) return false;
          return true;
        }).sort();
        if (!name && !iname && type !== "f") io.out(shown + "\n");
        res.filter((p) => p !== root).forEach((p) => io.out(`${shown === "." ? "./" : shown.replace(/\/$/, "") + "/"}${root ? p.slice(root.length + 1) : p}\n`));
        return 0;
      },
      async sort(a, io) {
        const [f, rest] = flags(a, "k:t:");
        let ls = S.lines(await inputOf(io, "sort", rest));
        const key = (l) => (f.k ? (f.t ? l.split(f.t) : l.trim().split(/\s+/))[Number(f.k) - 1] ?? "" : l);
        ls.sort((x, y) => (f.n ? parseFloat(key(x)) - parseFloat(key(y)) : key(x).localeCompare(key(y))));
        if (f.r) ls.reverse();
        if (f.u) ls = ls.filter((l, i) => i === 0 || l !== ls[i - 1]);
        if (ls.length) io.out(ls.join("\n") + "\n");
        return 0;
      },
      async uniq(a, io) {
        const [f, rest] = flags(a);
        const ls = S.lines(await inputOf(io, "uniq", rest));
        const groups = [];
        for (const l of ls) { if (groups.length && groups.at(-1)[0] === l) groups.at(-1)[1]++; else groups.push([l, 1]); }
        groups.filter(([, n]) => (f.d ? n > 1 : f.u ? n === 1 : true)).forEach(([l, n]) => io.out(f.c ? `${String(n).padStart(7)} ${l}\n` : l + "\n"));
        return 0;
      },
      async cut(a, io) {
        const [f, rest] = flags(a, "d:f:c:");
        const s = await inputOf(io, "cut", rest);
        const pick = (spec, arr) => spec.split(",").flatMap((r) => { const [x, y] = r.split("-"); const lo = Number(x || 1), hi = r.includes("-") ? Number(y || arr.length) : lo; return arr.slice(lo - 1, hi); });
        S.lines(s).forEach((l) => io.out((f.c ? pick(f.c, [...l]).join("") : pick(f.f || "1", l.split(f.d ?? "\t")).join(f.d ?? "\t")) + "\n"));
        return 0;
      },
      async tr(a, io) {
        const [f, rest] = flags(a);
        const s = io.stdin ?? "";
        const from = S.trSet(rest[0] || ""), to = S.trSet(rest[1] || "");
        if (f.d) { io.out([...s].filter((c) => !from.includes(c)).join("")); return 0; }
        let out = [...s].map((c) => { const k = from.indexOf(c); return k === -1 ? c : to[Math.min(k, to.length - 1)] ?? ""; }).join("");
        if (f.s) out = out.replace(new RegExp(`([${to.replace(/[\]\\^-]/g, "\\$&")}])\\1+`, "g"), "$1");
        io.out(out);
        return 0;
      },
      async nl(a, io) { S.lines(await inputOf(io, "nl", a)).forEach((l, i) => io.out(`${String(i + 1).padStart(6)}\t${l}\n`)); return 0; },
      async rev(a, io) { S.lines(await inputOf(io, "rev", a)).forEach((l) => io.out([...l].reverse().join("") + "\n")); return 0; },
      async tac(a, io) { const ls = S.lines(await inputOf(io, "tac", a)).reverse(); if (ls.length) io.out(ls.join("\n") + "\n"); return 0; },
      async sed(a, io) {
        const [f, rest] = flags(a, "e:");
        const script = f.e ?? rest.shift();
        if (!script) return err(io, "sed", "usage: sed [-i] 's/find/replace/g' [file…]");
        try {
          if (f.i) { for (const x of rest) { const p = abs(x); if (!isFile(p)) return err(io, "sed", `${x}: No such file`); api.write(p, S.sedScript(script, files()[p])); } return 0; }
          io.out(S.sedScript(script, await inputOf(io, "sed", rest)));
        } catch (e) { return err(io, "sed", e.message); }
        return 0;
      },
      async awk(a, io) {
        const [f, rest] = flags(a, "F:");
        const prog = rest.shift();
        try { io.out(S.awk(prog || "", await inputOf(io, "awk", rest), f.F)); } catch (e) { return err(io, "awk", e.message); }
        return 0;
      },
      async tee(a, io) {
        const [f, rest] = flags(a);
        const s = io.stdin ?? "";
        for (const x of rest) { const p = abs(x); api.write(p, (f.a && isFile(p) ? files()[p] : "") + s); }
        io.out(s);
        return 0;
      },
      diff(a, io) {
        const [, rest] = flags(a);
        if (rest.length !== 2) return err(io, "diff", "usage: diff file1 file2");
        const [x, y] = rest.map(abs);
        for (const [n, p] of [[rest[0], x], [rest[1], y]]) if (!isFile(p)) return err(io, "diff", `${n}: No such file or directory`);
        const out = S.lineDiff(files()[x], files()[y], rest[0], rest[1]);
        out.forEach((l) => io.out((io.tty ? (l.startsWith("+") && !l.startsWith("+++") ? C.green + l + C.reset : l.startsWith("-") && !l.startsWith("---") ? C.red + l + C.reset : l) : l) + "\n"));
        return out.length ? 1 : 0;
      },
      async xargs(a, io) {
        const [f, rest] = flags(a, "n:I:");
        const words = (io.stdin ?? "").split(/\s+/).filter(Boolean);
        if (!rest.length) rest.push("echo");
        const batches = f.n ? Array.from({ length: Math.ceil(words.length / Number(f.n)) }, (_, k) => words.slice(k * Number(f.n), (k + 1) * Number(f.n))) : [words];
        let code = 0;
        for (const b of f.I ? words.map((w) => [w]) : batches) code = await runArgv(f.I ? rest.map((r) => r.split(f.I).join(b[0])) : [...rest, ...b], { ...io, stdin: "" });
        return code;
      },
      async jq(a, io) {
        const [f, rest] = flags(a);
        const expr = rest.shift() ?? ".";
        let data;
        try { data = JSON.parse(await inputOf(io, "jq", rest)); } catch (e) { return err(io, "jq", `invalid JSON: ${e.message}`); }
        const v = S.jq(data, expr);
        const show = (x) => io.out((f.r && typeof x === "string" ? x : JSON.stringify(x, null, f.c ? 0 : 2)) + "\n");
        if (/\[\]$/.test(expr) && Array.isArray(v)) v.forEach(show); else show(v);
        return 0;
      },
      async base64(a, io) {
        const [f, rest] = flags(a);
        const s = await inputOf(io, "base64", rest);
        try { io.out(f.d ? new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\s+/g, "")), (c) => c.charCodeAt(0))) : btoa(String.fromCharCode(...new TextEncoder().encode(s))) + "\n"); } catch { return err(io, "base64", "invalid input"); }
        return 0;
      },
      async sha256sum(a, io, algo = "SHA-256") {
        for (const x of a.length ? a : ["-"]) {
          const s = x === "-" ? io.stdin ?? "" : isFile(abs(x)) ? files()[abs(x)] : null;
          if (s == null) { io.err(`${algo}: ${x}: No such file`); continue; }
          const h = [...new Uint8Array(await crypto.subtle.digest(algo, new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, "0")).join("");
          io.out(`${h}  ${x}\n`);
        }
        return 0;
      },
      sha1sum(a, io) { return B.sha256sum(a, io, "SHA-1"); },
      touch(a, io) { if (!a.length) return err(io, "touch", "missing file operand"); for (const x of a.filter((y) => !y.startsWith("-"))) { const p = abs(x); if (!isFile(p)) api.write(p, ""); } return 0; },
      mkdir(a, io) {
        const [f, rest] = flags(a);
        if (!rest.length) return err(io, "mkdir", "missing operand");
        for (const x of rest) { const p = abs(x); if (isDir(p) && !f.p) { io.err(`mkdir: cannot create directory '${x}': File exists`); continue; } if (!isDir(p)) api.write(`${p}/.gitkeep`, ""); }
        return 0;
      },
      rmdir(a, io) { for (const x of a) { const p = abs(x); const inside = Object.keys(files()).filter((y) => y.startsWith(p + "/")); if (inside.some((y) => !y.endsWith("/.gitkeep"))) return err(io, "rmdir", `failed to remove '${x}': Directory not empty`); inside.forEach((y) => api.remove(y)); } return 0; },
      rm(a, io) {
        const [f, rest] = flags(a);
        let code = 0;
        for (const x of rest) {
          const p = abs(x);
          if (!p) { io.err("rm: refusing to remove the project root (use the project menu to delete a project)"); code = 1; continue; }
          if (isFile(p)) api.remove(p);
          else if (isDir(p)) { if (!f.r && !f.R) { io.err(`rm: cannot remove '${x}': Is a directory`); code = 1; continue; } Object.keys(files()).filter((y) => y.startsWith(p + "/")).forEach((y) => api.remove(y)); }
          else if (!f.f) { io.err(`rm: cannot remove '${x}': No such file or directory`); code = 1; }
        }
        return code;
      },
      mv(a, io, cmd = "mv") {
        const [f, rest] = flags(a);
        if (rest.length < 2) return err(io, cmd, "missing destination file operand");
        const dest = abs(rest.pop());
        const intoDir = rest.length > 1 || (isDir(dest) && !isFile(dest));
        for (const x of rest) {
          const from = abs(x);
          const to = intoDir ? `${dest ? dest + "/" : ""}${from.split("/").pop()}` : dest;
          if (isFile(from)) { api.write(to, files()[from]); if (cmd === "mv") api.remove(from); }
          else if (isDir(from) && from) {
            if (cmd === "cp" && !f.r && !f.R && !f.a) { io.err(`cp: -r not specified; omitting directory '${x}'`); continue; }
            Object.keys(files()).filter((y) => y.startsWith(from + "/")).forEach((y) => { api.write(to + y.slice(from.length), files()[y]); if (cmd === "mv") api.remove(y); });
          } else { io.err(`${cmd}: cannot stat '${x}': No such file or directory`); return 1; }
        }
        return 0;
      },
      cp(a, io) { return B.mv(a, io, "cp"); },
      ln(a, io) { const [, rest] = flags(a); return B.mv(["-r", ...rest], io, "cp"); },
      echo(a, io) { const [f, rest] = (a[0] === "-n" || a[0] === "-e" || a[0] === "-ne" || a[0] === "-en") ? [{ n: a[0].includes("n"), e: a[0].includes("e") }, a.slice(1)] : [{}, a]; const s = rest.join(" "); io.out((f.e ? S.unescapeE(s) : s) + (f.n ? "" : "\n")); return 0; },
      printf(a, io) { let k = 1; const fmt = S.unescapeE(a[0] ?? ""); io.out(fmt.replace(/%(-?\d*)([sdfx%])/g, (m, w, t) => { if (t === "%") return "%"; const v = a[k++] ?? ""; const s = t === "d" ? String(parseInt(v, 10) || 0) : t === "f" ? (parseFloat(v) || 0).toFixed(6) : t === "x" ? (parseInt(v, 10) || 0).toString(16) : v; return w ? (w.startsWith("-") ? s.padEnd(-w) : s.padStart(w)) : s; })); return 0; },
      basename(a, io) { let b = (a[0] || "").replace(/\/+$/, "").split("/").pop(); if (a[1] && b.endsWith(a[1])) b = b.slice(0, -a[1].length); io.out(b + "\n"); return 0; },
      dirname(a, io) { const p = (a[0] || "").replace(/\/+$/, ""); io.out((p.includes("/") ? p.slice(0, p.lastIndexOf("/")) || "/" : ".") + "\n"); return 0; },
      realpath(a, io) { io.out("/" + abs(a[0] || ".") + "\n"); return 0; },
      readlink(a, io) { return B.realpath(a.filter((x) => !x.startsWith("-")), io); },
      du(a, io) {
        const [f, rest] = flags(a);
        const p = abs(rest[0] || ".");
        const size = (x) => { const v = files()[x]; return F.blobs?.isBlob(v) ? F.blobs.info(v)?.size || 0 : new TextEncoder().encode(v || "").length; };
        const total = Object.keys(files()).filter((x) => !p || x === p || x.startsWith(p + "/")).reduce((n, x) => n + size(x), 0);
        io.out(`${f.h ? S.human(total) : Math.ceil(total / 1024)}\t${rest[0] || "."}\n`);
        return 0;
      },
      stat(a, io) { for (const x of a) { const p = abs(x); if (!isFile(p) && !isDir(p)) { io.err(`stat: cannot stat '${x}': No such file or directory`); continue; } const v = files()[p]; io.out(`  File: ${x}\n  Size: ${isFile(p) ? (F.blobs?.isBlob(v) ? F.blobs.info(v)?.size : new TextEncoder().encode(v).length) : 0}\t${isFile(p) ? "regular file" : "directory"}\n`); } return 0; },
      file(a, io) { for (const x of a) { const p = abs(x); const v = files()[p]; io.out(`${x}: ${v === undefined ? (isDir(p) ? "directory" : "cannot open (No such file or directory)") : F.blobs?.isBlob(v) ? F.blobs.describe(v) : /^\s*</.test(v) ? "HTML document, UTF-8 text" : /^#!/.test(v) ? "script, UTF-8 text" : "UTF-8 text"}\n`); } return 0; },
      which(a, io) { let code = 0; for (const x of a) { if (B[x] || RUNNERS.has(x)) io.out(`/usr/bin/${x}\n`); else if (api.sandboxAvailable?.()) io.out(`${x}: runs in the cloud sandbox\n`); else { io.err(`which: no ${x}`); code = 1; } } return code; },
      type(a, io) { return B.which(a, io); },
      command(a, io) { return a[0] === "-v" ? B.which(a.slice(1), io) : runArgv(a, io); },
      env(a, io) { Object.entries(vars).filter(([k]) => k !== "?").forEach(([k, v]) => io.out(`${k}=${v}\n`)); return 0; },
      printenv(a, io) { if (a[0]) { if (vars[a[0]] === undefined) return 1; io.out(vars[a[0]] + "\n"); return 0; } return B.env(a, io); },
      export(a) { for (const x of a) { const k = x.indexOf("="); if (k > 0) vars[x.slice(0, k)] = x.slice(k + 1); } return 0; },
      set(a, io) { return B.env(a, io); },
      unset(a) { for (const x of a) delete vars[x]; return 0; },
      alias(a, io) { io.err("alias: not supported here"); return 1; },
      source(a, io) { const p = abs(a[0] || ""); if (!isFile(p)) return err(io, "source", `${a[0]}: No such file`); return runScript(files()[p], io); },
      history(a, io) { history.slice().reverse().forEach((h, i) => io.out(`${String(i + 1).padStart(5)}  ${h}\n`)); return 0; },
      date(a, io) { const d = new Date(); io.out((a[0] === "-u" ? d.toUTCString() : a[0] === "+%s" ? String(Math.floor(d / 1000)) : a[0]?.startsWith("+") ? a[0].slice(1).replace(/%Y/g, d.getFullYear()).replace(/%m/g, String(d.getMonth() + 1).padStart(2, "0")).replace(/%d/g, String(d.getDate()).padStart(2, "0")).replace(/%H/g, String(d.getHours()).padStart(2, "0")).replace(/%M/g, String(d.getMinutes()).padStart(2, "0")).replace(/%S/g, String(d.getSeconds()).padStart(2, "0")) : d.toString()) + "\n"); return 0; },
      whoami(a, io) { io.out(userSlug() + "\n"); return 0; },
      id(a, io) { io.out(`uid=1000(${userSlug()}) gid=1000(fizzdev) groups=1000(fizzdev)\n`); return 0; },
      hostname(a, io) { io.out("fizzdev\n"); return 0; },
      uname(a, io) { io.out((a.includes("-a") ? `FIZZDEV fizzdev 1.0 ${navigator.platform || "web"} browser` : "FIZZDEV") + "\n"); return 0; },
      true: () => 0,
      false: () => 1,
      exit(a) { return Number(a[0]) || 0; },
      async sleep(a) { const ms = Math.min(600, parseFloat(a[0]) || 0) * 1000; await new Promise((r) => { const t = setTimeout(r, ms); busy = () => { clearTimeout(t); r(); }; }); busy = () => {}; return 0; },
      seq(a, io) { const n = a.map(Number); const [lo, step, hi] = n.length === 1 ? [1, 1, n[0]] : n.length === 2 ? [n[0], 1, n[1]] : n; for (let x = lo, k = 0; step > 0 ? x <= hi : x >= hi; x += step) { io.out(x + "\n"); if (++k > 100000) break; } return 0; },
      yes(a, io) { for (let k = 0; k < 1000; k++) io.out((a.join(" ") || "y") + "\n"); return 0; },
      async curl(a, io, cmd = "curl") {
        const [f, rest] = flags(a, "o:O:X:H:d:");
        const url = rest.find((x) => /^https?:\/\//i.test(x) || /^[\w-]+(\.[\w-]+)+/.test(x));
        if (!url) return err(io, cmd, "no URL given");
        const full = /^https?:\/\//i.test(url) ? url : `https://${url}`;
        let body;
        try { body = (await F.conn.web.read(full, 200000, { raw: true })).text; } catch (e) { return err(io, cmd, e.message); }
        const out = f.o || (f.O || cmd === "wget" ? full.split("/").filter(Boolean).pop().split("?")[0] || "index.html" : null);
        if (out) { api.write(abs(out), body); if (!f.s) io.err(`${C.dim}saved ${out} (${body.length} bytes)${C.reset}`); } else io.out(body.endsWith("\n") ? body : body + "\n");
        return 0;
      },
      wget(a, io) { return B.curl(a, io, "wget"); },
      async zip(a, io) {
        const [, rest] = flags(a);
        const name = rest.shift();
        if (!name || !rest.length || !window.JSZip) return err(io, "zip", "usage: zip -r out.zip path…");
        const z = new JSZip();
        for (const x of rest) { const p = abs(x); for (const k of Object.keys(files()).filter((y) => y === p || y.startsWith(p + "/") || !p)) { const v = files()[k]; z.file(k, F.blobs?.isBlob(v) ? await F.blobs.get(v) : v); } }
        const blob = await z.generateAsync({ type: "uint8array" });
        await api.writeBinary(abs(name), blob);
        io.out(`  created ${name} (${S.human(blob.length)})\n`);
        return 0;
      },
      async unzip(a, io) {
        const [, rest] = flags(a);
        const p = abs(rest[0] || "");
        const v = files()[p];
        if (!v || !F.blobs?.isBlob(v) || !window.JSZip) return err(io, "unzip", `cannot find ${rest[0] || "zipfile"}`);
        const z = await JSZip.loadAsync(await F.blobs.get(v));
        for (const [name, entry] of Object.entries(z.files)) {
          if (entry.dir) continue;
          const to = abs(name);
          if (/\.(png|jpe?g|gif|webp|ico|pdf|zip|woff2?|ttf|otf|mp3|mp4|wav)$/i.test(name)) await api.writeBinary(to, await entry.async("uint8array"));
          else api.write(to, await entry.async("string"));
          io.out(`  inflating: ${name}\n`);
        }
        return 0;
      },
      open(a, io) { const p = abs(a[0] || ""); if (!isFile(p)) { if (!a[0]) return err(io, "open", "missing file"); api.write(p, ""); } api.openFile(p); io.err(`${C.dim}Opened ${p} in the editor.${C.reset}`); return 0; },
      preview(a, io) { const p = a[0] ? abs(a[0]) : ""; if (p && !isFile(p)) return err(io, "preview", `${a[0]}: No such file`); api.preview(p); io.err(`${C.dim}Preview opened.${C.reset}`); return 0; },
      async python(a, io) {
        if (a[0] === "-c") return runPython({ kind: "run", code: a.slice(1).join(" "), entry: "", args: [] }, io);
        if (a[0] === "-m" && a[1] === "pip") return B.pip(a.slice(2), io);
        if (a[0] === "--version" || a[0] === "-V") { io.out("Python 3.13 (Pyodide, in your browser)\n"); return 0; }
        if (!a[0]) { io.err("Usage: python file.py or python -c \"print(1+1)\" — interactive Python isn't available."); return 2; }
        const p = abs(a[0]);
        if (!isFile(p)) return err(io, "python", `can't open file '${a[0]}': No such file or directory`);
        return runPython({ kind: "run", entry: p, args: a.slice(1) }, io);
      },
      async pip(a, io) {
        if (a[0] === "list" || a[0] === "freeze") { io.out("micropip\n"); return 0; }
        if (a[0] !== "install" || !a[1]) { io.err("Usage: pip install <package> (pure-Python wheels and Pyodide packages: numpy, pandas, matplotlib…)"); return 2; }
        return runPython({ kind: "pip", pkgs: a.slice(1).filter((x) => !x.startsWith("-")) }, io);
      },
      async node(a, io) {
        if (a[0] === "--version" || a[0] === "-v") { io.out("v22 (FIZZ DEV browser runner)\n"); return 0; }
        if (a[0] === "-e" || a[0] === "-p") { const tmp = `.fizz-eval-${Date.now()}.js`; api.write(tmp, a[0] === "-p" ? `console.log(${a.slice(1).join(" ")})` : a.slice(1).join(" ")); try { return await runNode(tmp, [], io); } finally { api.remove(tmp); } }
        if (!a[0]) { io.err("Usage: node file.js — interactive Node isn't available in the browser."); return 2; }
        const p = abs(a[0]);
        if (!isFile(p)) return err(io, "node", `Cannot find module '${a[0]}'`);
        return runNode(p, a.slice(1), io);
      },
      cloud(a, io) {
        if (!a.length) { cloudMode = !cloudMode; io.out(cloudMode ? `Every command now runs in the cloud sandbox (real Linux). Type 'cloud' again to switch back.\n` : "Commands run in the browser again (npm, git and other programs still go to the cloud).\n"); return 0; }
        return runCloud(a.join(" "), io);
      },
    };
    B.python3 = B.python; B.pip3 = B.pip; B.ll = (a, io) => B.ls(["-la", ...a], io);
    for (const ed of ["code", "nano", "vim", "vi", "edit", "subl"]) B[ed] = B.open;
    B.less = B.more = (a, io) => B.cat(a, io);
    const RUNNERS = new Set(Object.keys(B));

    /** Runs a command line in real bash in the cloud sandbox, in the current folder. */
    async function runCloud(line, io, { background = false } = {}) {
      if (!api.sandboxAvailable?.() || !api.sandbox) {
        io.err(`${line.split(/\s+/)[0]}: this needs a real Linux machine. FIZZ DEV's cloud sandbox isn't turned on for this site (the site owner sets FIZZ_SANDBOX=on in Vercel). Everything else in this terminal works in your browser — type 'help'.`);
        return 127;
      }
      io.err(`${C.dim}running in the cloud sandbox…${C.reset}`);
      let stopped = false;
      busy = () => { stopped = true; };
      try {
        const r = await api.sandbox(cwd ? `cd ${JSON.stringify(cwd)} && ${line}` : line, { background, isStopped: () => stopped });
        if (stopped) { io.err("^C (the command keeps running in the sandbox)"); return 130; }
        if (r.text) io.out(r.text.endsWith("\n") ? r.text : r.text + "\n");
        if (r.changed?.length) io.err(`${C.dim}updated ${r.changed.length} file${r.changed.length === 1 ? "" : "s"} in the project${C.reset}`);
        if (background && r.url) io.err(`${C.dim}running in the background — ${r.url}${C.reset}`);
        return background ? 0 : Number(r.exitCode ?? 0);
      } catch (e) { io.err(`cloud: ${e.message}`); return 1; } finally { busy = () => {}; }
    }

    async function runArgv(argv, io) {
      const [cmd, ...args] = argv;
      if (!cmd) return 0;
      if (B[cmd] && !(cloudMode && cmd !== "cloud" && cmd !== "clear" && cmd !== "help" && cmd !== "cd" && cmd !== "open" && cmd !== "preview")) return (await B[cmd](args, io)) ?? 0;
      return runCloud(argv.map((x) => (/[\s"'$&|;<>*?()]/.test(x) ? `'${x.replace(/'/g, "'\\''")}'` : x)).join(" "), io);
    }

    const DEVNULL = (p) => p === "/dev/null";
    async function runPipeline(pipeline, tty) {
      let input = null, code = 0;
      for (let k = 0; k < pipeline.length; k++) {
        const c = pipeline[k];
        c.argv = c.argv.map((x) => S.expandVars(x, vars));
        for (const r of c.redirs) if (r.path) r.path = S.expandVars(r.path, vars);
        const argv = expandGlobs(c);
        // VAR=value on its own sets a variable; VAR=value cmd sets it for the command (kept simple: for the session).
        while (argv.length && /^[A-Za-z_]\w*=/.test(argv[0])) { const a = argv.shift(); vars[a.slice(0, a.indexOf("="))] = a.slice(a.indexOf("=") + 1); }
        if (!argv.length) continue;
        const outR = c.redirs.filter((r) => r.op === ">" || r.op === ">>" || r.op === "&>");
        const errR = c.redirs.find((r) => r.op === "2>" || r.op === "2>>");
        const inR = c.redirs.find((r) => r.op === "<");
        const both = c.redirs.some((r) => r.op === "2>&1" || r.op === "&>");
        const last = k === pipeline.length - 1;
        const toTerm = last && !outR.length;
        let buf = "", ebuf = "";
        const io = {
          tty: toTerm && tty,
          stdin: inR ? (isFile(abs(inR.path)) ? files()[abs(inR.path)] : (io0err(`${inR.path}: No such file or directory`), "")) : input,
          out: (s) => { if (toTerm) w(String(s).replace(/\n/g, "\r\n")); else buf += s; },
          err: (s) => { const line = String(s).endsWith("\n") ? String(s) : s + "\n"; if (errR) { if (!DEVNULL(errR.path)) ebuf += line.replace(/\x1b\[[0-9;]*m/g, ""); } else if (both && !toTerm) buf += line.replace(/\x1b\[[0-9;]*m/g, ""); else w(`${C.red}${line.replace(/\n/g, "\r\n")}${C.reset}`); },
        };
        code = await runArgv(argv, io);
        for (const r of outR) if (!DEVNULL(r.path)) { const p = abs(r.path); api.write(p, (r.op === ">>" && isFile(p) ? files()[p] : "") + buf); }
        if (errR && !DEVNULL(errR.path)) { const p = abs(errR.path); api.write(p, (errR.op === "2>>" && isFile(p) ? files()[p] : "") + ebuf); }
        input = outR.length ? "" : buf;
      }
      return code;
    }
    const io0err = (s) => w(`${C.red}${s}${C.reset}\r\n`);

    async function runScript(text, io) { let code = 0; for (const l of text.split("\n")) if (l.trim() && !l.trim().startsWith("#")) code = await execLine(l, true); return code; }

    async function execLine(raw, tty = true) {
      let list;
      try { list = S.parse(S.lex(raw, vars)); } catch (e) { io0err(`fizzsh: ${e.message}`); return 2; }
      // Lines with programs that need real Linux go to the cloud as a whole, so pipes and && keep working there.
      const firstWords = list.flatMap((it) => it.pipeline.map((c) => c.argv.find((x) => !/^[A-Za-z_]\w*=/.test(x)))).filter(Boolean);
      const needsCloud = cloudMode ? !firstWords.every((x) => ["cloud", "clear", "help", "cd", "open", "preview"].includes(x)) : firstWords.some((x) => !B[x]);
      if (needsCloud && !cloudMode && !api.sandboxAvailable?.()) {
        const unknown = firstWords.find((x) => !B[x] && !S.CLOUD.has(x));
        if (unknown) { io0err(`${unknown}: command not found (type 'help' to see what runs here)`); return 127; }
      }
      if (needsCloud && !(firstWords.length === 1 && firstWords[0] === "cloud")) {
        const ioT = { tty, stdin: null, out: (s) => w(String(s).replace(/\n/g, "\r\n")), err: (s) => w(`${String(s).startsWith("\x1b") ? "" : C.red}${String(s).replace(/\n/g, "\r\n")}${C.reset}\r\n`) };
        const bg = /&\s*$/.test(raw.trim()) && !/&&\s*$/.test(raw.trim());
        const line = raw.trim().replace(/\$\{?([A-Za-z_]\w*)\}?/g, (m, n) => (vars[n] !== undefined && !["HOME", "PWD", "SHELL", "TERM"].includes(n) ? vars[n] : m));
        return runCloud(bg ? line.replace(/&\s*$/, "") : line, ioT, { background: bg });
      }
      let code = 0;
      for (const item of list) {
        if (item.cond === "&&" && code !== 0) continue;
        if (item.cond === "||" && code === 0) continue;
        code = await runPipeline(item.pipeline, tty);
        vars["?"] = String(code);
      }
      return code;
    }

    function redraw() {
      w("\r\x1b[2K" + prompt() + line);
      const back = line.length - pos;
      if (back > 0) w(`\x1b[${back}D`);
    }

    async function submit() {
      wl();
      const cmd = line;
      line = ""; pos = 0; hIdx = -1;
      if (cmd.trim()) { history.unshift(cmd); history = history.slice(0, 200); }
      busy = () => {};
      try { lastCode = cmd.trim() ? await execLine(cmd) : lastCode; } catch (e) { wl(`${C.red}${e.message}${C.reset}`); lastCode = 1; }
      vars["?"] = String(lastCode);
      busy = null;
      w(prompt());
    }

    function complete() {
      const parts = line.slice(0, pos).split(" ");
      const word = parts.pop();
      const dirPart = word.includes("/") ? word.slice(0, word.lastIndexOf("/") + 1) : "";
      const base = abs(dirPart);
      const matches = isDir(base) ? list(base).filter(([n]) => n.startsWith(word.slice(dirPart.length))) : [];
      if (matches.length === 1) {
        const [n, t] = matches[0];
        const add = dirPart + n + (t === "dir" ? "/" : " ");
        line = [...parts, add].join(" ") + line.slice(pos);
        pos = [...parts, add].join(" ").length;
        redraw();
      } else if (matches.length > 1) {
        wl(); wl(matches.map(([n, t]) => (t === "dir" ? n + "/" : n)).join("  ")); redraw();
      }
    }

    term.onData(async (data) => {
      if (busy && busy !== null && data === "\x03") { busy(); return; }
      if (busy) return;
      if (data === "\r") return submit();
      if (data === "\x7f") { if (pos > 0) { line = line.slice(0, pos - 1) + line.slice(pos); pos--; redraw(); } return; }
      if (data === "\x03") { wl("^C"); line = ""; pos = 0; return w(prompt()); }
      if (data === "\x0c") { term.clear(); return redraw(); }
      if (data === "\t") return complete();
      if (data === "\x1b[A") { if (hIdx < history.length - 1) { hIdx++; line = history[hIdx]; pos = line.length; redraw(); } return; }
      if (data === "\x1b[B") { if (hIdx > 0) { hIdx--; line = history[hIdx]; } else { hIdx = -1; line = ""; } pos = line.length; redraw(); return; }
      if (data === "\x1b[D") { if (pos > 0) { pos--; w(data); } return; }
      if (data === "\x1b[C") { if (pos < line.length) { pos++; w(data); } return; }
      if (data.startsWith("\x1b")) return;
      const chunks = data.replace(/\r\n/g, "\r").split("\r");
      for (let i = 0; i < chunks.length; i++) {
        const text = chunks[i].replace(/[\x00-\x1f]/g, "");
        line = line.slice(0, pos) + text + line.slice(pos);
        pos += text.length;
        if (i < chunks.length - 1) { redraw(); await submit(); }
      }
      redraw();
    });

    wl(`${C.bold}FIZZ DEV${C.reset} ${C.dim}— a shell for ${api.projectName()}. Pipes, && and ~60 commands work here; npm, git and other programs run in the cloud sandbox. Type 'help'.${C.reset}`);
    w(prompt());
    return {
      focus: () => term.focus(),
      fit: doFit,
      run: async (cmd) => { line = cmd; pos = cmd.length; redraw(); await submit(); },
      // Runs a command visibly and returns what it printed (ANSI colors stripped) and whether it printed an error.
      async capture(cmd) {
        capture = [];
        line = cmd; pos = cmd.length; redraw();
        const out = capture;
        try { await submit(); } finally { capture = null; }
        const raw = out.join("");
        const lines = raw.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "").replace(/\r/g, "").split("\n").slice(0, -1);
        if (lines[0]?.trimEnd().endsWith(`$ ${cmd}`)) lines.shift();
        const text = lines.join("\n").trim();
        return { text: (text + (lastCode ? `\nexit code ${lastCode}` : "")).slice(0, 8000), failed: lastCode !== 0, code: lastCode };
      },
      reset() { cwd = ""; term.clear(); redraw(); },
      exec: (cmd) => execLine(cmd, false),
    };
  }

  window.FIZZ = window.FIZZ || {};
  window.FIZZ.createTerminal = createTerminal;
})();
