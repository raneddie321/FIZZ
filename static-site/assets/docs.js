/* Documents and files Fizz Code makes: HTML → PDF, SVG → PNG and app icon sets, single-file HTML,
   plus file cards in the chat. DOCX / XLSX / PPTX / vector PDF are written by scripts that run in the
   terminal's worker (require("docx"), require("xlsx"), require("pptxgenjs"), require("jspdf"), require("pdf-lib")). */
(function () {
  "use strict";
  const F = window.FIZZ;
  const { esc } = F;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const vendor = (name) => new URL(`vendor/docs/${name}`, location.href).href;

  const loaded = {};
  function script(name) {
    loaded[name] ||= new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = vendor(name);
      s.onload = resolve;
      s.onerror = () => reject(new Error(`Couldn't load ${name}`));
      document.head.appendChild(s);
    });
    return loaded[name];
  }

  /**
   * Renders a page in a hidden, sandboxed frame and captures it with html-to-image (inside the frame, so the
   * project's code never runs with FIZZ's origin). mode "viewport" → one image; "pages" → one per page.
   */
  async function capture(html, { width = 794, height = 1123, mode = "pages", scale = 2, quality = 0.92, frame = null } = {}) {
    const own = !frame;
    if (own) {
      frame = document.createElement("iframe");
      frame.setAttribute("sandbox", "allow-scripts");
      frame.setAttribute("aria-hidden", "true");
      frame.style.cssText = `position:fixed;left:-10000px;top:0;width:${width}px;height:${height}px;border:0;background:#fff`;
      document.body.appendChild(frame);
      await new Promise((r) => { frame.onload = r; frame.srcdoc = html; });
      await sleep(700);
    }
    const id = F.uid();
    try {
      return await new Promise((resolve, reject) => {
        const timer = setTimeout(() => { removeEventListener("message", on); reject(new Error("The page took too long to render.")); }, 30000);
        function on(e) {
          if (e.source !== frame.contentWindow || e.data?.fizz !== "captured" || e.data.id !== id) return;
          clearTimeout(timer);
          removeEventListener("message", on);
          e.data.error ? reject(new Error(e.data.error)) : resolve(e.data.images);
        }
        addEventListener("message", on);
        frame.contentWindow.postMessage({ fizz: "capture", id, lib: vendor("html-to-image.js"), mode, width, height, scale, quality }, "*");
      });
    } finally {
      if (own) frame.remove();
    }
  }
  /** The listener added to every preview page (see BRIDGE in dev.js). */
  const CAPTURE_BRIDGE = `addEventListener("message",function(e){var d=e.data;if(!d||d.fizz!=="capture")return;function done(x){parent.postMessage(Object.assign({fizz:"captured",id:d.id},x),"*")}function go(){var el=document.documentElement,s=d.scale||1,W=d.width||innerWidth,full=Math.max(el.scrollHeight,document.body?document.body.scrollHeight:0,innerHeight),vp=d.mode==="viewport",bg=getComputedStyle(document.body||el).backgroundColor;bg=bg&&bg!=="rgba(0, 0, 0, 0)"?bg:"#ffffff";htmlToImage.toSvg(el,{width:W,height:full,backgroundColor:bg,imagePlaceholder:"data:image/gif;base64,R0lGODlhAQABAAAAACw=",cacheBust:false}).then(function(svg){return new Promise(function(ok,bad){var im=new Image();im.onload=function(){ok(im)};im.onerror=function(){bad(new Error("The page couldn't be drawn"))};im.src=svg})}).then(function(im){var c=document.createElement("canvas");c.width=Math.round(W*s);c.height=Math.round(full*s);var cg=c.getContext("2d");cg.fillStyle=bg;cg.fillRect(0,0,c.width,c.height);cg.drawImage(im,0,0,c.width,c.height);if(vp){var v=document.createElement("canvas");v.width=Math.round(innerWidth*s);v.height=Math.round(innerHeight*s);var vg=v.getContext("2d");vg.fillStyle=bg;vg.fillRect(0,0,v.width,v.height);vg.drawImage(c,Math.round(scrollX*s),Math.round(scrollY*s),v.width,v.height,0,0,v.width,v.height);return done({images:[v.toDataURL("image/jpeg",d.quality||.8)]})}var ph=Math.round((d.height||1123)*s),out=[];for(var y=0;y<c.height;y+=ph){var p=document.createElement("canvas");p.width=c.width;p.height=ph;var g=p.getContext("2d");g.fillStyle="#fff";g.fillRect(0,0,p.width,p.height);var h=Math.min(ph,c.height-y);g.drawImage(c,0,y,c.width,h,0,0,c.width,h);out.push(p.toDataURL("image/jpeg",d.quality||.92));if(out.length>=60)break}done({images:out})}).catch(function(err){done({error:String(err&&err.message||err)})})}if(window.htmlToImage)return go();var sc=document.createElement("script");sc.src=d.lib;sc.onload=go;sc.onerror=function(){done({error:"The capture library could not load"})};document.head.appendChild(sc)});`;

  const PAGE = { a4: [794, 1123], letter: [816, 1056], a5: [559, 794], square: [1080, 1080] };
  async function htmlToPdf(ctx, from, to, { format = "a4", landscape = false } = {}) {
    let [w, h] = PAGE[format] || PAGE.a4;
    if (landscape) [w, h] = [h, w];
    const { html, entry } = ctx.buildPreview(from, { forCapture: true });
    if (!entry) throw new Error(`There's no HTML file called ${from}.`);
    const pages = await capture(html, { width: w, height: h, mode: "pages", scale: 2 });
    await script("jspdf.umd.min.js");
    const pdf = new window.jspdf.jsPDF({ unit: "px", format: [w, h], orientation: w > h ? "landscape" : "portrait", hotfixes: ["px_scaling"], compress: true });
    pages.forEach((img, i) => { if (i) pdf.addPage([w, h], w > h ? "landscape" : "portrait"); pdf.addImage(img, "JPEG", 0, 0, w, h); });
    const marker = await F.blobs.put(pdf.output("blob"), "application/pdf");
    ctx.writeFile(to, marker);
    return { pages: pages.length, marker };
  }

  async function svgToPng(svgText, size) {
    const svg = /xmlns=/.test(svgText) ? svgText : svgText.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
    const img = new Image();
    await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = () => reject(new Error("The SVG couldn't be drawn.")); img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`; });
    const c = document.createElement("canvas");
    const ratio = (img.naturalHeight || 1) / (img.naturalWidth || 1);
    c.width = size; c.height = Math.round(size * (ratio || 1));
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    return new Promise((r) => c.toBlob(r, "image/png"));
  }
  async function imageFileToPng(ctx, from, size) {
    const v = ctx.project().files[from];
    if (v === undefined) throw new Error(`There's no file called ${from}.`);
    if (!F.blobs.isBlob(v)) return svgToPng(v, size);
    const url = await F.blobs.url(v);
    const img = new Image();
    await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = () => reject(new Error(`${from} isn't an image.`)); img.src = url; });
    const c = document.createElement("canvas");
    c.width = size; c.height = Math.round(size * img.naturalHeight / img.naturalWidth);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    return new Promise((r) => c.toBlob(r, "image/png"));
  }
  /** A .ico with PNG images inside (supported by every current browser and Windows). */
  async function ico(pngs) {
    const bufs = await Promise.all(pngs.map(async ([size, b]) => [size, new Uint8Array(await b.arrayBuffer())]));
    const head = 6 + 16 * bufs.length;
    const total = head + bufs.reduce((n, [, b]) => n + b.length, 0);
    const out = new Uint8Array(total);
    const v = new DataView(out.buffer);
    v.setUint16(2, 1, true); v.setUint16(4, bufs.length, true);
    let off = head;
    bufs.forEach(([size, b], i) => {
      const e = 6 + 16 * i;
      out[e] = size >= 256 ? 0 : size; out[e + 1] = size >= 256 ? 0 : size;
      v.setUint16(e + 4, 1, true); v.setUint16(e + 6, 32, true); v.setUint32(e + 8, b.length, true); v.setUint32(e + 12, off, true);
      out.set(b, off); off += b.length;
    });
    return new Blob([out], { type: "image/x-icon" });
  }
  const ICON_SIZES = [16, 32, 48, 72, 96, 128, 144, 152, 180, 192, 256, 384, 512];
  async function iconSet(ctx, from, dir = "icons") {
    dir = dir.replace(/\/+$/, "");
    const made = [];
    const pngs = {};
    for (const size of ICON_SIZES) {
      pngs[size] = await imageFileToPng(ctx, from, size);
      const path = `${dir}/icon-${size}.png`;
      ctx.writeFile(path, await F.blobs.put(pngs[size], "image/png"));
      made.push(path);
    }
    ctx.writeFile("favicon.ico", await F.blobs.put(await ico([[16, pngs[16]], [32, pngs[32]], [48, pngs[48]]]), "image/x-icon"));
    ctx.writeFile(`${dir}/apple-touch-icon.png`, await F.blobs.put(pngs[180], "image/png"));
    made.push("favicon.ico", `${dir}/apple-touch-icon.png`);
    const manifest = { name: ctx.project().name, short_name: ctx.project().name.slice(0, 12), start_url: "./", display: "standalone", background_color: "#ffffff", theme_color: "#111827", icons: [192, 256, 384, 512].map((s) => ({ src: `${dir}/icon-${s}.png`, sizes: `${s}x${s}`, type: "image/png", purpose: "any maskable" })) };
    if (ctx.project().files["manifest.webmanifest"] === undefined) { ctx.writeFile("manifest.webmanifest", JSON.stringify(manifest, null, 2) + "\n"); made.push("manifest.webmanifest"); }
    return made;
  }

  /** The whole site in one HTML file (CSS, JS and images inlined), to send or open anywhere. */
  async function singleHtml(ctx, entry) {
    await F.blobs.warmData(ctx.project().files);
    const { html } = ctx.buildPreview(entry, { bridge: false });
    return new Blob([html], { type: "text/html" });
  }

  // ---------- file cards in the chat ----------
  const KIND = (path) => {
    const ext = path.split(".").pop().toLowerCase();
    return { pdf: "PDF", docx: "DOC", xlsx: "XLS", pptx: "PPT", png: "PNG", jpg: "JPG", jpeg: "JPG", gif: "GIF", webp: "IMG", svg: "SVG", zip: "ZIP", apk: "APK", aab: "AAB", ico: "ICO", html: "HTML", csv: "CSV", md: "MD", json: "JSON" }[ext] || ext.slice(0, 4).toUpperCase();
  };
  function card(files, path) {
    const v = files[path];
    if (v === undefined) return `<div class="file-card missing"><span class="fc-ic">?</span><div class="fc-body"><b>${esc(path)}</b><small>Not found in the project</small></div></div>`;
    const bin = F.blobs.isBlob(v);
    const meta = bin ? F.blobs.describe(v).split(", ").pop() : `${v.split("\n").length} lines`;
    const image = /\.(png|jpe?g|gif|webp|svg|ico)$/i.test(path);
    return `<div class="file-card" data-file-card="${esc(path)}">${image ? `<img class="fc-thumb" data-blob-path="${esc(path)}" alt="" />` : `<span class="fc-ic k-${KIND(path).toLowerCase()}">${KIND(path)}</span>`}
      <div class="fc-body"><b>${esc(path.split("/").pop())}</b><small>${esc(path.includes("/") ? path.slice(0, path.lastIndexOf("/")) + " · " : "")}${esc(meta)}</small></div>
      <div class="fc-actions"><button type="button" class="btn btn-outline btn-sm" data-open-file="${esc(path)}">Open</button><button type="button" class="btn btn-sm" data-dl="${esc(path)}">Download</button></div></div>`;
  }
  /** Fills image thumbnails in file cards after the thread renders. */
  async function hydrate(root, files) {
    for (const img of root.querySelectorAll("img[data-blob-path]:not([src])")) {
      const v = files[img.dataset.blobPath];
      if (v === undefined) continue;
      img.src = F.blobs.isBlob(v) ? await F.blobs.url(v) : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(v)}`;
    }
  }
  async function downloadFile(files, path) {
    const v = files[path];
    if (v === undefined) return F.toast("That file isn't in the project anymore.");
    const blob = F.blobs.isBlob(v) ? await F.blobs.get(v) : new Blob([v], { type: "text/plain" });
    if (!blob) return F.toast("The file's data is missing from this browser.");
    F.download(path.split("/").pop(), blob);
  }

  // ---------- tools ----------
  F.agentTools.register("export", {
    icon: "⇩", feedback: true,
    label: (t) => `Export ${t.attrs.from || ""} → ${t.attrs.to || t.attrs.format || ""}`,
    summary: (k) => `exported ${k} file${k === 1 ? "" : "s"}`,
    prompt: '<fizz-export from="doc.html" to="doc.pdf" format="a4|letter|a5" landscape="false"/> turns an HTML page of the project into a PDF (lay out each page as an element exactly 794×1123px for A4 so pages break cleanly; text becomes an image, so for selectable text write a jsPDF/pdf-lib script instead). <fizz-export from="logo.svg" to="logo.png" width="512"/> makes a PNG from an SVG or image. <fizz-export from="logo.svg" format="icons"/> makes a full app icon set (icons/icon-*.png, favicon.ico, apple-touch-icon, manifest.webmanifest).',
    async run(t, ctx) {
      const { from, to, format = "", width } = t.attrs;
      if (!from) return { ok: false, text: "export needs from=\"…\"" };
      if (format === "icons") { const made = await iconSet(ctx, from, to || "icons"); return { ok: true, text: `Created ${made.length} files: ${made.join(", ")}`, files: made }; }
      if (/\.pdf$/i.test(to || "")) {
        const r = await htmlToPdf(ctx, from, to, { format: (format || "a4").toLowerCase(), landscape: t.attrs.landscape === "true" });
        return { ok: true, text: `Created ${to} (${r.pages} page${r.pages === 1 ? "" : "s"}, ${F.blobs.describe(r.marker).split(", ").pop()}).`, files: [to] };
      }
      if (/\.png$/i.test(to || "")) {
        const png = await imageFileToPng(ctx, from, Math.min(4096, Number(width) || 512));
        ctx.writeFile(to, await F.blobs.put(png, "image/png"));
        return { ok: true, text: `Created ${to}.`, files: [to] };
      }
      return { ok: false, text: `Can't export ${from} to ${to}. Supported: .pdf from HTML, .png from SVG/images, format="icons".` };
    },
  });
  F.agentTools.register("attach", {
    icon: "📎", card: true,
    label: (t) => `Attach ${t.attrs.path || t.body}`,
    prompt: '<fizz-attach path="report.pdf"/> shows a project file to the user as a card with Download (use it for documents, images and files you made for them).',
    async run(t, ctx) {
      const path = (t.attrs.path || t.body || "").replace(/^\.?\/+/, "");
      return { ok: ctx.project().files[path] !== undefined, text: path, files: [path] };
    },
  });

  F.docs = { capture, CAPTURE_BRIDGE, htmlToPdf, svgToPng, iconSet, singleHtml, card, hydrate, downloadFile, script };
})();
