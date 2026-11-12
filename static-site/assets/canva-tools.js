/* Fizz Code and Canva (Connect API, signed in with OAuth in Settings → Connections):
     <fizz-canva action="designs" query="logo"/>                            the user's designs
     <fizz-canva action="create" type="presentation|doc|whiteboard" title="…"/>   a new design (or width="1080" height="1080")
     <fizz-canva action="export" id="DAF…" format="png|jpg|pdf" save="images/hero.png"/>   export a design into the project
     <fizz-canva action="upload" path="images/logo.png"/>                   upload a project image to the user's Canva uploads
     <fizz-canva action="me"/>                                              who is connected */
(function () {
  "use strict";
  const F = window.FIZZ;
  const esc = F.esc;
  const call = async (req) => {
    const r = await F.conn.canva.call(req);
    if (!r.ok) {
      const msg = r.data?.message || r.data?.error?.message || r.data?.code || `Canva answered ${r.status}`;
      throw new Error(r.status === 403 ? `${msg}. The Canva connection is missing a permission — tick the design and asset scopes in the Canva Developer Portal, then connect Canva again.` : msg);
    }
    return r.data;
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  /** Canva's jobs (exports, uploads) finish a few seconds later. */
  async function job(path, key, ctx, t) {
    for (let i = 0; i < 40; i++) {
      const d = await call({ path });
      const j = d.job || d[key] || d;
      if (j.status === "success") return j;
      if (j.status === "failed") throw new Error(j.error?.message || "Canva couldn't finish it.");
      t.progress = `Waiting for Canva… ${i * 1.5}s`;
      ctx.rerender?.();
      await sleep(1500);
    }
    throw new Error("Canva is still working on it; try again in a minute.");
  }
  const fmtDesign = (d) => `${d.title || "Untitled"} — id ${d.id}${d.page_count ? `, ${d.page_count} page${d.page_count === 1 ? "" : "s"}` : ""}${d.urls?.edit_url ? `, edit: ${d.urls.edit_url}` : ""}`;
  const connected = () => Boolean(F.serverStatusCached?.()?.connections?.canva?.connected);

  F.agentTools.register("canva", {
    icon: "image", feedback: true,
    label: (t) => ({ designs: "Looked at Canva designs", create: `Created a Canva design: ${t.attrs.title || t.attrs.type || ""}`, export: `Exported a Canva design${t.attrs.save ? ` to ${t.attrs.save}` : ""}`, upload: `Uploaded ${t.attrs.path || ""} to Canva`, me: "Checked the Canva account" })[t.attrs.action] || "Canva",
    summary: (k) => `${k} Canva step${k === 1 ? "" : "s"}`,
    prompt: [
      'Canva is connected. <fizz-canva action="…"/>:',
      '  designs query="…" — the user\'s designs (id, title, edit link);',
      '  create type="presentation|doc|whiteboard" title="…" (or width="1080" height="1080" for a custom size) — a new design; give the user its edit link;',
      '  export id="…" format="png|jpg|pdf" save="images/name.png" — export a design into the project (e.g. a logo or banner the user made in Canva);',
      '  upload path="images/logo.png" — put a project image into the user\'s Canva uploads.',
    ].join("\n"),
    available: connected,
    unavailable: "Canva isn't connected. If the user wants to use their Canva designs, ask them to connect Canva (Settings → Connections).",
    perm: (t) => ({ kind: "mcp", target: `canva:${t.attrs.action || ""}`, readOnly: ["designs", "me"].includes(t.attrs.action) }),
    async run(t, ctx) {
      const a = t.attrs;
      try {
        if (a.action === "me") { const d = await call({ path: "/users/me/profile" }); return { ok: true, text: `Connected to Canva as ${d.profile?.display_name || "the user"}.` }; }
        if (a.action === "designs") {
          const d = await call({ path: "/designs", query: { query: a.query || "", ownership: "any", sort_by: "modified_descending" } });
          const items = d.items || [];
          return { ok: true, text: items.length ? `${items.length} design${items.length === 1 ? "" : "s"}${a.query ? ` for “${a.query}”` : ""}:\n${items.slice(0, 30).map(fmtDesign).join("\n")}` : `No designs${a.query ? ` for “${a.query}”` : ""}.` };
        }
        if (a.action === "create") {
          const w = Number(a.width), h = Number(a.height);
          const design_type = w && h ? { type: "custom", width: Math.round(w), height: Math.round(h) } : { type: "preset", name: ["presentation", "doc", "whiteboard"].includes(a.type) ? a.type : "presentation" };
          const d = await call({ method: "POST", path: "/designs", body: { design_type, title: String(a.title || "From FIZZ").slice(0, 255) } });
          const design = d.design || d;
          return { ok: true, text: `Created: ${fmtDesign(design)}`, html: design.urls?.edit_url ? `<div class="web-read"><a href="${esc(design.urls.edit_url)}" target="_blank" rel="noopener">Open “${esc(design.title || "the design")}” in Canva</a></div>` : "" };
        }
        if (a.action === "export") {
          if (!a.id) return { ok: false, text: "Which design? id=\"…\" (find it with action=\"designs\")." };
          const format = ["png", "jpg", "pdf"].includes(a.format) ? a.format : "png";
          const start = await call({ method: "POST", path: "/exports", body: { design_id: a.id, format: { type: format } } });
          const j = await job(`/exports/${start.job?.id}`, "job", ctx, t);
          const urls = j.urls || [];
          if (!urls.length) return { ok: false, text: "Canva finished but gave no file." };
          const base = String(a.save || `canva/${a.id}.${format}`).replace(/^\/+/, "");
          const saved = [];
          for (const [i, url] of urls.slice(0, 10).entries()) {
            const f = await F.conn.canva.call({ download: url });
            if (!f.ok) throw new Error("Couldn't download the export.");
            const path = urls.length > 1 ? base.replace(/(\.[^./]+)?$/, `-${i + 1}$1`) : base;
            const bin = atob(f.data.base64), bytes = new Uint8Array(bin.length);
            for (let k = 0; k < bin.length; k++) bytes[k] = bin.charCodeAt(k);
            ctx.writeFile(path, await F.blobs.put(bytes, F.blobs.mimeFor(path)), { source: "agent" });
            saved.push(path);
          }
          ctx.save?.();
          return { ok: true, text: `Exported to the project: ${saved.join(", ")}`, files: saved };
        }
        if (a.action === "upload") {
          const path = String(a.path || "").replace(/^\/+/, "");
          const v = ctx.project().files[path];
          if (!v || !F.blobs.isBlob(v)) return { ok: false, text: `${path || "That file"} isn't an image in the project.` };
          const start = await call({ method: "POST", path: "/asset-uploads", upload: { name: path.split("/").pop(), base64: await F.blobs.base64(v) } });
          const j = await job(`/asset-uploads/${start.job?.id}`, "job", ctx, t);
          return { ok: true, text: `Uploaded ${path} to Canva (asset ${j.asset?.id || ""}). It's in the user's Canva uploads.` };
        }
        return { ok: false, text: `Unknown action “${a.action}”. Use designs, create, export, upload or me.` };
      } catch (e) { return { ok: false, text: `Canva: ${e.message}` }; }
    },
  });
})();
