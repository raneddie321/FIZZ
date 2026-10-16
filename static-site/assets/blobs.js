/* Binary files in FIZZ DEV projects (PDF, DOCX, XLSX, PPTX, images…). The bytes live in IndexedDB —
   localStorage is too small — and the project keeps a short marker string in their place:
   "\u0000blob:{"id":"…","type":"application/pdf","size":12345}". */
(function () {
  "use strict";
  const F = window.FIZZ;
  const PREFIX = "\u0000blob:";
  const MIME = {
    pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", ico: "image/x-icon", svgz: "image/svg+xml",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    zip: "application/zip", apk: "application/vnd.android.package-archive", aab: "application/octet-stream", mp3: "audio/mpeg", wav: "audio/wav", mp4: "video/mp4", woff2: "font/woff2", ttf: "font/ttf", otf: "font/otf",
  };
  const mimeFor = (path) => MIME[String(path).split(".").pop().toLowerCase()] || "application/octet-stream";
  /** File types FIZZ DEV stores as binary rather than text. */
  const BINARY_EXT = /\.(pdf|png|jpe?g|gif|webp|ico|docx|xlsx|pptx|zip|apk|aab|mp3|wav|mp4|woff2?|ttf|otf)$/i;

  let dbp = null;
  function db() {
    dbp ||= new Promise((resolve, reject) => {
      const req = indexedDB.open("fizz-blobs", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("blobs");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbp;
  }
  async function tx(mode, fn) {
    const d = await db();
    return new Promise((resolve, reject) => {
      const t = d.transaction("blobs", mode);
      const r = fn(t.objectStore("blobs"));
      t.oncomplete = () => resolve(r?.result);
      t.onerror = () => reject(t.error);
    });
  }

  const isBlob = (v) => typeof v === "string" && v.startsWith(PREFIX);
  function info(v) { try { return JSON.parse(v.slice(PREFIX.length)); } catch { return null; } }
  const human = (n) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB` : `${(n / 1048576).toFixed(1)} MB`);
  function describe(v) { const i = info(v); return i ? `${i.type}, ${human(i.size)}` : "binary"; }

  /** Stores bytes and returns the marker to put in the project. */
  async function put(data, type = "application/octet-stream") {
    const blob = data instanceof Blob ? data : new Blob([data], { type });
    if (blob.size > 50 * 1048576) throw new Error("Files over 50 MB can't be stored in the browser.");
    const id = F.uid();
    await tx("readwrite", (s) => s.put(blob, id));
    return PREFIX + JSON.stringify({ id, type: blob.type || type, size: blob.size });
  }
  async function get(marker) {
    const i = info(marker);
    if (!i) return null;
    const b = await tx("readonly", (s) => s.get(i.id));
    return b || null;
  }
  const urls = new Map();
  /** An object URL for the file (cached). */
  async function url(marker) {
    if (urls.has(marker)) return urls.get(marker);
    const b = await get(marker);
    if (!b) return "";
    const u = URL.createObjectURL(b);
    urls.set(marker, u);
    return u;
  }
  const urlSync = (marker) => urls.get(marker) || "";
  /** Loads object URLs for every binary file in a project, so synchronous code (the preview) can use them. */
  async function warm(files) { await Promise.all(Object.values(files).filter(isBlob).map(url)); }
  async function base64(marker) {
    const b = await get(marker);
    if (!b) return "";
    const bytes = new Uint8Array(await b.arrayBuffer());
    let s = "";
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }
  async function dataUrl(marker) { const i = info(marker); return i ? `data:${i.type};base64,${await base64(marker)}` : ""; }
  const dataCache = new Map();
  /** Data URLs for every binary file, so the sandboxed preview (another origin) can show images. */
  async function warmData(files) {
    await Promise.all(Object.values(files).filter((v) => isBlob(v) && !dataCache.has(v) && (info(v)?.size || 0) < 8 * 1048576).map(async (v) => dataCache.set(v, await dataUrl(v))));
  }
  const dataSync = (marker) => dataCache.get(marker) || "";
  async function fromDataUrl(du) {
    const [head, b64] = du.split(",");
    const type = /data:([^;]+)/.exec(head)?.[1] || "application/octet-stream";
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return put(bytes, type);
  }

  F.blobs = { PREFIX, isBlob, info, describe, human, put, get, url, urlSync, warm, warmData, dataSync, base64, dataUrl, fromDataUrl, mimeFor, BINARY_EXT };
})();
