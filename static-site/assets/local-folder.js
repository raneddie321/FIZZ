/* A folder on this computer as a FIZZ DEV project (File System Access API: Chrome and Edge on a computer).
   Opening reads the folder's text files (and images, as the project's usual binary files) into a project. From then on
   every change FIZZ makes is written to the real file, deleted files are deleted, and when the tab comes back to the
   front the folder is scanned so changes made outside FIZZ come in. The folder handle is kept in IndexedDB; after a
   reload the browser wants a click before it gives access again ("Reconnect folder"). See docs/roadmap/phase-2.md. */
(function () {
  "use strict";
  const F = window.FIZZ;
  const C = F.agentCore;

  const supported = () => typeof window.showDirectoryPicker === "function";
  const ALWAYS_SKIP = new Set([".git", "node_modules", "__pycache__", ".venv", "venv", ".next", ".nuxt", ".cache", ".turbo", ".vercel", ".netlify", ".gradle", ".idea", ".DS_Store", "Thumbs.db"]);
  const MAX_FILES = 6000, MAX_TEXT = 2_000_000, MAX_BINARY = 3_000_000, BATCH = 48;
  const isBinaryName = (path) => F.blobs.BINARY_EXT.test(path) || /\.(mp[34]|mov|avi|webm|wav|ogg|flac|zip|gz|tgz|rar|7z|exe|dll|so|dylib|bin|jar|class|wasm|woff2?|ttf|otf|eot|psd|ai|sketch|fig|sqlite|db)$/i.test(path);

  // ---------- handles (kept in IndexedDB so a project stays linked after a reload) ----------
  let dbp = null;
  const db = () => (dbp ||= new Promise((resolve) => {
    let req;
    try { req = indexedDB.open("fizz-local", 1); } catch { return resolve(null); }
    req.onupgradeneeded = () => req.result.createObjectStore("handles");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  }));
  async function inStore(mode, fn) {
    const d = await db();
    if (!d) return null;
    return new Promise((resolve) => {
      const tx = d.transaction("handles", mode);
      const req = fn(tx.objectStore("handles"));
      tx.oncomplete = () => resolve(req?.result ?? null);
      tx.onerror = tx.onabort = () => resolve(null);
    });
  }
  const idbHandles = { get: (id) => inStore("readonly", (s) => s.get(id)), put: (id, handle) => inStore("readwrite", (s) => s.put(handle, id)), delete: (id) => inStore("readwrite", (s) => s.delete(id)) };
  // window.__FIZZ_HANDLE_STORE replaces it in the end-to-end tests: headless Chromium crashes when a handle of its
  // private file system (the tests' stand-in for a picked folder) is read back from IndexedDB.
  const handles = () => window.__FIZZ_HANDLE_STORE || idbHandles;

  // projectId → { handle, snapshot: Map(path → value last written to or read from disk), disk: Map(path → "mtime:size"), ignore, busy }
  const links = new Map();
  const stamp = (file) => `${file.lastModified}:${file.size}`;

  // ---------- walking a folder ----------
  /** Every file under the folder that isn't ignored: [{ path, handle }], and what was left out. */
  async function walk(root) {
    const out = [], skipped = { ignored: 0, tooMany: 0 };
    let ignore = () => false;
    try { ignore = C.ignoreMatcher(await (await (await root.getFileHandle(".gitignore")).getFile()).text()); } catch {}
    const visit = async (dir, prefix) => {
      const entries = [];
      for await (const [name, handle] of dir.entries()) entries.push([name, handle]);
      entries.sort((a, b) => a[0].localeCompare(b[0]));
      for (const [name, handle] of entries) {
        const path = prefix ? `${prefix}/${name}` : name;
        const isDir = handle.kind === "directory";
        if (ALWAYS_SKIP.has(name) || ignore(path, isDir)) { skipped.ignored++; continue; }
        if (isDir) await visit(handle, path);
        else if (out.length >= MAX_FILES) skipped.tooMany++;
        else out.push({ path, handle });
      }
    };
    await visit(root, "");
    return { list: out, skipped, ignore };
  }
  /** Reads one file into the value a project keeps: text, a binary marker, or null when it's left out. */
  async function load(path, file) {
    if (isBinaryName(path)) {
      if (file.size > MAX_BINARY || !F.blobs.BINARY_EXT.test(path)) return null;
      return F.blobs.put(await file.arrayBuffer(), F.blobs.mimeFor(path) || file.type);
    }
    if (file.size > MAX_TEXT) return null;
    const text = await file.text();
    return text.includes("\u0000") ? null : text; // a binary file with a text-like name
  }
  async function inBatches(items, fn) {
    for (let i = 0; i < items.length; i += BATCH) await Promise.all(items.slice(i, i + BATCH).map(fn));
  }

  // ---------- open ----------
  /**
   * Lets the user choose a folder and reads it. → { name, handle, files, disk, skipped: { ignored, tooBig, tooMany } }
   * Throws with name "AbortError" when the user closes the picker.
   */
  async function pick() {
    if (!supported()) throw Object.assign(new Error("Opening a folder from this computer works in Chrome or Edge on a computer. Here you can import from GitHub or upload a ZIP instead."), { code: "unsupported" });
    const handle = await window.showDirectoryPicker({ mode: "readwrite" });
    return read(handle);
  }
  async function read(handle) {
    const { list, skipped } = await walk(handle);
    const files = {}, disk = new Map();
    let tooBig = 0;
    await inBatches(list, async ({ path, handle: fh }) => {
      try {
        const file = await fh.getFile();
        const value = await load(path, file);
        if (value === null) { tooBig++; return; }
        files[path] = value;
        disk.set(path, stamp(file));
      } catch { tooBig++; }
    });
    // Object keys in path order, whatever order the reads finished in.
    const ordered = {};
    for (const p of Object.keys(files).sort()) ordered[p] = files[p];
    return { name: handle.name, handle, files: ordered, disk, skipped: { ...skipped, tooBig } };
  }
  /** Ties a project to the folder it was read from. */
  async function link(project, opened) {
    project.local = { name: opened.name, at: Date.now() };
    links.set(project.id, { handle: opened.handle, snapshot: new Map(Object.entries(opened.files)), disk: opened.disk, busy: false });
    await handles().put(project.id, opened.handle);
  }
  async function unlink(project) {
    delete project.local;
    links.delete(project.id);
    await handles().delete(project.id);
  }

  // ---------- state ----------
  /** "none" | "connected" | "reconnect" (a click is needed) | "missing" (linked on another browser) | "unsupported" */
  async function status(project) {
    if (!project?.local) return "none";
    if (!supported()) return "unsupported";
    const l = links.get(project.id);
    const handle = l?.handle || (await handles().get(project.id));
    if (!handle) return "missing";
    try { return (await handle.queryPermission({ mode: "readwrite" })) === "granted" ? (l ? "connected" : "reconnect") : "reconnect"; } catch { return "missing"; }
  }
  /** After a reload (needs a click): ask for access again, then bring the project and the folder in line. */
  async function reconnect(project) {
    const handle = links.get(project.id)?.handle || (await handles().get(project.id));
    if (!handle) throw new Error("This browser doesn't remember that folder. Open it again from the New project menu.");
    if ((await handle.requestPermission({ mode: "readwrite" })) !== "granted") throw new Error("Access to the folder wasn't given.");
    // What the project holds is what FIZZ last knew; what differs on disk now is an outside change.
    links.set(project.id, { handle, snapshot: new Map(Object.entries(project.files)), disk: new Map(), busy: false });
    return scan(project, { first: true });
  }

  // ---------- FIZZ → disk ----------
  async function dirFor(root, path, create) {
    let dir = root;
    const parts = path.split("/");
    for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part, { create });
    return { dir, name: parts.at(-1) };
  }
  /** Writes what changed in the project since the last sync to the folder. → { written, deleted, failed } */
  async function sync(project) {
    const l = links.get(project?.id);
    if (!l || l.busy) return { written: 0, deleted: 0, failed: 0, skipped: true };
    l.busy = true;
    const res = { written: 0, deleted: 0, failed: 0 };
    try {
      for (const [path, value] of Object.entries(project.files)) {
        if (l.snapshot.get(path) === value) continue;
        try {
          const { dir, name } = await dirFor(l.handle, path, true);
          const fh = await dir.getFileHandle(name, { create: true });
          const w = await fh.createWritable();
          await w.write(F.blobs.isBlob(value) ? await F.blobs.get(value) : String(value));
          await w.close();
          l.snapshot.set(path, value);
          l.disk.set(path, stamp(await fh.getFile()));
          res.written++;
        } catch (e) { res.failed++; console.warn("[FIZZ] Couldn't write", path, e); }
      }
      for (const path of [...l.snapshot.keys()]) {
        if (project.files[path] !== undefined) continue;
        try { const { dir, name } = await dirFor(l.handle, path, false); await dir.removeEntry(name); res.deleted++; } catch (e) { if (e?.name !== "NotFoundError") { res.failed++; console.warn("[FIZZ] Couldn't delete", path, e); } }
        l.snapshot.delete(path);
        l.disk.delete(path);
      }
    } finally { l.busy = false; }
    return res;
  }
  // Called after every save: linked projects are written a moment later (grouped).
  let timer = 0;
  const listeners = new Set();
  function queue(data) {
    if (!links.size) return;
    clearTimeout(timer);
    timer = setTimeout(async () => {
      for (const p of data.projects || []) {
        if (!links.has(p.id)) continue;
        const r = await sync(p);
        if (r.failed) listeners.forEach((fn) => fn({ project: p, failed: r.failed }));
      }
    }, 400);
  }

  // ---------- disk → FIZZ ----------
  /** Brings in what changed in the folder outside FIZZ. → { changed: [paths], added: [paths], removed: [paths] } */
  async function scan(project, { first = false } = {}) {
    const l = links.get(project?.id);
    const out = { changed: [], added: [], removed: [] };
    if (!l || l.busy) return out;
    l.busy = true;
    try {
      const { list } = await walk(l.handle);
      const seen = new Set();
      await inBatches(list, async ({ path, handle }) => {
        try {
          const file = await handle.getFile();
          seen.add(path);
          const st = stamp(file);
          if (l.disk.get(path) === st) return;
          const had = project.files[path];
          // A file FIZZ changed and hasn't written yet keeps FIZZ's version (it is written by the next sync).
          if (!first && had !== undefined && had !== l.snapshot.get(path)) return;
          const value = await load(path, file);
          l.disk.set(path, st);
          if (value === null) return;
          if (typeof value === "string" && !F.blobs.isBlob(value) && value === had) { l.snapshot.set(path, had); return; }
          if (F.blobs.isBlob(value) && F.blobs.isBlob(had) && F.blobs.info(had)?.size === file.size && first) { l.snapshot.set(path, had); return; } // same image as before the reload
          project.files[path] = value;
          l.snapshot.set(path, value);
          (had === undefined ? out.added : out.changed).push(path);
        } catch {}
      });
      for (const path of [...l.snapshot.keys()]) {
        if (seen.has(path) || project.files[path] === undefined) continue;
        if (project.files[path] !== l.snapshot.get(path)) continue; // changed in FIZZ since: it will be written back
        if (list.length >= MAX_FILES) continue; // the listing was cut off: absence proves nothing
        delete project.files[path];
        l.snapshot.delete(path);
        l.disk.delete(path);
        out.removed.push(path);
      }
    } finally { l.busy = false; }
    return out;
  }

  F.localFolder = {
    supported, pick, read, link, unlink, status, reconnect, sync, scan, queue,
    linked: (project) => links.has(project?.id),
    onProblem: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
  };
})();
