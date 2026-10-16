/* Fizz Code tools that run on the FIZZ server: web search, reading pages, and its own Linux sandbox in the cloud. */
(function () {
  "use strict";
  const F = window.FIZZ;
  const esc = F.esc;
  const tools = () => F.serverStatusCached?.()?.tools || null;
  const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };

  F.agentTools.register("search", {
    icon: "⌕", feedback: true,
    label: (t) => `Searched “${(t.body || t.attrs.q || "").slice(0, 100)}”`,
    summary: (k) => `searched the web ${k === 1 ? "once" : `${k} times`}`,
    prompt: "<fizz-search>query</fizz-search> searches the web and shows you the top results (title, link, snippet). Use it for anything current or that you aren't sure about: docs, versions, prices, news. Then read the best pages with <fizz-fetch>.",
    available: () => Boolean(tools()),
    async run(t) {
      const q = (t.body || t.attrs.q || "").trim();
      if (!q) return { ok: false, text: "The search was empty." };
      const r = await F.conn.web.search(q, 8);
      if (!r.results.length) return { ok: true, text: `No results for “${q}”.`, html: `<p class="muted-sm" style="padding:10px 12px">No results.</p>` };
      return {
        ok: true,
        text: `Results for “${q}” (${r.provider}):\n` + r.results.map((x, i) => `${i + 1}. ${x.title} — ${x.url}${x.snippet ? `\n   ${x.snippet}` : ""}`).join("\n"),
        html: `<ol class="web-results">${r.results.map((x) => `<li><a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.title)}</a><small>${esc(host(x.url))}</small>${x.snippet ? `<p>${esc(x.snippet)}</p>` : ""}</li>`).join("")}</ol>`,
      };
    },
  });

  F.agentTools.register("fetch", {
    icon: "↧", feedback: true,
    label: (t) => `Read ${host(t.attrs.url || t.body)}`,
    summary: (k) => `read ${k} web page${k === 1 ? "" : "s"}`,
    prompt: '<fizz-fetch url="https://…"/> reads a web page (or a JSON/text URL) and gives you its text, with links. Use it after <fizz-search>, for documentation, or for a link the user gave you.',
    available: () => Boolean(tools()),
    async run(t) {
      const url = (t.attrs.url || t.body || "").trim();
      if (!/^https?:\/\//i.test(url)) return { ok: false, text: "Give a full link that starts with https://." };
      const r = await F.conn.web.read(url);
      const text = `${r.title ? `# ${r.title}\n` : ""}${r.url}${r.status && r.status >= 400 ? ` (HTTP ${r.status})` : ""}\n\n${r.text}${r.truncated ? "\n\n[The page was longer; this is the start.]" : ""}`;
      return { ok: !(r.status >= 400), text, html: `<div class="web-read"><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.title || r.url)}</a><pre>${esc(r.text.slice(0, 1500))}${r.text.length > 1500 ? "…" : ""}</pre></div>` };
    },
  });

  // ---------- the cloud sandbox ----------
  const textFiles = (files) => Object.fromEntries(Object.entries(files).filter(([p, v]) => typeof v === "string" && !F.blobs.isBlob(v) && !/^(node_modules|\.fizz-build|\.fizz-out)\//.test(p)));
  async function bringBack(files, ctx) {
    const changed = [];
    for (const [path, v] of Object.entries(files || {})) {
      if (!path || path.split("/").some((s) => !s || s === "..")) continue;
      if (typeof v === "string") { if (ctx.project().files[path] !== v) { ctx.writeFile(path, v, { source: "agent" }); changed.push(path); } continue; }
      if (v?.base64) {
        const bin = atob(v.base64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        ctx.writeFile(path, await F.blobs.put(bytes, F.blobs.mimeFor(path)), { source: "agent" });
        changed.push(path);
      }
    }
    return changed;
  }

  F.agentTools.register("sandbox", {
    icon: "▣", feedback: true,
    label: (t) => `${t.attrs.background === "true" ? "Started" : "Ran"} in the cloud: ${t.body.split("\n")[0].slice(0, 110)}`,
    summary: (k) => `ran ${k} cloud command${k === 1 ? "" : "s"}`,
    prompt: '<fizz-sandbox>command</fizz-sandbox> runs a bash command in your own Linux computer in the cloud (Node 22, npm, git, Python 3, internet access). The project\'s text files are copied in first, and files the command creates or changes come back into the project (node_modules stays there between commands). Use it without asking for npm install, npm test, npm run build, real Node/Python packages, git and anything the browser terminal can\'t do. For a server, listen on 0.0.0.0 port 3000 and add background="true": it keeps running and you get a public link.',
    available: () => Boolean(tools()?.sandbox),
    needsApproval: (t, ctx) => ctx.data.settings.askBeforeRun === true,
    async run(t, ctx) {
      const cmd = t.body.trim();
      if (!cmd) return { ok: false, text: "The command was empty." };
      const projectId = ctx.project().id;
      const background = t.attrs.background === "true";
      let r = await F.conn.sandbox({ action: "run", projectId, cmd, background, files: textFiles(ctx.project().files) });
      const started = Date.now();
      while (r.running && !background && Date.now() - started < 10 * 60_000) {
        t.progress = r.text;
        ctx.rerender();
        r = await F.conn.sandbox({ action: "wait", projectId, cmdId: r.cmdId });
      }
      if (r.running && !background) return { ok: false, text: `Still running after 10 minutes, so FIZZ stopped waiting. Output so far:\n${r.text}` };
      const changed = await bringBack(r.files, ctx);
      if (changed.length) ctx.rerender();
      const out = String(r.text || "").trim();
      const parts = [`$ ${cmd}`, out || "(no output)"];
      if (background) parts.push(`Running in the background. Public link (port 3000): ${r.url}`);
      else parts.push(`[exit code ${r.exitCode}]`);
      if (changed.length) parts.push(`Files updated in the project: ${changed.slice(0, 40).join(", ")}${changed.length > 40 ? ` and ${changed.length - 40} more` : ""}`);
      return { ok: background || r.exitCode === 0, text: parts.join("\n"), files: changed, html: background && r.url ? `<div class="web-read"><a href="${esc(r.url)}" target="_blank" rel="noopener">Open ${esc(host(r.url))}</a></div>` : undefined };
    },
  });
})();
