/* FIZZ DEV context retrieval: rank project files, follow local imports and budget excerpts. */
(function (root) {
  "use strict";

  const STOP = new Set(("the a an and or for to of in on with from by as is are was were be been being do does did can could should would will may might this that these those it its we you your our their what how why when where which who please build create make fix update improve add remove change implement use using into onto app application project file files code source existing current").split(" "));
  const CONFIG = /^(?:package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|tsconfig(?:\.[^/]+)?\.json|jsconfig\.json|vite\.config\.[^/]+|next\.config\.[^/]+|astro\.config\.[^/]+|postcss\.config\.[^/]+|tailwind\.config\.[^/]+|eslint\.config\.[^/]+|\.eslintrc(?:\.[^/]+)?|\.prettierrc(?:\.[^/]+)?|README(?:\.md)?|AGENTS\.md)$/i;
  const ENTRY = /^(?:index\.html|src\/app\/(?:page|layout|route)\.[^/]+|src\/pages\/[^/]+|app\/(?:page|layout|route)\.[^/]+|pages\/index\.[^/]+|src\/main\.[^/]+|src\/index\.[^/]+|src\/App\.[^/]+|main\.[^/]+)$/i;
  const IGNORE = /^(?:\.git|node_modules|\.next|dist|build|coverage|\.turbo|\.vercel)\//;
  const BINARY = /^\u0000blob:/;

  function taskTerms(text) {
    return [...new Set(String(text || "").toLowerCase().match(/[\p{L}\p{N}_-]{3,36}/gu) || [])]
      .filter((word) => !STOP.has(word) && !/^\d+$/.test(word))
      .slice(0, 22);
  }

  function resolveLocal(from, spec) {
    if (!/^\.{1,2}\//.test(spec)) return null;
    const parts = from.split("/").slice(0, -1);
    for (const part of spec.split("/")) {
      if (!part || part === ".") continue;
      if (part === "..") {
        if (!parts.length) return null;
        parts.pop();
      } else parts.push(part);
    }
    return parts.join("/");
  }

  function dependencies(path, content, known) {
    const refs = new Set();
    const re = /\b(?:from\s*|import\s*\(\s*|import\s+|require\s*\(\s*)["'](\.{1,2}\/[^"'\n]+)["']/g;
    for (const match of String(content || "").matchAll(re)) refs.add(match[1]);
    if (/\.html?$/i.test(path)) {
      for (const match of String(content || "").matchAll(/<(?:script|link)\b[^>]*(?:src|href)=["'](\.{1,2}\/[^"']+)["']/gi)) refs.add(match[1]);
    }
    if (/\.css$/i.test(path)) {
      for (const match of String(content || "").matchAll(/@import\s+(?:url\()?["'](\.{1,2}\/[^"']+)["']/gi)) refs.add(match[1]);
    }
    const found = [];
    for (const ref of refs) {
      const base = resolveLocal(path, ref);
      if (!base) continue;
      const candidates = [base, ...[".js", ".jsx", ".ts", ".tsx", ".mjs", ".css", ".json", ".html"].map((ext) => base + ext),
        ...["index.js", "index.ts", "index.tsx"].map((name) => base + "/" + name)];
      const hit = candidates.find((candidate) => known.has(candidate));
      if (hit) found.push(hit);
    }
    return found;
  }

  function excerpt(text, terms, maxChars) {
    const source = String(text || "");
    if (source.length <= maxChars) return source;
    const lines = source.split("\n");
    if (maxChars < 500 || lines.length < 8) return source.slice(0, maxChars) + "\n[…excerpt truncated…]";
    const scores = lines.map((line, index) => {
      const lower = line.toLowerCase();
      let score = 0;
      for (const term of terms) if (lower.includes(term)) score += 5 + Math.min(5, lower.split(term).length - 1);
      if (/^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function|class|const|let|var|interface|type)\s/.test(line)) score += 1;
      return { index, score };
    });
    const windows = new Set();
    const addWindow = (center, radius) => {
      for (let i = Math.max(0, center - radius); i <= Math.min(lines.length - 1, center + radius); i++) windows.add(i);
    };
    for (let i = 0; i < Math.min(22, lines.length); i++) windows.add(i);
    scores.filter((x) => x.score > 0).sort((a, b) => b.score - a.score || a.index - b.index).slice(0, 18).forEach((x) => addWindow(x.index, 3));
    const indexes = [...windows].sort((a, b) => a - b);
    const out = [];
    let used = 0, previous = -2;
    for (const index of indexes) {
      const line = lines[index];
      const separator = index > previous + 1 ? "\n[…snip…]\n" : "";
      const cost = separator.length + line.length + 1;
      if (used + cost > maxChars) continue;
      if (separator) { out.push(separator); used += separator.length; }
      out.push(line); used += line.length + 1; previous = index;
    }
    return out.join("\n") + "\n[…excerpt selected by task relevance…]";
  }

  const attr = (value) => String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  function buildProjectContext(files, options = {}) {
    const entries = Object.entries(files || {}).filter(([path]) => path && !IGNORE.test(path) && !path.includes("/node_modules/"));
    const known = new Set(entries.map(([path]) => path));
    const mentions = [...new Set((options.mentions || []).filter((path) => known.has(path)))];
    const terms = taskTerms(options.query);
    const budgetChars = Math.max(1_000, Math.min(240_000, Number(options.budgetChars) || 120_000));
    const index = new Map(entries.map(([path, value]) => [path, value]));
    const dependencySet = new Set();
    const seed = [...mentions, ...entries.filter(([path]) => path === "FIZZ.md" || CONFIG.test(path) || ENTRY.test(path)).map(([path]) => path)].slice(0, 16);
    const queue = seed.map((path) => ({ path, depth: 0 }));
    const visited = new Set();
    while (queue.length) {
      const current = queue.shift();
      if (visited.has(current.path)) continue;
      visited.add(current.path);
      const value = index.get(current.path);
      if (typeof value !== "string" || BINARY.test(value)) continue;
      for (const dep of dependencies(current.path, value.slice(0, 80_000), known)) {
        dependencySet.add(dep);
        if (current.depth < 2 && !visited.has(dep)) queue.push({ path: dep, depth: current.depth + 1 });
      }
    }
    const ranked = entries.map(([path, value], order) => {
      const lowerPath = path.toLowerCase();
      let score = 0;
      const mentionIndex = mentions.indexOf(path);
      if (mentionIndex >= 0) score += 100_000 - mentionIndex * 100;
      if (path === "FIZZ.md") score += 30_000;
      if (CONFIG.test(path)) score += 12_000;
      if (ENTRY.test(path)) score += 9_000;
      if (dependencySet.has(path)) score += 7_000;
      for (const term of terms) if (lowerPath.includes(term)) score += 900;
      if (typeof value === "string" && !BINARY.test(value) && terms.length) {
        const sample = value.slice(0, 50_000).toLowerCase();
        for (const term of terms) if (sample.includes(term)) score += 80;
      }
      if (/\.(?:tsx?|jsx?|mjs|css|html|json|py|sql)$/i.test(path)) score += 30;
      if (BINARY.test(value)) score -= 50;
      return { path, value, score, order, mentioned: mentionIndex >= 0 };
    }).sort((a, b) => b.score - a.score || a.order - b.order);

    const selected = [];
    const blocks = [];
    let remaining = budgetChars;
    for (const item of ranked) {
      if (selected.length >= (Number(options.maxFiles) || 80) || remaining < 500) break;
      if (typeof item.value !== "string" || BINARY.test(item.value)) {
        const body = typeof item.value === "string" ? "[binary file; content not sent]" : "[non-text file; content not sent]";
        const block = '<fizz-file path="' + attr(item.path) + '" binary="true">' + body + "</fizz-file>";
        if (block.length > remaining) continue;
        blocks.push(block); selected.push(item.path); remaining -= block.length;
        continue;
      }
      const cap = item.mentioned ? 42_000 : item.score >= 12_000 ? 24_000 : item.score >= 7_000 ? 16_000 : item.score >= 900 ? 12_000 : 7_000;
      const available = Math.max(0, Math.min(cap, remaining - 100));
      if (available < 350) continue;
      const body = excerpt(item.value, terms, available);
      const block = '<fizz-file path="' + attr(item.path) + '">\n' + body + "\n</fizz-file>";
      if (block.length > remaining) continue;
      blocks.push(block); selected.push(item.path); remaining -= block.length;
    }
    return { text: blocks.join("\n"), files: selected, terms, budgetChars, usedChars: budgetChars - remaining };
  }

  function fileChangedSinceSnapshot(snapshot, current, path) {
    const before = snapshot || {};
    const after = current || {};
    const hadBefore = Object.prototype.hasOwnProperty.call(before, path);
    const hasNow = Object.prototype.hasOwnProperty.call(after, path);
    return hadBefore !== hasNow || (hadBefore && before[path] !== after[path]);
  }

  root.FIZZ ||= {};
  root.FIZZ.agentContext = { taskTerms, dependencies, excerpt, buildProjectContext, fileChangedSinceSnapshot };
})(window);
