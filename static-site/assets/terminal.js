/* FIZZ DEV terminal: a real shell over the project's files, plus a sandboxed JavaScript runner (Web Worker).
   Commands that need a full OS sandbox (npm, git, python…) say so instead of pretending to run. */
(function () {
  "use strict";

  const C = { reset: "\x1b[0m", dim: "\x1b[2m", red: "\x1b[31m", green: "\x1b[32m", yellow: "\x1b[33m", cyan: "\x1b[36m", bold: "\x1b[1m" };
  const SANDBOX_ONLY = new Set(["npm", "npx", "yarn", "pnpm", "bun", "git", "deno", "cargo", "go", "java", "make", "curl", "wget", "ssh", "sudo", "apt", "docker"]);
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

  function tokenize(line) {
    const out = [];
    let cur = "", q = null, has = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (q) { if (ch === q) q = null; else cur += ch; continue; }
      if (ch === '"' || ch === "'") { q = ch; has = true; continue; }
      if (ch === " " || ch === "\t") { if (cur || has) { out.push(cur); cur = ""; has = false; } continue; }
      if (ch === ">") { if (cur || has) { out.push(cur); cur = ""; has = false; } if (line[i + 1] === ">") { out.push(">>"); i++; } else out.push(">"); continue; }
      cur += ch;
    }
    if (q) throw new Error("unterminated quote");
    if (cur || has) out.push(cur);
    return out;
  }

  const F = window.FIZZ;
  function createTerminal(host, api) {
    const term = new Terminal({
      fontFamily: 'ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace',
      fontSize: 13,
      cursorBlink: true,
      convertEol: true,
      theme: { background: "#0d1117", foreground: "#e6edf3", cursor: "#2bc4dc", selectionBackground: "#2bc4dc44", cyan: "#2bc4dc", green: "#3fb950", red: "#f85149", yellow: "#d29922" },
    });
    const fit = new FitAddon.FitAddon();
    term.loadAddon(fit);
    term.open(host);
    const doFit = () => { try { fit.fit(); } catch {} };
    new ResizeObserver(doFit).observe(host);
    setTimeout(doFit, 50);

    let cwd = "";
    let line = "", pos = 0, history = [], hIdx = -1, busy = null;
    const prompt = () => `${C.cyan}${api.projectName().replace(/\s+/g, "-").toLowerCase()}${C.reset}:${C.bold}/${cwd}${C.reset}$ `;
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
      return [...names.entries()].sort((a, b) => (a[1] === b[1] ? a[0].localeCompare(b[0]) : a[1] === "dir" ? -1 : 1));
    }

    function runNode(path, args) {
      return new Promise((resolve) => {
        const worker = new Worker(URL.createObjectURL(new Blob([WORKER_SRC], { type: "text/javascript" })));
        const kill = (code, msg) => { worker.terminate(); if (msg) wl(msg); busy = null; resolve(code); };
        const timer = setTimeout(() => kill(124, `${C.red}Stopped: the script ran longer than 60 seconds.${C.reset}`), 60000);
        busy = () => { clearTimeout(timer); kill(130, "^C"); };
        const pendingWrites = [];
        worker.onmessage = (e) => {
          const m = e.data;
          if (m.type === "file") {
            const job = m.bytes ? api.writeBinary(abs(m.path), m.bytes) : Promise.resolve(api.write(abs(m.path), m.text));
            pendingWrites.push(job.then(() => wl(`${C.dim}wrote ${m.path}${m.bytes ? ` (${F.blobs.human(m.bytes.byteLength)})` : ""}${C.reset}`)).catch((err) => wl(`${C.red}couldn't save ${m.path}: ${err.message}${C.reset}`)));
            return;
          }
          if (m.type === "out") {
            const text = m.text.replace(/\n/g, "\r\n");
            if (m.stream === "raw") w(text);
            else wl(m.stream === "err" ? `${C.red}${text}${C.reset}` : text);
          } else if (m.type === "done") { clearTimeout(timer); Promise.all(pendingWrites).then(() => kill(m.code)); }
        };
        worker.onerror = (e) => { clearTimeout(timer); kill(1, `${C.red}${e.message}${C.reset}`); };
        const text = Object.fromEntries(Object.entries(files()).map(([k, v]) => [k, F.blobs?.isBlob(v) ? null : v]));
        worker.postMessage({ files: text, entry: path, args, base: new URL(".", location.href).href });
      });
    }

    let pyWorker = null;
    /** Runs Python in a persistent Pyodide worker (kept warm between runs). */
    function runPython(job) {
      return new Promise(async (resolve) => {
        if (!pyWorker) pyWorker = new Worker(URL.createObjectURL(new Blob([PY_WORKER_SRC], { type: "text/javascript" })), { type: "module" });
        const w = pyWorker;
        const id = Math.random().toString(36).slice(2);
        const pendingWrites = [];
        const finish = (code, msg) => { clearTimeout(timer); w.removeEventListener("message", on); if (msg) wl(msg); busy = null; Promise.all(pendingWrites).then(() => resolve(code)); };
        const timer = setTimeout(() => { w.terminate(); pyWorker = null; finish(124, `${C.red}Stopped: Python ran longer than 3 minutes.${C.reset}`); }, 180000);
        busy = () => { w.terminate(); pyWorker = null; finish(130, "^C"); };
        function on(e) {
          const m = e.data;
          if (m.id !== id) return;
          if (m.type === "out") { const t = m.text.replace(/\n/g, "\r\n"); wl(m.stream === "err" ? `${C.red}${t}${C.reset}` : m.stream === "dim" ? `${C.dim}${t}${C.reset}` : t); }
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

    const HELP = [
      ["ls [dir]", "list files"], ["tree", "show the project tree"], ["cd <dir>", "change directory"], ["pwd", "print working directory"],
      ["cat <file>", "print a file"], ["head|tail [-n N] <file>", "first/last lines"], ["wc <file>", "count lines, words, bytes"], ["grep <text> [path]", "search files"],
      ["touch <file>", "create an empty file"], ["mkdir <dir>", "create a folder"], ["rm [-r] <path>", "delete files"], ["mv <from> <to>", "move or rename"], ["cp <from> <to>", "copy a file"],
      ["echo <text> [> file]", "print or write text"], ["node <file.js> [args]", "run JavaScript in an isolated worker"], ["python <file.py> [args]", "run Python 3 (Pyodide); python -c \"code\""], ["pip install <pkg>", "install a pure-Python or Pyodide package"], ["open <file>", "open in the editor"],
      ["preview [file.html]", "show the live preview"], ["history", "command history"], ["clear", "clear the screen"],
    ];

    async function exec(raw) {
      let argv;
      try { argv = tokenize(raw.trim()); } catch (e) { return wl(`${C.red}${e.message}${C.reset}`); }
      if (!argv.length) return;
      let redirect = null;
      const ri = argv.findIndex((a) => a === ">" || a === ">>");
      if (ri !== -1) { redirect = { append: argv[ri] === ">>", path: abs(argv[ri + 1] || "") }; argv = argv.slice(0, ri); if (!redirect.path) return wl(`${C.red}missing file after >${C.reset}`); }
      if (raw.includes("|") || raw.includes("&&")) return wl(`${C.yellow}Pipes and command chaining aren't supported in the browser terminal.${C.reset}`);
      const [cmd, ...args] = argv;
      let out = "";
      const print = (s) => (redirect ? (out += s + "\n") : wl(s));
      const fail = (s) => wl(`${C.red}${cmd}: ${s}${C.reset}`);
      switch (cmd) {
        case "help": wl(`${C.bold}FIZZ DEV terminal${C.reset} — runs in your browser on this project's files.`); HELP.forEach(([c, d]) => wl(`  ${C.cyan}${c.padEnd(26)}${C.reset}${d}`)); wl(`${C.dim}npm, git and other system tools need a full sandbox and aren't available here.${C.reset}`); break;
        case "clear": term.clear(); break;
        case "pwd": print("/" + cwd); break;
        case "ls": {
          const target = abs(args.filter((a) => !a.startsWith("-"))[0] || "");
          if (isFile(target)) { print(target.split("/").pop()); break; }
          if (!isDir(target)) return fail(`cannot access '${args[0]}': No such file or directory`);
          const items = list(target);
          if (redirect) items.forEach(([n, t]) => print(t === "dir" ? n + "/" : n));
          else wl(items.map(([n, t]) => (t === "dir" ? `${C.cyan}${n}/${C.reset}` : n)).join("  "));
          break;
        }
        case "tree": {
          const walk = (dir, indent) => list(dir).forEach(([n, t], i, arr) => { const last = i === arr.length - 1; print(`${indent}${last ? "└── " : "├── "}${t === "dir" ? n + "/" : n}`); if (t === "dir") walk(dir ? `${dir}/${n}` : n, indent + (last ? "    " : "│   ")); });
          print("."); walk(abs(args[0] || ""), ""); break;
        }
        case "cd": { const t = abs(args[0] || "/"); if (!isDir(t)) return fail(`no such directory: ${args[0]}`); cwd = t; break; }
        case "cat": { if (!args.length) return fail("missing file"); for (const a of args) { const p = abs(a); if (!isFile(p)) return fail(`${a}: No such file`); const v = files()[p]; print(F.blobs?.isBlob(v) ? `${C.dim}${a}: binary file (${F.blobs.describe(v)})${C.reset}` : v.replace(/\n$/, "")); } break; }
        case "head": case "tail": {
          let n = 10, rest = args;
          if (args[0] === "-n") { n = Number(args[1]) || 10; rest = args.slice(2); }
          const p = abs(rest[0] || ""); if (!isFile(p)) return fail(`${rest[0] || ""}: No such file`);
          const lines = files()[p].split("\n"); print((cmd === "head" ? lines.slice(0, n) : lines.slice(-n)).join("\n")); break;
        }
        case "wc": { const p = abs(args[0] || ""); if (!isFile(p)) return fail(`${args[0] || ""}: No such file`); const s = files()[p]; print(`${s.split("\n").length} ${s.split(/\s+/).filter(Boolean).length} ${new TextEncoder().encode(s).length} ${args[0]}`); break; }
        case "grep": {
          if (!args[0]) return fail("usage: grep <text> [path]");
          const needle = args[0].toLowerCase(), base = abs(args[1] || "");
          let hits = 0;
          for (const [f, c] of Object.entries(files())) {
            if (base && f !== base && !f.startsWith(base + "/")) continue;
            c.split("\n").forEach((l, i) => { if (l.toLowerCase().includes(needle) && hits < 200) { hits++; print(redirect ? `${f}:${i + 1}:${l}` : `${C.cyan}${f}${C.reset}:${C.yellow}${i + 1}${C.reset}:${l.slice(0, 200)}`); } });
          }
          if (!hits && !redirect) wl(`${C.dim}no matches${C.reset}`);
          break;
        }
        case "touch": { if (!args.length) return fail("missing file"); for (const a of args) { const p = abs(a); if (!isFile(p)) api.write(p, ""); } break; }
        case "mkdir": { if (!args.length) return fail("missing directory"); for (const a of args.filter((x) => !x.startsWith("-"))) { const p = abs(a); if (!isDir(p)) api.write(`${p}/.gitkeep`, ""); } break; }
        case "rm": {
          const rec = args.some((a) => /^-[a-z]*r/.test(a));
          for (const a of args.filter((x) => !x.startsWith("-"))) {
            const p = abs(a);
            if (isFile(p)) api.remove(p);
            else if (isDir(p) && p) { if (!rec) return fail(`${a}: is a directory (use rm -r)`); Object.keys(files()).filter((f) => f.startsWith(p + "/")).forEach((f) => api.remove(f)); }
            else return fail(`${a}: No such file or directory`);
          }
          break;
        }
        case "mv": case "cp": {
          if (args.length !== 2) return fail(`usage: ${cmd} <from> <to>`);
          const from = abs(args[0]); let to = abs(args[1]);
          if (isFile(from)) {
            if (isDir(to) && !isFile(to)) to = `${to ? to + "/" : ""}${from.split("/").pop()}`;
            api.write(to, files()[from]); if (cmd === "mv") api.remove(from);
          } else if (isDir(from) && from) {
            Object.keys(files()).filter((f) => f.startsWith(from + "/")).forEach((f) => { api.write(to + f.slice(from.length), files()[f]); if (cmd === "mv") api.remove(f); });
          } else return fail(`${args[0]}: No such file or directory`);
          break;
        }
        case "echo": print(args.join(" ")); break;
        case "history": history.slice().reverse().forEach((h, i) => print(`${String(i + 1).padStart(4)}  ${h}`)); break;
        case "open": { const p = abs(args[0] || ""); if (!isFile(p)) return fail(`${args[0] || ""}: No such file`); api.openFile(p); wl(`${C.dim}Opened ${p} in the editor.${C.reset}`); break; }
        case "preview": { const p = args[0] ? abs(args[0]) : ""; if (p && !isFile(p)) return fail(`${args[0]}: No such file`); api.preview(p); wl(`${C.dim}Preview opened.${C.reset}`); break; }
        case "python": case "python3": {
          if (args[0] === "-c") { const code = await runPython({ kind: "run", code: args.slice(1).join(" "), entry: "", args: [] }); if (code) wl(`${C.dim}exit code ${code}${C.reset}`); break; }
          if (!args[0]) return wl(`${C.dim}Usage: python <file.py> or python -c "print(1+1)" — an interactive Python prompt isn't available.${C.reset}`);
          const p = abs(args[0]);
          if (!isFile(p)) return fail(`can't open file '${args[0]}': No such file`);
          const code = await runPython({ kind: "run", entry: p, args: args.slice(1) });
          if (code) wl(`${C.dim}exit code ${code}${C.reset}`);
          break;
        }
        case "pip": case "pip3": {
          if (args[0] !== "install" || !args[1]) return wl(`${C.dim}Usage: pip install <package> (pure-Python wheels and Pyodide packages such as numpy, pandas, matplotlib)${C.reset}`);
          const code = await runPython({ kind: "pip", pkgs: args.slice(1).filter((a) => !a.startsWith("-")) });
          if (code) wl(`${C.dim}exit code ${code}${C.reset}`);
          break;
        }
        case "node": {
          if (!args[0]) return wl(`${C.dim}Usage: node <file.js> — interactive Node isn't available in the browser.${C.reset}`);
          const p = abs(args[0]);
          if (!isFile(p)) return fail(`Cannot find module '${args[0]}'`);
          const code = await runNode(p, args.slice(1));
          if (code) wl(`${C.dim}exit code ${code}${C.reset}`);
          break;
        }
        default:
          if (SANDBOX_ONLY.has(cmd)) {
            wl(`${C.yellow}${cmd} needs a full Linux sandbox, which isn't available in the browser terminal.${C.reset}`);
            wl(`${C.dim}Tip: use GitHub to push your project, or Deploy to publish it with Vercel.${C.reset}`);
          } else wl(`${C.red}${cmd}: command not found${C.reset} ${C.dim}(type 'help')${C.reset}`);
      }
      if (redirect) {
        const prev = redirect.append && isFile(redirect.path) ? files()[redirect.path] : "";
        api.write(redirect.path, prev + out);
      }
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
      busy = busy || (() => {});
      try { await exec(cmd); } catch (e) { wl(`${C.red}${e.message}${C.reset}`); }
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

    wl(`${C.bold}FIZZ DEV terminal${C.reset} ${C.dim}— a shell over your project files. Type 'help' for commands.${C.reset}`);
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
        return { text: text.slice(0, 8000), failed: raw.includes(C.red) };
      },
      reset() { cwd = ""; term.clear(); redraw(); },
    };
  }

  window.FIZZ = window.FIZZ || {};
  window.FIZZ.createTerminal = createTerminal;
  window.FIZZ._tokenize = tokenize;
})();
