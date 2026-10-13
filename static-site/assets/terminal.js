/* FIZZ DEV terminal: a real shell over the project's files, plus a sandboxed JavaScript runner (Web Worker).
   Commands that need a full OS sandbox (npm, git, python…) say so instead of pretending to run. */
(function () {
  "use strict";

  const C = { reset: "\x1b[0m", dim: "\x1b[2m", red: "\x1b[31m", green: "\x1b[32m", yellow: "\x1b[33m", cyan: "\x1b[36m", bold: "\x1b[1m" };
  const SANDBOX_ONLY = new Set(["npm", "npx", "yarn", "pnpm", "bun", "git", "python", "python3", "pip", "pip3", "deno", "cargo", "go", "java", "make", "curl", "wget", "ssh", "sudo", "apt", "docker"]);

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
  self.onmessage = (e) => {
    const { files, entry, args } = e.data;
    const dir = (p) => p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "";
    const norm = (p) => { const out = []; for (const s of p.split("/")) { if (!s || s === ".") continue; if (s === "..") out.pop(); else out.push(s); } return out.join("/"); };
    const cache = {};
    const process = { argv: ["node", entry, ...args], env: {}, platform: "browser", cwd: () => "/", exit: (c = 0) => { throw new Exit(c); }, stdout: { write: (s) => send("raw", [String(s)]) } };
    function req(from, name) {
      if (!name.startsWith(".") && !name.startsWith("/")) throw new Error("Module '" + name + "' isn't available in the browser runner (only your project's own files can be required).");
      let p = norm((name.startsWith("/") ? "" : dir(from) + "/") + name);
      for (const c of [p, p + ".js", p + ".cjs", p + "/index.js"]) if (files[c] !== undefined) { p = c; break; }
      if (p.endsWith(".json") && files[p] !== undefined) return JSON.parse(files[p]);
      return load(p);
    }
    function load(p) {
      if (cache[p]) return cache[p].exports;
      if (files[p] === undefined) throw new Error("Cannot find module '" + p + "'");
      const module = { exports: {} };
      cache[p] = module;
      let fn;
      try { fn = new Function("module", "exports", "require", "console", "process", "__filename", "__dirname", files[p]); }
      catch (err) { if (/import|export/.test(String(err.message))) throw new Error(p + ": ES module syntax (import/export) isn't supported by the browser runner. Use require()/module.exports, or run it in a full sandbox."); throw err; }
      fn(module, module.exports, (n) => req(p, n), consoleShim, process, p, dir(p));
      return module.exports;
    }
    let code = 0;
    try { load(entry); } catch (err) { if (err instanceof Exit) code = err.code; else { send("err", [err && err.stack ? err.stack.split("\\n").slice(0, 6).join("\\n") : String(err)]); code = 1; } }
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
    const w = (s) => term.write(s);
    const wl = (s = "") => term.write(s + "\r\n");

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
        const timer = setTimeout(() => kill(124, `${C.red}Stopped: the script ran longer than 15 seconds.${C.reset}`), 15000);
        busy = () => { clearTimeout(timer); kill(130, "^C"); };
        worker.onmessage = (e) => {
          const m = e.data;
          if (m.type === "out") {
            const text = m.text.replace(/\n/g, "\r\n");
            if (m.stream === "raw") w(text);
            else wl(m.stream === "err" ? `${C.red}${text}${C.reset}` : text);
          } else if (m.type === "done") { clearTimeout(timer); kill(m.code); }
        };
        worker.onerror = (e) => { clearTimeout(timer); kill(1, `${C.red}${e.message}${C.reset}`); };
        worker.postMessage({ files: files(), entry: path, args });
      });
    }

    const HELP = [
      ["ls [dir]", "list files"], ["tree", "show the project tree"], ["cd <dir>", "change directory"], ["pwd", "print working directory"],
      ["cat <file>", "print a file"], ["head|tail [-n N] <file>", "first/last lines"], ["wc <file>", "count lines, words, bytes"], ["grep <text> [path]", "search files"],
      ["touch <file>", "create an empty file"], ["mkdir <dir>", "create a folder"], ["rm [-r] <path>", "delete files"], ["mv <from> <to>", "move or rename"], ["cp <from> <to>", "copy a file"],
      ["echo <text> [> file]", "print or write text"], ["node <file.js> [args]", "run JavaScript in an isolated worker"], ["open <file>", "open in the editor"],
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
        case "cat": { if (!args.length) return fail("missing file"); for (const a of args) { const p = abs(a); if (!isFile(p)) return fail(`${a}: No such file`); print(files()[p].replace(/\n$/, "")); } break; }
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
      reset() { cwd = ""; term.clear(); redraw(); },
    };
  }

  window.FIZZ = window.FIZZ || {};
  window.FIZZ.createTerminal = createTerminal;
  window.FIZZ._tokenize = tokenize;
})();
