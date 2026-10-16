/* Cloud sync: FIZZ DEV projects and FIZZ chats follow the user's RanEddie ID to other devices.
   Stored per user on the FIZZ server (/api/sync, Upstash Redis) — never in RanEddie ID metadata.
   Only text is synced; binary files (PDFs, images…) stay in the browser that made them. */
(function () {
  "use strict";
  const F = window.FIZZ;
  if (!F) return;
  let user = null, data = null, busy = false, again = false, timer = null, disabled = false;
  const metaKey = () => `fizz.sync.${user.rid.id}`;
  const loadMeta = () => F.store.get(metaKey(), { items: {} });
  const saveMeta = (m) => F.store.set(metaKey(), m);

  function hash(s) {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(36) + s.length.toString(36);
  }
  const cleanProject = (p) => ({ ...p, history: [], files: Object.fromEntries(Object.entries(p.files || {}).filter(([, v]) => !F.blobs?.isBlob(v))) });
  const cleanChats = (list) => list.map((c) => ({ ...c, messages: (c.messages || []).map((m) => (m.attachments?.length ? { ...m, attachments: m.attachments.map((a) => (a.type === "text" && (a.text || "").length < 60000 ? a : { type: a.type, name: a.name, mime: a.mime })) } : m)) }));

  /** What this browser has, as sync items. */
  function localItems() {
    const out = {};
    for (const p of data.projects || []) { const d = cleanProject(p); out[`p-${p.id}`] = { kind: "project", name: p.name, data: d, hash: hash(JSON.stringify(d)) }; }
    if ((data.conversations || []).length) { const d = cleanChats(data.conversations); out.chats = { kind: "chats", name: "FIZZ chats", data: d, hash: hash(JSON.stringify(d)) }; }
    return out;
  }

  function mergeChats(local, remote) {
    const byId = new Map(local.map((c) => [c.id, c]));
    for (const r of remote) {
      const l = byId.get(r.id);
      if (!l) { local.push(r); continue; }
      if ((r.updated || 0) > (l.updated || 0)) { const keep = l.messages; Object.assign(l, r); if (keep?.length > (r.messages || []).length) l.messages = keep; }
    }
  }

  async function pull(meta) {
    const { items } = await F.conn.sync.index();
    let changed = false;
    const local = localItems();
    for (const [id, r] of Object.entries(items)) {
      const m = meta.items[id];
      if (m && m.updated >= r.updated) continue;
      const mine = local[id];
      const editedHere = mine && (!m || mine.hash !== m.hash);
      const { data: remote } = await F.conn.sync.get(id);
      if (id === "chats") { data.conversations ||= []; mergeChats(data.conversations, remote || []); changed = true; }
      else if (id.startsWith("p-") && remote) {
        const p = (data.projects || []).find((x) => `p-${x.id}` === id);
        if (!p) { data.projects.push({ ...remote, history: [] }); changed = true; }
        else if (!editedHere) {
          const blobs = Object.fromEntries(Object.entries(p.files).filter(([k, v]) => F.blobs?.isBlob(v) && !(k in remote.files)));
          Object.assign(p, remote, { files: { ...remote.files, ...blobs }, history: p.history || [] });
          changed = true;
        } else {
          // Changed in both places: keep this browser's version and add the other one as a copy.
          data.projects.push({ ...remote, id: F.uid(), name: `${remote.name} (other device)`, history: [] });
          changed = true;
          F.toast(`“${remote.name}” changed on another device too — both versions were kept.`);
        }
      }
      const now = localItems()[id];
      meta.items[id] = { hash: now?.hash || "", updated: r.updated };
      if (id === "chats" || editedHere) meta.items[id].hash = ""; // push the merged copy
    }
    // Deleted on another device and not changed here: delete here too (always keeping at least one project).
    for (const id of Object.keys(meta.items)) {
      if (items[id] || !id.startsWith("p-")) continue;
      const i = (data.projects || []).findIndex((x) => `p-${x.id}` === id);
      const mine = local[id];
      if (i !== -1 && mine && mine.hash === meta.items[id].hash && data.projects.length > 1) { data.projects.splice(i, 1); changed = true; }
      delete meta.items[id];
    }
    return changed;
  }

  async function push(meta) {
    const local = localItems();
    for (const [id, it] of Object.entries(local)) {
      if (meta.items[id]?.hash === it.hash) continue;
      try {
        const r = await F.conn.sync.put({ id, kind: it.kind, name: it.name, updated: Date.now(), data: it.data });
        if (r.conflict) { again = true; continue; }
        meta.items[id] = { hash: it.hash, updated: r.updated };
      } catch (e) {
        if (e.status === 413 || e.status === 507) { meta.items[id] = { hash: it.hash, updated: meta.items[id]?.updated || 0, skipped: true }; F.toast(e.message); }
        else throw e;
      }
    }
    for (const id of Object.keys(meta.items)) if (!local[id]) { await F.conn.sync.remove(id).catch(() => {}); delete meta.items[id]; }
  }

  async function run() {
    if (!user || disabled || data?.settings?.cloudSync === false) return;
    if (busy) { again = true; return; }
    busy = true;
    try {
      const meta = loadMeta();
      const changed = await pull(meta);
      if (changed) { F.saveData(user, data, { fromSync: true }); window.dispatchEvent(new CustomEvent("fizz:synced")); }
      await push(meta);
      saveMeta(meta);
      F.sync.last = Date.now();
    } catch (e) {
      if (e.status === 503 || e.status === 401) disabled = true;
      else console.warn("[FIZZ sync]", e);
    } finally {
      busy = false;
      if (again) { again = false; schedule(5000); }
    }
  }
  const schedule = (ms = 4000) => { clearTimeout(timer); timer = setTimeout(run, ms); };

  // Every local save schedules a sync a few seconds later.
  const save = F.saveData;
  F.saveData = (u, d, opts) => { const r = save(u, d); if (!opts?.fromSync && user && u.id === user.id) schedule(); return r; };

  async function startSync() {
    const st = await F.serverStatus().catch(() => null);
    if (!st?.tools?.sync) return;
    const u = F.auth.current();
    if (!u.rid || !(await F.rid?.token?.())) return;
    user = u;
    data = F.loadData(u);
    run();
    setInterval(() => { if (!document.hidden) run(); }, 5 * 60_000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) schedule(500); });
  }
  F.sync = { now: () => run(), start: startSync, last: 0 };
  if (document.documentElement.dataset.app) setTimeout(startSync, 2500);
})();
