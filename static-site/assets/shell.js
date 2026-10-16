/* The FIZZ DEV shell: a bash-like command language over the project's files.
   Pipes, &&, ||, ;, redirects (> >> < 2> 2>&1), $VARS, ~ and * globs, and ~60 standard commands run right here.
   Anything else (npm, git, make, compilers, unknown programs…) runs in real bash in the cloud sandbox
   when the site has it turned on. Used by terminal.js. */
(function () {
  "use strict";
  const F = window.FIZZ;

  // ---------- parsing ----------
  const OPS = ["2>&1", "&>", "2>>", "2>", ">>", "&&", "||", ">", "<", "|", ";", "&"];
  /** Words and operators, with quotes and escapes. $VARs become markers that expand when the command runs
      (so `export X=1; echo $X` works); globs are marked for later. */
  const VAR_MARK = (name) => `\u0001${name}\u0002`;
  const expandVars = (word, vars) => word.replace(/\u0001([^\u0002]*)\u0002/g, (_, n) => String(vars[n] ?? ""));
  function lex(line, vars) {
    const out = [];
    let cur = "", has = false, glob = false, i = 0;
    const push = () => { if (cur || has) out.push({ t: "w", v: cur, glob }); cur = ""; has = false; glob = false; };
    const varAt = (j) => {
      if (line[j + 1] === "{") { const k = line.indexOf("}", j); if (k > 0) return [VAR_MARK(line.slice(j + 2, k)), k + 1]; }
      const m = /^(\?|[A-Za-z_][A-Za-z0-9_]*|\d)/.exec(line.slice(j + 1));
      return m ? [VAR_MARK(m[1]), j + 1 + m[1].length] : ["$", j + 1];
    };
    while (i < line.length) {
      const ch = line[i];
      if (ch === "\\") { cur += line[i + 1] ?? ""; has = true; i += 2; continue; }
      if (ch === "'") { const k = line.indexOf("'", i + 1); if (k < 0) throw new Error("unterminated quote"); cur += line.slice(i + 1, k); has = true; i = k + 1; continue; }
      if (ch === '"') {
        let j = i + 1;
        for (; j < line.length && line[j] !== '"'; j++) {
          if (line[j] === "\\" && /["\\$`]/.test(line[j + 1])) { cur += line[++j]; continue; }
          if (line[j] === "$") { const [v, nj] = varAt(j); cur += v; j = nj - 1; continue; }
          cur += line[j];
        }
        if (j >= line.length) throw new Error("unterminated quote");
        has = true; i = j + 1; continue;
      }
      if (ch === "$") { const [v, nj] = varAt(i); cur += v; has = true; i = nj; continue; }
      if (ch === "#" && !cur && !has) break;
      if (ch === " " || ch === "\t") { push(); i++; continue; }
      const op = OPS.find((o) => line.startsWith(o, i));
      if (op && !(op === "&" && line[i + 1] === ">")) { push(); out.push({ t: "op", v: op }); i += op.length; continue; }
      if (ch === "~" && !cur && !has && (line[i + 1] === undefined || line[i + 1] === "/" || line[i + 1] === " ")) { cur += "/"; has = true; i += line[i + 1] === "/" ? 2 : 1; continue; }
      if (ch === "*" || ch === "?") glob = true;
      cur += ch; i++;
    }
    push();
    return out;
  }
  /** Commands joined by && || ; and pipelines joined by |. */
  function parse(tokens) {
    const list = [];
    let pipeline = [], cmd = { argv: [], redirs: [], globs: [] }, cond = null, bg = false;
    const endCmd = () => { if (cmd.argv.length || cmd.redirs.length) pipeline.push(cmd); cmd = { argv: [], redirs: [], globs: [] }; };
    const endPipe = (next) => { endCmd(); if (pipeline.length) list.push({ cond, pipeline, bg }); pipeline = []; cond = next; bg = false; };
    for (let k = 0; k < tokens.length; k++) {
      const tk = tokens[k];
      if (tk.t === "w") { cmd.argv.push(tk.v); cmd.globs.push(tk.glob); continue; }
      if (tk.v === "|") { endCmd(); continue; }
      if (tk.v === "&&" || tk.v === "||" || tk.v === ";") { endPipe(tk.v === ";" ? null : tk.v); continue; }
      if (tk.v === "&") { bg = true; endPipe(null); continue; }
      if (tk.v === "2>&1") { cmd.redirs.push({ op: "2>&1" }); continue; }
      const target = tokens[k + 1];
      if (!target || target.t !== "w") throw new Error(`syntax error near '${tk.v}'`);
      cmd.redirs.push({ op: tk.v, path: target.v });
      k++;
    }
    endPipe(null);
    return list;
  }

  // ---------- helpers ----------
  const globRe = (pat) => new RegExp("^" + pat.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*\/?/g, "\u0000").replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]").replace(/\u0000/g, "(?:.*/)?") + "$");
  const human = (n) => (n < 1024 ? `${n}` : n < 1048576 ? `${(n / 1024).toFixed(1)}K` : `${(n / 1048576).toFixed(1)}M`);
  const lines = (s) => (s === "" ? [] : s.replace(/\n$/, "").split("\n"));
  const unescapeE = (s) => s.replace(/\\n/g, "\n").replace(/\\t/g, "\t").replace(/\\e/g, "\x1b").replace(/\\\\/g, "\\");
  function trSet(s) { let out = ""; for (let i = 0; i < s.length; i++) { if (s[i + 1] === "-" && s[i + 2]) { for (let c = s.charCodeAt(i); c <= s.charCodeAt(i + 2); c++) out += String.fromCharCode(c); i += 2; } else out += s[i] === "\\" && s[i + 1] === "n" ? (i++, "\n") : s[i]; } return out; }
  function lineDiff(a, b, na, nb) {
    const A = lines(a), B = lines(b);
    if (A.length * B.length > 4e6) return [`Files ${na} and ${nb} differ`];
    const dp = Array.from({ length: A.length + 1 }, () => new Int32Array(B.length + 1));
    for (let i = A.length - 1; i >= 0; i--) for (let j = B.length - 1; j >= 0; j--) dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    const out = [`--- ${na}`, `+++ ${nb}`];
    let i = 0, j = 0;
    while (i < A.length || j < B.length) {
      if (i < A.length && j < B.length && A[i] === B[j]) { i++; j++; continue; }
      if (j < B.length && (i >= A.length || dp[i][j + 1] >= dp[i + 1][j])) out.push(`+${B[j++]}`);
      else out.push(`-${A[i++]}`);
    }
    return out.length > 2 ? out : [];
  }
  function jq(data, expr) {
    expr = expr.trim();
    if (expr === "." || !expr) return data;
    if (expr === "keys") return Object.keys(data);
    if (expr === "length") return Array.isArray(data) || typeof data === "string" ? data.length : Object.keys(data || {}).length;
    let v = data;
    for (const part of expr.replace(/^\./, "").match(/[^.[\]]+|\[\d*\]/g) || []) {
      if (part === "[]") return Array.isArray(v) ? v : Object.values(v || {});
      v = part.startsWith("[") ? v?.[Number(part.slice(1, -1))] : v?.[part];
    }
    return v;
  }
  function awk(prog, input, sep) {
    const m = /^\s*(?:\/(.*?)\/\s*)?\{\s*print\s*(.*?)\s*;?\s*\}\s*$/.exec(prog);
    if (!m) throw new Error("only programs like '{print $1, $3}' or '/pattern/ {print $0}' are supported here");
    const re = m[1] ? new RegExp(m[1]) : null;
    const exprs = m[2] ? m[2].split(/\s*,\s*/) : ["$0"];
    return lines(input).map((l, n) => {
      if (re && !re.test(l)) return null;
      const f = sep ? l.split(sep) : l.trim().split(/\s+/);
      return exprs.map((e) => (e === "NR" ? String(n + 1) : e === "NF" ? String(f.length) : /^\$\d+$/.test(e) ? (e === "$0" ? l : f[Number(e.slice(1)) - 1] ?? "") : /^".*"$/.test(e) ? e.slice(1, -1) : e)).join(" ");
    }).filter((x) => x !== null).join("\n") + "\n";
  }
  function sedScript(script, input) {
    let s = input;
    for (const cmd of script.split(/;(?![^/]*\/[^/]*$)/).map((x) => x.trim()).filter(Boolean)) {
      let m = /^s(.)(.*?)\1(.*?)\1([gip]*)$/.exec(cmd);
      if (m) { const re = new RegExp(m[2].replace(/\\\(/g, "(").replace(/\\\)/g, ")"), (m[4].includes("g") ? "g" : "") + (m[4].includes("i") ? "i" : "") + "m"); s = s.split("\n").map((l) => l.replace(re, m[3].replace(/\\(\d)/g, "$$$1").replace(/&/g, "$$&"))).join("\n"); continue; }
      m = /^\/(.*)\/d$/.exec(cmd);
      if (m) { const re = new RegExp(m[1]); s = s.split("\n").filter((l) => !re.test(l)).join("\n"); continue; }
      m = /^(\d+)d$/.exec(cmd);
      if (m) { const k = Number(m[1]) - 1; s = s.split("\n").filter((_, i) => i !== k).join("\n"); continue; }
      throw new Error(`unsupported sed command '${cmd}' (s/a/b/g, /re/d and Nd work here)`);
    }
    return s;
  }

  /** Commands that always run in the cloud sandbox (real Linux). */
  const CLOUD = new Set(["npm", "npx", "yarn", "pnpm", "bun", "git", "deno", "make", "cmake", "gcc", "g++", "cc", "clang", "rustc", "cargo", "go", "java", "javac", "mvn", "gradle", "ruby", "gem", "php", "composer", "perl", "dotnet", "tsc", "vite", "next", "ps", "kill", "pkill", "top", "htop", "lsof", "netstat", "ss", "ping", "dig", "nslookup", "ssh", "scp", "rsync", "tar", "gzip", "gunzip", "sudo", "dnf", "yum", "apt", "apt-get", "pip-cloud", "uv", "poetry", "pipenv", "sqlite3", "psql", "mysql", "redis-cli", "ffmpeg", "convert", "magick", "bash", "sh", "zsh", "chmod", "chown", "ln", "watch", "crontab", "systemctl", "service", "docker", "kubectl", "terraform", "aws", "gcloud", "vercel", "netlify", "firebase", "supabase", "expo", "flutter", "dart", "swift", "kotlin", "R", "Rscript", "julia", "lua", "elixir", "mix", "zig", "nim", "hugo", "jekyll"]);

  F.shell = { lex, parse, expandVars, globRe, lineDiff, jq, awk, sedScript, trSet, unescapeE, human, lines, CLOUD };
})();
