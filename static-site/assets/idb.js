/* FIZZ storage: projects and conversations live in IndexedDB, so they aren't held back by localStorage's ~5 MB.
   localStorage keeps the small part of a user's data — settings and the ordered lists of ids — under the same key as
   before ("fizz.data.<user>", now with v: 2). F.loadData and F.saveData work exactly as before for the apps: the data
   is one in-memory object, saving returns at once, and the changed projects/conversations are written a moment later.
   Without IndexedDB everything stays in localStorage as it always was. See docs/roadmap/phase-0.md. */
(function () {
  "use strict";
  const F = window.FIZZ;
  const DB = "fizz", STORE = "records";
  const LISTS = [["projects", "projectIds"], ["conversations", "conversationIds"]];
  const dataKey = (uid) => `fizz.data.${uid}`;
  const journalKey = (uid) => `fizz.journal.${uid}`;
  const JOURNAL_MAX = 1_500_000;

  // ---------- IndexedDB ----------
  // Records: { id, json } for a project (without its files) or a conversation, and { id: "f\0<project>\0<path>", text }
  // for each project file — so changing one file writes one small record, however big the project is.
  const FILE = "f\u0000";
  const fileKey = (pid, path) => `${FILE}${pid}\u0000${path}`;
  // File contents are strings; anything else (not expected, but never dropped) is kept as JSON behind a marker.
  const JSON_MARK = "\u0001json:";
  const enc = (v) => (typeof v === "string" ? v : JSON_MARK + JSON.stringify(v));
  const dec = (t) => { if (!t.startsWith(JSON_MARK)) return t; try { return JSON.parse(t.slice(JSON_MARK.length)); } catch { return t; } };
  let dbPromise = null;
  function openDb() {
    dbPromise ||= new Promise((resolve) => {
      let req;
      try { req = indexedDB.open(DB, 1); } catch { return resolve(null); }
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
      req.onsuccess = () => { const db = req.result; db.onversionchange = () => db.close(); resolve(db); };
      req.onerror = req.onblocked = () => resolve(null);
    });
    return dbPromise;
  }
  const done = (tx) => new Promise((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = tx.onabort = () => reject(tx.error || new Error("Storage error")); });
  /** The records for these ids, and every file record of these projects. null when IndexedDB can't be opened. */
  async function read(ids, projectIds) {
    const db = await openDb();
    if (!db) return null;
    const records = new Map(), files = new Map(projectIds.map((id) => [id, []]));
    if (!ids.length) return { records, files };
    const tx = db.transaction(STORE, "readonly");
    const store = tx.objectStore(STORE);
    for (const id of ids) store.get(id).onsuccess = (e) => { if (e.target.result) records.set(id, e.target.result); };
    for (const pid of projectIds) store.getAll(IDBKeyRange.bound(fileKey(pid, ""), fileKey(pid, "￿"))).onsuccess = (e) => files.set(pid, e.target.result || []);
    await done(tx);
    return { records, files };
  }
  async function write(puts, deletes) {
    const db = await openDb();
    if (!db) throw new Error("no storage");
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    for (const r of puts) store.put(r);
    for (const id of deletes) store.delete(id);
    await done(tx);
  }

  // ---------- per-user state ----------
  const coreLoad = F.loadData, coreSave = F.saveData;
  // uid → { d, mode: "legacy" | "idb" | "partial", fp: Map(id → fingerprint of its json), files: Map(file key → the text last written), known: Set(id) }
  const states = new Map();
  const hash = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619); return `${str.length}.${h >>> 0}`; };
  const readLight = (uid) => { try { return JSON.parse(localStorage.getItem(dataKey(uid)) || "null"); } catch { return null; } };
  const listIds = (stored, idsKey) => (Array.isArray(stored?.[idsKey]) ? stored[idsKey] : []);

  function stateFor(user) {
    let st = states.get(user.id);
    if (st) return st;
    const stored = readLight(user.id);
    const d = coreLoad(user);
    st = { uid: user.id, d, fp: new Map(), files: new Map(), known: new Set(), timer: 0, flushing: null };
    states.set(user.id, st);
    if (stored?.v === 2) {
      // The lists are filled in from IndexedDB; until then nothing may be saved over them.
      st.mode = "partial";
      st.ready = hydrate(st, stored);
    } else {
      // Data from before this change: all of it is already in memory. It moves to IndexedDB on the first save.
      st.mode = "legacy";
      st.ready = Promise.resolve();
    }
    return st;
  }

  async function hydrate(st, stored) {
    const projectIds = listIds(stored, "projectIds");
    let got = null;
    try { got = await read(LISTS.flatMap(([, idsKey]) => listIds(stored, idsKey)), projectIds); } catch { got = null; }
    if (!got) {
      console.error("[FIZZ] Couldn't open this browser's storage for projects and chats.");
      setTimeout(() => F.toast?.("Couldn't open this browser's storage for your projects and chats. Reload the page."), 600);
      return; // stays "partial": settings can be saved, the lists are left alone
    }
    // Changes that didn't reach IndexedDB before the page closed last time are applied on top.
    let journal = null;
    try { journal = JSON.parse(localStorage.getItem(journalKey(st.uid)) || "null"); } catch {}
    const late = new Set();
    for (const r of journal?.puts || []) {
      if (!r?.id) continue;
      late.add(r.id);
      if (r.id.startsWith(FILE)) { const pid = r.id.split("\u0000")[1]; const list = got.files.get(pid); if (list) { const i = list.findIndex((x) => x.id === r.id); if (i >= 0) list[i] = r; else list.push(r); } }
      else got.records.set(r.id, r);
    }
    const gone = new Set(journal?.deletes || []);
    for (const [list, idsKey] of LISTS) {
      const early = st.d[list] || []; // anything added before storage was ready stays
      const loaded = [];
      for (const id of listIds(stored, idsKey)) {
        const r = got.records.get(id);
        st.known.add(id); // listed but gone: dropped from the list at the next save
        if (!r) continue;
        let item;
        try { item = JSON.parse(r.json); } catch { continue; }
        if (!late.has(id)) st.fp.set(id, hash(r.json));
        if (list === "projects") {
          item.files = {};
          for (const f of got.files.get(id) || []) {
            if (gone.has(f.id) || typeof f.text !== "string") continue;
            item.files[f.id.slice(fileKey(id, "").length)] = dec(f.text);
            if (!late.has(f.id)) st.files.set(f.id, f.text);
            else st.files.set(f.id, null); // from the journal: written again below
          }
          for (const k of gone) if (k.startsWith(fileKey(id, ""))) st.files.set(k, null); // deleted before closing: removed below
        }
        loaded.push(item);
      }
      const have = new Set(loaded.map((x) => x.id));
      st.d[list] = [...loaded, ...early.filter((x) => x?.id && !have.has(x.id))];
    }
    st.mode = "idb";
    if (journal || st.pendingSave) schedule(st, 0);
  }

  /** The small part that stays in localStorage: everything except the two big lists, plus their ids in order. */
  function light(st) {
    const out = { v: 2 };
    for (const [k, v] of Object.entries(st.d)) if (k !== "projects" && k !== "conversations") out[k] = v;
    const stored = readLight(st.uid);
    for (const [list, idsKey] of LISTS) {
      const ours = (st.d[list] || []).map((x) => x.id).filter(Boolean);
      // Ids another tab added since this one loaded are kept, not overwritten.
      const mine = new Set(ours);
      const foreign = stored?.v === 2 ? listIds(stored, idsKey).filter((id) => !mine.has(id) && !st.known.has(id)) : [];
      out[idsKey] = [...ours, ...foreign];
    }
    return out;
  }
  const writeLight = (st) => F.store.set(dataKey(st.uid), light(st));

  /** What changed since the last write: records to put and ids to delete. */
  function changes(st) {
    const puts = [], now = new Set(), filesNow = new Set(), at = Date.now();
    for (const [list] of LISTS) {
      for (const item of st.d[list] || []) {
        if (!item?.id) continue;
        now.add(item.id);
        let meta = item;
        if (list === "projects") {
          const { files, ...rest } = item;
          meta = rest;
          for (const [path, value] of Object.entries(files || {})) {
            if (value === undefined) continue;
            const text = enc(value);
            const key = fileKey(item.id, path);
            filesNow.add(key);
            if (st.files.get(key) !== text) puts.push({ id: key, text, at }); // same string → nothing to write
          }
        }
        const json = JSON.stringify(meta);
        const fp = hash(json);
        if (st.fp.get(item.id) !== fp) puts.push({ id: item.id, json, fp, at });
      }
    }
    const deletes = [...[...st.known].filter((id) => !now.has(id)), ...[...st.files.keys()].filter((k) => !filesNow.has(k))];
    // A deleted project takes its files with it (they're all in st.files, so they're covered above).
    return { puts, deletes };
  }
  function settle(st, { puts, deletes }) {
    for (const p of puts) {
      if (p.id.startsWith(FILE)) st.files.set(p.id, p.text);
      else { st.fp.set(p.id, p.fp); st.known.add(p.id); }
    }
    for (const id of deletes) { st.files.delete(id); st.fp.delete(id); st.known.delete(id); }
  }

  async function flush(st) {
    if (st.mode === "partial") { st.pendingSave = true; return; }
    if (st.flushing) { st.again = true; return st.flushing; }
    st.flushing = (async () => {
      try {
        const ch = changes(st);
        if (ch.puts.length || ch.deletes.length) {
          await write(ch.puts.map(({ fp, ...r }) => r), ch.deletes);
          settle(st, ch);
        } else if (st.mode === "legacy") await write([], []); // proves IndexedDB works before localStorage lets go
        // Only now, with everything safely in IndexedDB, does localStorage drop the big lists.
        st.mode = "idb";
        writeLight(st);
        try { localStorage.removeItem(journalKey(st.uid)); } catch {}
      } catch (e) {
        if (st.mode === "legacy") { st.noIdb = true; coreSave({ id: st.uid }, st.d); } // keep working the old way
        else { console.error("[FIZZ] Couldn't save", e); F.toast?.(e?.name === "QuotaExceededError" ? "Browser storage is full. Delete some chats or projects." : "Couldn't save your latest changes in this browser. Keep this tab open and try again."); }
      } finally {
        st.flushing = null;
        if (st.again) { st.again = false; schedule(st, 50); }
      }
    })();
    return st.flushing;
  }
  function schedule(st, ms) {
    clearTimeout(st.timer);
    st.timer = setTimeout(() => { st.timer = 0; flush(st); }, ms);
  }

  // ---------- the same API as before ----------
  F.loadData = (user) => stateFor(user).d;
  F.saveData = (user, d) => {
    const st = stateFor(user);
    if (d && d !== st.d) st.d = d;
    if (st.noIdb) return coreSave(user, st.d);
    if (st.mode === "legacy" && readLight(st.uid)?.v === 2) st.mode = "idb"; // another tab already moved the data over
    if (st.mode === "legacy") {
      // Until the first write to IndexedDB is confirmed, localStorage stays the place of record (as before).
      const ok = coreSave(user, st.d);
      schedule(st, 0);
      return ok;
    }
    if (st.mode === "partial") {
      // The lists aren't loaded: save the settings and leave the stored lists as they are.
      const stored = readLight(st.uid) || { v: 2 };
      const out = { ...stored };
      for (const [k, v] of Object.entries(st.d)) if (k !== "projects" && k !== "conversations") out[k] = v;
      st.pendingSave = true;
      return F.store.set(dataKey(st.uid), out);
    }
    const ids = LISTS.map(([list]) => (st.d[list] || []).map((x) => x.id).join(",")).join("|");
    const listChanged = ids !== st.lastIds;
    st.lastIds = ids;
    const ok = writeLight(st);
    // A new or deleted project/chat is written at once; edits are grouped for a moment.
    schedule(st, listChanged ? 0 : 250);
    return ok;
  };

  // When the page is hidden or closed: write now, and keep a small copy of what's unsaved in case the write is cut off.
  function park() {
    for (const st of states.values()) {
      if (st.mode !== "idb") continue;
      clearTimeout(st.timer); st.timer = 0;
      let pending;
      try { pending = changes(st); } catch { continue; }
      if (!pending.puts.length && !pending.deletes.length) continue;
      // Biggest records are left out if the copy would be too large; the write below still carries them.
      const puts = []; let size = 0;
      for (const p of [...pending.puts].sort((x, y) => (x.text ?? x.json).length - (y.text ?? y.json).length)) {
        size += (p.text ?? p.json).length;
        if (size > JOURNAL_MAX) break;
        const { fp, ...r } = p; puts.push(r);
      }
      try { localStorage.setItem(journalKey(st.uid), JSON.stringify({ at: Date.now(), puts, deletes: pending.deletes })); } catch {}
      flush(st);
    }
  }
  addEventListener("pagehide", park);
  document.addEventListener("visibilitychange", () => { if (document.hidden) park(); });

  // ---------- start ----------
  const current = (() => { try { return F.auth.current(); } catch { return null; } })();
  const ready = current ? stateFor(current).ready.catch(() => {}) : Promise.resolve();
  /** Loads the apps' scripts once the user's data is in memory (they read it as soon as they run). */
  function boot(srcs) {
    ready.then(() => {
      for (const src of srcs) { const s = document.createElement("script"); s.src = src; s.async = false; document.body.appendChild(s); }
    });
  }
  F.storage = {
    ready, boot,
    /** Writes everything that's pending; resolves when it's on disk. */
    flush: async () => { for (const st of states.values()) { clearTimeout(st.timer); st.timer = 0; await flush(st); if (st.flushing) await st.flushing; } },
    /** "idb" | "legacy" | "partial" for the current user (legacy: still all in localStorage). */
    mode: () => (current ? states.get(current.id)?.mode : "legacy"),
  };
})();
