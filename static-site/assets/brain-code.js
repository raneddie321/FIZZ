/* Fizz Code handbook: JavaScript craft, storage, routing, forms, files and devices, games, 3D, charts and performance. Registered into F.brain (see fizz-brain.js). */
(function () {
  "use strict";
  const add = window.FIZZ.brain.add;

  add({ id: "code-craft", title: "JAVASCRIPT CRAFT — CODE THAT WORKS THE FIRST TIME", always: "build",
    match: /\b(javascript|js|es ?modules?|dom|front-?end|web ?app|website)\b/i, text: `
## Module layout and wiring
- One entry point: index.html loads one module, <script type="module" src="js/main.js"></script>; every other module
  is reached through imports from it. Never add a script tag for a module that is also imported.
- Imports point one way: main.js -> ui/*.js -> store.js -> storage.js / utils.js. Lower layers never import upper
  ones; utils.js imports nothing. If two modules need each other, move the shared part into a third module, or let the
  lower one take a callback (mountList(el, { onDelete })) instead of importing the upper one.
- Modules export functions and constants and do no work when imported. main.js starts things in order: load saved
  data, create the store, mount the views (they render on subscribe), then start timers and fetches.
- "Cannot access 'x' before initialization": a const/let/class used before its line ran (top-level code calling
  something declared further down, or a circular import). Keep top-level code to declarations; work goes in start().
- Import paths are relative to the importing file and end in .js (import { el } from "../utils.js").
  fetch("data/items.json") is relative to the page (index.html), not to the module.
- Named exports everywhere (export function renderList), spelled the same in every import.
  // js/main.js
  import { loadState, saveState } from "./storage.js";
  import { createStore } from "./store.js";
  import { mountList } from "./ui/list.js";
  import { debounce } from "./utils.js";
  function start() {
    const store = createStore(loadState({ items: [], filter: "all" }));
    mountList(document.querySelector("#list-view"), store);
    store.subscribe(debounce((s) => saveState(s), 300));
  }
  start();

## A tiny store
  // js/store.js
  export function createStore(initial) {
    let state = initial;
    const subs = new Set();
    return {
      get: () => state,
      set(change) {
        const patch = typeof change === "function" ? change(state) : change;
        state = { ...state, ...patch };
        subs.forEach((fn) => fn(state));
      },
      subscribe(fn) { subs.add(fn); fn(state); return () => subs.delete(fn); },
    };
  }
- Change state only through set, with new arrays and objects:
  store.set((s) => ({ items: [...s.items, item] }));
  store.set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, done: !i.done } : i)) }));
  store.set((s) => ({ items: s.items.filter((i) => i.id !== id) }));
- Derived values (filtered lists, totals) are computed in render, not stored. A subscriber never calls store.set.

## Rendering: mount once, render many
- mount() finds elements, adds listeners once (delegated: one listener on the container, actions in data-action,
  items marked with data-id) and subscribes; the subscriber only updates content.
  // js/ui/list.js
  import { el } from "../utils.js";
  export function mountList(root, store) {
    const list = root.querySelector("[data-list]"), empty = root.querySelector("[data-empty]");
    root.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-action]");
      if (!btn || !root.contains(btn)) return;
      const id = btn.closest("[data-id]")?.dataset.id;
      if (btn.dataset.action === "toggle") store.set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, done: !i.done } : i)) }));
      if (btn.dataset.action === "delete") store.set((s) => ({ items: s.items.filter((i) => i.id !== id) }));
    });
    store.subscribe((s) => { empty.hidden = s.items.length > 0; list.replaceChildren(...s.items.map(renderItem)); });
  }
  function renderItem(item) {
    return el("li", { class: item.done ? "item is-done" : "item", "data-id": item.id },
      el("button", { type: "button", "data-action": "toggle", "aria-pressed": String(item.done) }, item.title),
      el("button", { type: "button", "data-action": "delete", "aria-label": "Delete " + item.title }, "Delete"));
  }
- replaceChildren is fine for short lists. For long lists, rows with inputs or focus, or animated rows, update by key:
  export function renderKeyed(parent, items, create, update) {
    const old = new Map([...parent.children].map((n) => [n.dataset.id, n]));
    items.forEach((item, i) => {
      let node = old.get(item.id);
      if (node) old.delete(item.id);
      else { node = create(item); node.dataset.id = item.id; }
      update(node, item);
      if (parent.children[i] !== node) parent.insertBefore(node, parent.children[i] || null);
    });
    old.forEach((n) => n.remove());
  }

## Safe DOM
  // js/utils.js
  export function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "class") node.className = v;
      else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? "" : String(v));
    }
    node.append(...children.flat().filter((c) => c != null && c !== false));
    return node;
  }
  export const escapeHtml = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  export function $(selector, root = document) {
    const node = root.querySelector(selector);
    if (!node) throw new Error("Missing element: " + selector);
    return node;
  }
- Strings given to append() become text nodes, so user text is safe. textContent for text; innerHTML only for your
  own static markup or with escapeHtml() around every value. ARIA values as strings (el() skips false).

## Async work: loading, error and empty states
  async function loadProducts(store) {
    store.set({ status: "loading", error: null });
    try { const list = await request("data/products.json"); store.set({ status: "ready", products: Array.isArray(list) ? list : [] }); }
    catch (err) { console.error(err); store.set({ status: "error", error: "Couldn't load products. " + err.message }); }
  }
- Render from status: "loading" -> skeleton; "error" -> message and a Retry button; "ready" with no items -> empty
  state with the first action. Every async event handler has its own try/catch.
- Search as you type: abort the previous request (AbortController) or drop stale answers with a counter.

## A fetch wrapper
  // js/api.js
  export async function request(url, { timeout = 10000, json, signal, ...opts } = {}) {
    if (json !== undefined) opts = { method: "POST", ...opts, headers: { "Content-Type": "application/json", ...opts.headers }, body: JSON.stringify(json) };
    const timer = AbortSignal.timeout(timeout);
    const res = await fetch(url, { ...opts, signal: signal ? AbortSignal.any([signal, timer]) : timer });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok) {
      const detail = data?.error?.message || (typeof data?.error === "string" ? data.error : "") || res.statusText;
      throw Object.assign(new Error((detail || "Request failed") + " (HTTP " + res.status + ")"), { status: res.status, data });
    }
    return data;
  }
- fetch rejects only on network failure; 404 and 500 resolve, which is why res.ok is checked. A timeout rejects
  with a DOMException named "TimeoutError", a manual abort with "AbortError" (show nothing for that one).

## Saving to localStorage
  // js/storage.js
  const KEY = "tasks.v2";
  export function loadState(fallback) {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || "null");
      if (!saved) return fallback;
      return { ...fallback, ...saved, items: Array.isArray(saved.items) ? saved.items.map(normalizeItem) : [] };
    } catch (err) { console.warn("Saved data unreadable; starting fresh.", err); return fallback; }
  }
  export function saveState(state) {
    try { localStorage.setItem(KEY, JSON.stringify({ items: state.items, filter: state.filter })); return true; }
    catch (err) { console.warn("Could not save.", err); return false; }
  }
- Save data only, never UI or status fields. Version the key; when the shape changes, read the old key, convert it
  and save under the new one instead of throwing the user's data away.
- In the FIZZ preview, localStorage and sessionStorage work (FIZZ provides them and keeps the data per project).
  IndexedDB, downloads, camera, microphone, location, notifications and clipboard may be blocked in the preview
  frame. Catch those errors and keep working (in memory, with a clear message); they work when the app runs on its
  own (published, exported or built). Never remove the try/catch.

## Ids, dates, numbers and money
  export const uid = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
- Money in integer cents, formatted at the end. Intl formatters are created once at module level, not in loops:
  const money = new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" });   // money.format(cents / 100)
  const day = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }), rel = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
- Moments as ISO strings (new Date().toISOString()) or ms timestamps. Calendar dates (due dates, birthdays) as
  "YYYY-MM-DD" (what <input type="date"> gives), parsed as local dates:
  export function parseDay(s) { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); }
  export function toDay(dt) { return dt.getFullYear() + "-" + String(dt.getMonth() + 1).padStart(2, "0") + "-" + String(dt.getDate()).padStart(2, "0"); }

## debounce and throttle
  export function debounce(fn, ms = 250) { let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); }; }
  export function throttle(fn, ms = 100) {
    let last = 0, timer = null;
    return (...args) => {
      const wait = ms - (Date.now() - last);
      clearTimeout(timer);
      if (wait <= 0) { last = Date.now(); fn(...args); }
      else timer = setTimeout(() => { last = Date.now(); fn(...args); }, wait);
    };
  }
- debounce: search input, autosave. throttle: scroll position, pointer tracking. Visual updates: requestAnimationFrame,
  ResizeObserver or IntersectionObserver.

## Defensive coding
- Expect empty, missing and odd data (no items, a missing field, a 200-character title, 0, NaN). Normalize data from
  storage, files and APIs at the boundary, then trust it inside:
  function normalizeItem(x) {
    return { id: String(x?.id ?? uid()), title: String(x?.title ?? "").trim() || "Untitled", done: Boolean(x?.done), createdAt: Number(x?.createdAt) || Date.now() };
  }
- ?? for defaults when 0 or "" are valid (count ?? 0). Number.isFinite before math; never divide by zero.
- Fail loudly on programmer errors (missing element, unknown action: throw with details); fail gently on user and
  network errors (a clear message, a retry, the user's input kept).

## COMMON BUGS AI CODE MAKES (and the fix)
- Classic script in <head> runs before the elements exist -> type="module" (deferred) or defer.
- id or class differs between HTML and JS (#todoList vs #todo-list) -> check every selector against the HTML; use $().
- Missing type="module" -> "Cannot use import statement outside a module". Add it to the one script tag.
- import from "./utils" or "utils.js" -> "./utils.js": relative, with the extension. Bare names load from esm.sh.
- Export/import name mismatch, or default vs named ("does not provide an export named") -> named exports, same name.
- Inline onclick="save()" calling a module function -> modules create no globals; use addEventListener.
- Listeners added inside render -> each click fires N times. Add once in mount, or delegate to the container.
- el.innerHTML += "..." -> rebuilds all children, losing listeners, focus and typed text. Append nodes instead.
- Form submit reloads the page -> listen to "submit" on the form and call e.preventDefault() first.
- A <button> inside a form defaults to type="submit" -> give every other button type="button".
- items.forEach(async (x) => await save(x)) doesn't wait -> for (const x of items) await save(x), or Promise.all.
- Missing await -> "[object Promise]" on screen, or if (promise) always true. Await every async call.
- Async handler without try/catch -> a silent failure. Catch, show a message, re-enable the button.
- Stale closures: a timer or handler keeps an old copy of state -> read store.get() when it runs.
- state.items.push(x) with no re-render -> change state only through store.set.
- .sort() mutates and sorts numbers as strings ([10, 9, 1]) -> [...list].sort((a, b) => a - b); strings: localeCompare.
- Money in floats (0.1 + 0.2 !== 0.3) -> integer cents and Intl.NumberFormat at display time.
- input.value is always a string ("2" + 1 === "21") -> Number(input.value) or valueAsNumber, then Number.isFinite.
- new Date("2025-03-01") is UTC midnight: the previous day in the Americas -> parseDay(); months are 0-based.
- JSON.parse on missing or corrupt storage throws, and JSON.parse(null) returns null -> try/catch plus fallback.
- localStorage stores strings only: "false" is truthy, "5" + 1 is "51" -> JSON.stringify / JSON.parse.
- addEventListener("click", this.handle) loses this -> an arrow function, or bind once in the constructor.
- e.target is the <svg> inside the button -> e.target.closest("[data-action]").
- JS toggles "is-open" but the CSS styles ".open" -> one class name; check both files.
- display: flex on a class overrides the hidden attribute -> add [hidden] { display: none !important; } to the reset.
- z-index wars -> it needs position; transform/opacity/filter create stacking contexts. Use a scale (--z-header: 10;
  --z-dropdown: 20; --z-modal: 100; --z-toast: 200) and <dialog>.showModal(), which renders in the top layer.
- height: 100vh on phones hides content behind the browser bars -> min-height: 100vh; then min-height: 100dvh;.
- Flex or grid children overflow with long words -> min-width: 0 on the child and overflow-wrap: anywhere.
- Asset paths with a leading slash ("/img/logo.png") break in the preview and on subfolder hosting -> relative paths.
- Timers, observers and listeners left running after a view is removed -> keep handles and clear them, or pass
  { signal } from an AbortController to addEventListener and abort() on teardown.

## Self-review before you finish
- Every selector in the JS exists in the HTML; every import name is exported from that exact path with .js.
- Every button and link works; every form prevents the reload, validates and shows success or error.
- Empty, loading and error states render; nothing crashes with no saved data, corrupt saved data or a failed fetch.
- No listener is added inside a render; no innerHTML with user text; every async handler catches errors.
- Logic that matters (totals, parsing, state changes) lives in pure functions checked with a small node script
  (<fizz-run>node tests/cart.test.js</fizz-run>); the page is screenshotted at desktop and phone width.
` });

  add({ id: "storage", title: "SAVING DATA",
    match: /\b(save|saving|saved|storage|local ?storage|indexeddb|idb|offline|database|persist|persistence|sync|backup)\b|שמירה|לשמור/i,
    files: /(storage|store|db|idb)\.js$/i, text: `
## Choose the right place
- localStorage: settings and small app data (under about 1 MB). Strings only, synchronous, about 5 MB per origin,
  shared by every tab of the site. It throws when full, when blocked (sandboxed frames, some private modes) or disabled.
- IndexedDB: larger data, many records, files and blobs, anything you query. Asynchronous, hundreds of MB or more.
- Never put images as base64 in localStorage (33% bigger, fills the quota fast): store the Blob in IndexedDB.
- No server means data lives in this browser only. Say so in the UI and offer export/import.

## A versioned localStorage module with migrations
  // js/storage.js
  const KEY = "notes.data";
  const VERSION = 3;
  const MIGRATIONS = {
    1: (d) => ({ ...d, tags: [] }),                                              // v1 -> v2
    2: (d) => ({ ...d, notes: d.notes.map((n) => ({ ...n, pinned: false })) }),  // v2 -> v3
  };
  const memory = new Map();
  export const isQuotaError = (err) => err?.name === "QuotaExceededError" || err?.name === "NS_ERROR_DOM_QUOTA_REACHED";
  function getRaw(key) { try { return localStorage.getItem(key); } catch { return memory.get(key) ?? null; } }
  function setRaw(key, value) {
    try { localStorage.setItem(key, value); }
    catch (err) { if (isQuotaError(err)) throw err; memory.set(key, value); }
  }
  export function load(fallback) {
    const raw = getRaw(KEY);
    if (!raw) return fallback;
    try {
      const saved = JSON.parse(raw);
      let version = saved?.version ?? 1;
      let data = saved?.data ?? saved;
      while (version < VERSION) { data = MIGRATIONS[version](data); version += 1; }
      return { ...fallback, ...data };
    } catch (err) {
      console.warn("Saved data is unreadable; keeping a copy and starting fresh.", err);
      try { setRaw(KEY + ".corrupt", raw); } catch { /* full: nothing more to do */ }
      return fallback;
    }
  }
  export function save(data) {
    try { setRaw(KEY, JSON.stringify({ version: VERSION, savedAt: Date.now(), data })); return { ok: true }; }
    catch (err) { return { ok: false, quota: isQuotaError(err), error: err }; }
  }
- Bump VERSION only when the saved shape changes; add the migration from the previous version; never delete one.
- When save() returns ok: false, tell the user ("Storage is full. Export a backup and delete old items.").
- Other tabs: window.addEventListener("storage", (e) => { if (e.key === KEY) store.set(load(store.get())); });

## IndexedDB with a small promise wrapper
  // js/db.js
  const DB_NAME = "notes-app";
  const DB_VERSION = 1;
  let dbPromise = null;
  function openDB() {
    dbPromise ??= new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("notes")) {
          const notes = db.createObjectStore("notes", { keyPath: "id" });
          notes.createIndex("byUpdated", "updatedAt");
        }
        if (!db.objectStoreNames.contains("files")) db.createObjectStore("files", { keyPath: "id" });
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => db.close();   // let a newer tab upgrade
        resolve(db);
      };
      req.onerror = () => reject(req.error);
      req.onblocked = () => console.warn("Close other tabs of this app to finish the database upgrade.");
    });
    dbPromise.catch(() => { dbPromise = null; });
    return dbPromise;
  }
  async function run(storeName, mode, makeRequest) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const req = makeRequest(tx.objectStore(storeName));
      tx.oncomplete = () => resolve(req?.result);
      tx.onerror = (e) => reject(e.target.error);
      tx.onabort = () => reject(tx.error || new Error("Transaction aborted"));
    });
  }
  export const db = {
    get: (store, key) => run(store, "readonly", (s) => s.get(key)),
    getAll: (store) => run(store, "readonly", (s) => s.getAll()),
    byIndex: (store, index, query) => run(store, "readonly", (s) => s.index(index).getAll(query)),
    put: (store, value) => run(store, "readwrite", (s) => s.put(value)),
    putMany: (store, values) => run(store, "readwrite", (s) => { let last = null; for (const v of values) last = s.put(v); return last; }),
    delete: (store, key) => run(store, "readwrite", (s) => s.delete(key)),
    clear: (store) => run(store, "readwrite", (s) => s.clear()),
  };
- Usage: await db.put("notes", note); const notes = await db.getAll("notes"); await db.delete("notes", id).
- Never await anything else (fetch, timers) in the middle of a transaction: it auto-commits and later requests fail.
- New stores or indexes: raise DB_VERSION and add them in onupgradeneeded behind objectStoreNames.contains checks.
- If indexedDB.open throws (it does in the FIZZ preview frame, and with disabled storage) the promise rejects: catch
  it in main.js and fall back to localStorage (small data) or memory, with "Changes won't be saved in this window".

## Files and blobs
- IndexedDB stores File and Blob objects directly:
  await db.put("files", { id: uid(), name: file.name, type: file.type, size: file.size, blob: file, createdAt: Date.now() });
  const rec = await db.get("files", id);
  img.src = URL.createObjectURL(rec.blob);   // URL.revokeObjectURL(img.src) when the image is removed
- Ask for durable storage once the user has real data: if (navigator.storage?.persist) await navigator.storage.persist();
- Show usage: const { usage, quota } = await navigator.storage.estimate();

## Backup: export and import JSON
  export function downloadJSON(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), { href: url, download: filename });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  // backup shape: { app: "notes", version: VERSION, exportedAt: new Date().toISOString(), data }
  importInput.addEventListener("change", async () => {
    const file = importInput.files[0];
    importInput.value = "";                      // lets the same file be chosen again
    if (!file) return;
    try {
      const backup = JSON.parse(await file.text());
      if (backup?.app !== "notes" || !Array.isArray(backup.data?.notes)) throw new Error("This isn't a Notes backup file.");
      if (!confirm("Replace your " + store.get().notes.length + " notes with " + backup.data.notes.length + " from the backup?")) return;
      store.set({ notes: backup.data.notes.map(normalizeNote) });
    } catch (err) {
      showToast("Import failed: " + err.message);
    }
  });
- <input type="file" accept="application/json,.json"> behind a labelled "Import backup" button. Run migrations on
  imported data from older versions. Downloads may be blocked inside the preview frame; they work outside it.

## Sync between devices
- Real sync needs a server or a hosted database (build it in the sandbox, or use a provider). Give every record an id
  and updatedAt, keep deleted records as { id, deleted: true, updatedAt } (tombstones), and merge by newest updatedAt.
` });

  add({ id: "routing", title: "MULTI-SCREEN APPS AND ROUTING",
    match: /\b(route|routes|router|routing|pages|screens|navigation|navigate|spa|tabs|views|multi-?page|deep link)\b/i,
    files: /router\.js$/i, text: `
## Use hash routes
- #/items/42 works everywhere: in the preview, on static hosting, after refresh, with the back button. Routes with
  history.pushState (/items/42) need server rewrites, otherwise refresh gives a 404.
- One outlet element (<main id="app">) that each route renders into; header and navigation stay outside it.

## The router (js/router.js)
  const routes = [];
  const scroll = new Map();
  let notFound = ({ outlet, path }) => { outlet.textContent = "Page not found: " + path; };
  let outlet = null, cleanup = null, navId = 0, lastPath = null, fromLink = false;

  export function route(pattern, handler) { routes.push({ parts: pattern.split("/").filter(Boolean), handler }); }
  export function setNotFound(handler) { notFound = handler; }

  export function currentRoute() {
    const raw = location.hash.slice(1) || "/";
    const [path, qs = ""] = raw.split("?");
    return { path: path.startsWith("/") ? path : "/" + path, query: Object.fromEntries(new URLSearchParams(qs)) };
  }

  function match(path) {
    const segs = path.split("/").filter(Boolean);
    for (const r of routes) {
      if (r.parts.length !== segs.length) continue;
      const params = {};
      const ok = r.parts.every((p, i) => {
        if (!p.startsWith(":")) return p === segs[i];
        try { params[p.slice(1)] = decodeURIComponent(segs[i]); return true; } catch { return false; }
      });
      if (ok) return { handler: r.handler, params };
    }
    return null;
  }

  export function navigate(path, { replace = false } = {}) {
    fromLink = true;
    if (location.hash === "#" + path) return render();
    if (replace) location.replace("#" + path);
    else location.hash = path;
  }

  async function render() {
    const id = ++navId;
    const { path, query } = currentRoute();
    if (lastPath !== null) scroll.set(lastPath, window.scrollY);
    const restore = !fromLink;
    fromLink = false;
    lastPath = path;
    if (cleanup) { cleanup(); cleanup = null; }
    const found = match(path);
    let result;
    try {
      result = await (found ? found.handler({ params: found.params, query, outlet }) : notFound({ path, query, outlet }));
    } catch (err) {
      console.error(err);
      outlet.textContent = "Something went wrong while opening this screen.";
    }
    if (id !== navId) { if (typeof result === "function") result(); return; }   // a newer navigation won
    cleanup = typeof result === "function" ? result : null;
    markLinks(path);
    window.scrollTo(0, restore ? scroll.get(path) ?? 0 : 0);
    if (id > 1) focusHeading();
  }

  function markLinks(path) {
    for (const a of document.querySelectorAll("a[data-nav]")) {
      const target = a.getAttribute("href").slice(1);
      const active = target === "/" ? path === "/" : path === target || path.startsWith(target + "/");
      a.classList.toggle("is-active", active);
      if (active) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    }
  }

  function focusHeading() {
    const h = outlet.querySelector("h1") || outlet.querySelector("h2");
    if (!h) return;
    h.setAttribute("tabindex", "-1");
    h.focus({ preventScroll: true });
  }

  export function startRouter(outletEl) {
    outlet = outletEl;
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    window.addEventListener("hashchange", render);
    document.addEventListener("click", (e) => { if (e.target.closest('a[href^="#/"]')) fromLink = true; });
    render();
  }

## Wiring routes (js/main.js)
  import { route, setNotFound, startRouter } from "./router.js";
  route("/", ({ outlet }) => renderHome(outlet, store));
  route("/items", ({ outlet, query }) => renderList(outlet, store, query.q || ""));
  route("/items/:id", ({ outlet, params }) => {
    const item = store.get().items.find((i) => i.id === params.id);
    if (!item) return renderMissing(outlet, "This item doesn't exist. It may have been deleted.");
    return renderDetail(outlet, store, item);   // may return a cleanup function (unsubscribe, clearInterval...)
  });
  setNotFound(({ outlet, path }) => renderMissing(outlet, "There's no page at " + path + "."));
  startRouter(document.querySelector("#app"));
- Links: <a href="#/items" data-nav>Items</a>; build hrefs as "#/items/" + encodeURIComponent(item.id).
- A handler returns a cleanup function when it subscribes, starts timers or adds listeners outside the outlet.
- Redirects use navigate("/login", { replace: true }) so Back doesn't bounce into the redirect again.
- Not-found screens are designed: a clear message, a link home, the navigation still visible.

## Focus, titles, scroll and Back
- After each navigation, focus moves to the new screen's h1 (screen readers announce it; keyboard users start there).
  Style it: h1:focus { outline: none; } is fine only because it isn't interactive.
- Each screen sets document.title ("Item 42 | Inventory").
- New screens start at the top; Back and Forward restore the old position (the router does this for window scroll;
  restore inner scroll containers the same way if you use them).
- In-app Back buttons link to the parent screen (<a href="#/items">) instead of calling history.back(), which can
  leave the app when it was opened from a deep link.
- Put view state that should survive refresh and Back in the URL: #/items?q=shoes&sort=price.

## Tabs inside a screen
  <div role="tablist" aria-label="Settings">
    <button type="button" role="tab" id="tab-profile" aria-controls="panel-profile" aria-selected="true">Profile</button>
    <button type="button" role="tab" id="tab-billing" aria-controls="panel-billing" aria-selected="false" tabindex="-1">Billing</button>
  </div>
  <section role="tabpanel" id="panel-profile" aria-labelledby="tab-profile">...</section>
  <section role="tabpanel" id="panel-billing" aria-labelledby="tab-billing" hidden>...</section>

  function selectTab(tab) {
    for (const t of tab.parentElement.querySelectorAll('[role="tab"]')) {
      const on = t === tab;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute("aria-controls")).hidden = !on;
    }
    tab.focus();
  }
  tablist.addEventListener("click", (e) => { const t = e.target.closest('[role="tab"]'); if (t) selectTab(t); });
  tablist.addEventListener("keydown", (e) => {
    const tabs = [...tablist.querySelectorAll('[role="tab"]')];
    const i = tabs.indexOf(document.activeElement);
    const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
    if (i === -1 || next === undefined) return;
    e.preventDefault();
    selectTab(tabs[(next + tabs.length) % tabs.length]);
  });
- In RTL layouts swap ArrowLeft and ArrowRight. Put the active tab in the URL (?tab=billing) when it should survive refresh.
- Phones: bottom navigation (3–5 items, icon + label) or a drawer; desktop: sidebar or top navigation.
` });

  add({ id: "forms", title: "FORMS AND VALIDATION",
    match: /\b(form|forms|input|inputs|validation|validate|signup|sign up|sign-up|login|log in|register|registration|checkout|contact|survey|questionnaire|wizard)\b|טופס|הרשמה/i,
    files: /(form|validat)[\w-]*\.js$/i, text: `
## Markup that does half the work
  <form id="signup" novalidate>
    <div class="field">
      <label for="email">Email</label>
      <input id="email" name="email" type="email" required autocomplete="email" aria-describedby="email-error">
      <p class="field-error" id="email-error"></p>
    </div>
    <div class="field">
      <label for="password">Password</label>
      <input id="password" name="password" type="password" required minlength="8" autocomplete="new-password" aria-describedby="password-hint password-error">
      <p class="field-hint" id="password-hint">At least 8 characters.</p>
      <p class="field-error" id="password-error"></p>
    </div>
    <button type="submit">Create account</button>
    <p class="form-status" role="status" aria-live="polite"></p>
  </form>
- Native rules (required, type, minlength, maxlength, min, max, step, pattern) plus novalidate on the form: the browser
  checks validity, your code shows the messages inline, in your design.
- Right input types and autocomplete values: email, tel, url, number (inputmode="decimal" for prices), date;
  autocomplete name, email, tel, street-address, postal-code, username, current-password, new-password, one-time-code.
- Every input has a visible <label>. Placeholders are examples, never the label.

## The validation helper (js/validate.js)
  const MESSAGES = {
    valueMissing: () => "This field is required.",
    typeMismatch: (el) => (el.type === "email" ? "Enter an email like name@example.com." : "Enter a valid " + el.type + "."),
    tooShort: (el) => "Use at least " + el.minLength + " characters.",
    tooLong: (el) => "Use at most " + el.maxLength + " characters.",
    patternMismatch: (el) => el.dataset.patternMessage || "Use the format shown.",
    rangeUnderflow: (el) => "Enter " + el.min + " or more.",
    rangeOverflow: (el) => "Enter " + el.max + " or less.",
    stepMismatch: () => "Enter a valid value.",
    badInput: () => "Enter a number.",
  };
  export function showError(input, message) {
    const box = document.getElementById(input.dataset.errorId || input.id + "-error");
    if (message) input.setAttribute("aria-invalid", "true"); else input.removeAttribute("aria-invalid");
    if (box) box.textContent = message;
  }
  export function validateField(input, rule) {
    input.setCustomValidity(rule ? rule(input.value, input.form) || "" : "");
    let message = "";
    if (!input.checkValidity()) {
      const key = Object.keys(MESSAGES).find((k) => input.validity[k]);
      message = key ? MESSAGES[key](input) : input.validationMessage;
    }
    showError(input, message);
    return !message;
  }
  export function validateAll(root, rules = {}) {
    let first = null;
    for (const input of root.querySelectorAll("input, select, textarea")) {
      if (input.disabled || input.type === "hidden") continue;
      if (!validateField(input, rules[input.name]) && !first) first = input;
    }
    first?.focus();
    return !first;
  }
- Cross-field and custom rules return a message or "":
  const rules = { confirm: (value, form) => (value !== form.elements.password.value ? "Passwords don't match." : "") };
- When to validate: everything on submit; a field on blur; while typing only if the field is already invalid, so the
  error clears as soon as it's fixed:
  form.addEventListener("focusout", (e) => { if (e.target.name) validateField(e.target, rules[e.target.name]); });
  form.addEventListener("input", (e) => { if (e.target.getAttribute("aria-invalid") === "true") validateField(e.target, rules[e.target.name]); });
- Radio and checkbox groups: wrap in <fieldset> with a <legend>, put data-error-id on each input pointing at one shared
  error element, and set aria-describedby on each input.
- Style errors with input[aria-invalid="true"] (red border plus the text message; never color alone).

## Submitting with double-submit protection
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (form.dataset.busy || !validateAll(form, rules)) return;
    const button = form.querySelector('[type="submit"]');
    const label = button.textContent;
    const status = form.querySelector(".form-status");
    form.dataset.busy = "1";
    button.disabled = true;
    button.textContent = "Sending…";
    status.textContent = "";
    try {
      await sendForm(form);
      form.replaceWith(successMessage());       // a heading plus what happens next; focus it
    } catch (err) {
      status.textContent = "Couldn't send: " + err.message + " Your answers are still here.";
    } finally {
      delete form.dataset.busy;
      button.disabled = false;
      button.textContent = label;
    }
  });
- Read values with new FormData(form). Object.fromEntries(data) keeps one value per name: use data.getAll("topics")
  for checkbox groups; unchecked checkboxes are absent; numbers arrive as strings.

## Sending somewhere real
- Without a backend: show the success state, keep the data in the console or storage, and explain in the summary how
  to connect a service. A form service such as Formspree takes a normal POST:
  async function sendForm(form) {
    const res = await fetch(form.action, { method: "POST", body: new FormData(form), headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error("The server answered " + res.status + ".");
  }
  (form action="https://formspree.io/f/YOUR_FORM_ID": the user creates the form and gives you the id.)
- Your own endpoint: build it in the sandbox and validate again on the server. Don't set Content-Type when sending
  FormData; the browser adds the multipart boundary.
- Login and signup need a real server or auth provider. Never store passwords in localStorage, never fake a login
  that "works" in the front end only. Checkout: the provider's hosted checkout page; never collect card numbers.

## Multi-step forms
- One <form>, one <fieldset data-step> per step (with a <legend>), only the current one visible; a progress line
  ("Step 2 of 4") and Back / Next buttons. Next validates only the current step. The last step shows a review.
  const steps = [...form.querySelectorAll("[data-step]")];
  let step = 0;
  function showStep(i) {
    step = i;
    steps.forEach((s, j) => { s.hidden = j !== i; });
    progress.textContent = "Step " + (i + 1) + " of " + steps.length;
    steps[i].querySelector("input, select, textarea")?.focus();
  }
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!validateAll(steps[step], rules)) return;
    if (step < steps.length - 1) showStep(step + 1); else submitAll(new FormData(form));
  });
  backButton.addEventListener("click", () => showStep(Math.max(0, step - 1)));   // type="button"
  showStep(0);
- Enter in a field submits the form, which moves to the next step: that is the expected behavior.
- Keep a draft (saved on input, debounced) so a refresh doesn't lose a long form; clear it after success.

## File inputs with preview
  photo.addEventListener("change", () => {
    const file = photo.files[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return showError(photo, "Choose an image (JPG, PNG or WebP).");
    if (file.size > 5 * 1024 * 1024) return showError(photo, "Images must be smaller than 5 MB.");
    showError(photo, "");
    if (preview.src.startsWith("blob:")) URL.revokeObjectURL(preview.src);
    preview.src = URL.createObjectURL(file);
    preview.hidden = false;
  });
- accept="image/*" filters the picker but is not validation; check type and size in code. Show the file name and a
  Remove button; large images should be resized before upload (see the files section).
` });

  add({ id: "files-media", title: "FILES, MEDIA AND DEVICE APIS",
    match: /\b(upload|uploads|download|downloads|file|files|image|images|photo|photos|camera|webcam|microphone|mic|record|recording|recorder|clipboard|drag|drop|drag and drop|share|notification|notifications|geolocation|gps|qr|barcode|crop|resize|vibrat\w*)\b|קובץ|מצלמה/i,
    text: `
## Ground rules
- Feature-detect every API and design a fallback; most need a user gesture (a click) and a secure (https) page.
- The FIZZ preview frame is sandboxed: camera, microphone, location, notifications, clipboard and downloads may be
  refused there. Handle the error with a clear message; tell the user these work when the app runs on its own.
- In the preview, images and sounds referenced only from JS (img.src = "assets/x.png", new Audio("sfx/hit.mp3"))
  don't resolve. Put them in the HTML, or load them through fetch, which works for project files:
  async function loadImage(path) { const blob = await (await fetch(path)).blob(); return createImageBitmap(blob); }
  async function assetURL(path) { return URL.createObjectURL(await (await fetch(path)).blob()); }

## Drag-and-drop upload
  <label class="dropzone" for="file-input">
    <input id="file-input" class="visually-hidden" type="file" accept="image/*" multiple>
    <strong>Drop images here</strong> or <span class="link">browse</span>
  </label>
  const zone = document.querySelector(".dropzone");
  const input = document.querySelector("#file-input");
  let depth = 0;
  zone.addEventListener("dragenter", (e) => { e.preventDefault(); depth++; zone.classList.add("is-over"); });
  zone.addEventListener("dragover", (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; });
  zone.addEventListener("dragleave", () => { if (--depth === 0) zone.classList.remove("is-over"); });
  zone.addEventListener("drop", (e) => { e.preventDefault(); depth = 0; zone.classList.remove("is-over"); handleFiles([...e.dataTransfer.files]); });
  input.addEventListener("change", () => { handleFiles([...input.files]); input.value = ""; });
  window.addEventListener("dragover", (e) => e.preventDefault());   // a missed drop must not open the file
  window.addEventListener("drop", (e) => e.preventDefault());
  document.addEventListener("paste", (e) => { const files = [...(e.clipboardData?.files || [])]; if (files.length) handleFiles(files); });
- Visually hide the input (not display: none) so it stays keyboard-focusable; the label opens the picker.
- handleFiles filters by type and size, shows each file with a thumbnail, name, size and a remove button.

## Reading files
  const text = await file.text();                 // CSV, JSON, Markdown
  const bytes = new Uint8Array(await file.arrayBuffer());
  function readAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }
- For previews prefer URL.createObjectURL(file) (instant, no copy); revoke it when the preview goes away.
  Data URLs only when you must embed the image in JSON or HTML.

## Resize, compress and crop images with canvas
  export async function resizeImage(file, { maxSize = 1600, type = "image/jpeg", quality = 0.85 } = {}) {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (type === "image/jpeg") { ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height); }
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't encode the image."))), type, quality));
  }
- Square center crop: const s = Math.min(w, h); ctx.drawImage(bitmap, (w - s) / 2, (h - s) / 2, s, s, 0, 0, size, size);
- createImageBitmap rejects for formats the browser can't decode (HEIC outside Safari): catch it and say which formats work.

## Downloading generated files
  export function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), { href: url, download: filename });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  downloadBlob(new Blob([text], { type: "text/plain;charset=utf-8" }), "notes.txt");
  canvas.toBlob((blob) => downloadBlob(blob, "drawing.png"), "image/png");

## Clipboard
  export async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; }
    catch {
      const ta = Object.assign(document.createElement("textarea"), { value: text, readOnly: true });
      ta.style.cssText = "position:fixed;opacity:0;pointer-events:none";
      document.body.append(ta);
      ta.select();
      const ok = document.execCommand("copy");   // deprecated, but a useful fallback
      ta.remove();
      return ok;
    }
  }
- Confirm with visible feedback ("Copied" for 2 seconds, announced in an aria-live region).
- Images: await navigator.clipboard.write([new ClipboardItem({ "image/png": pngBlob })]) (PNG is the safe type).
- Reading needs permission; for pasting, listen to the paste event instead of calling navigator.clipboard.read().

## Web Share with a fallback
  export async function share(data) {             // { title, text, url } or { files: [file] }
    if (navigator.share && (!navigator.canShare || navigator.canShare(data))) {
      try { await navigator.share(data); return "shared"; }
      catch (err) { if (err.name === "AbortError") return "cancelled"; }
    }
    return (await copyText(data.url || data.text || "")) ? "copied" : "failed";
  }

## Camera and microphone
  const CAMERA_ERRORS = {
    NotAllowedError: "Camera access was blocked. Allow it in the browser's site settings, then try again.",
    NotFoundError: "No camera was found on this device.",
    NotReadableError: "The camera is being used by another app.",
    OverconstrainedError: "This camera doesn't support the requested settings.",
    SecurityError: "The camera needs a secure (https) page.",
  };
  export async function startCamera(video, { facingMode = "user", audio = false } = {}) {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("This browser can't use the camera.");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } }, audio });
      video.srcObject = stream;
      video.muted = true;
      video.setAttribute("playsinline", "");
      await video.play();
      return stream;
    } catch (err) {
      throw new Error(CAMERA_ERRORS[err.name] || "Couldn't start the camera: " + err.message);
    }
  }
  export const stopStream = (stream) => stream?.getTracks().forEach((t) => t.stop());
- Start only from a button ("Turn on camera"), explain why first, show the error text in the UI, stop the tracks
  when leaving the screen. Snapshot: draw the video into a canvas (canvas.width = video.videoWidth), then toBlob.
- Microphone only: getUserMedia({ audio: true }); same error names.

## Recording with MediaRecorder
  const pickType = (types) => types.find((t) => MediaRecorder.isTypeSupported(t)) || "";
  export function record(stream, onDone) {
    const mimeType = pickType(stream.getVideoTracks().length
      ? ["video/webm;codecs=vp9,opus", "video/webm", "video/mp4"]
      : ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]);
    const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    rec.onstop = () => onDone(new Blob(chunks, { type: rec.mimeType }));
    rec.start(1000);
    return rec;                                   // call rec.stop() to finish
  }
- Safari records mp4, Chrome and Firefox webm: name downloads by type (rec.mimeType.includes("mp4") ? ".mp4" : ".webm").
- Show a recording indicator and elapsed time; play back with URL.createObjectURL(blob).

## Notifications
  export async function notify(title, options) {
    if (!("Notification" in window)) return false;
    if (Notification.permission === "default") await Notification.requestPermission();   // only from a click
    if (Notification.permission !== "granted") return false;
    new Notification(title, options);
    return true;
  }
- Ask after the user turns on a feature that needs it, never on page load. "denied" can't be asked again: show how to
  change it in site settings. Android Chrome needs a service worker (registration.showNotification).
- In-page toasts are better for anything the user sees while the page is open.

## Location, vibration, QR codes
  export function getPosition(options = {}) {
    return new Promise((resolve, reject) => {
      if (!("geolocation" in navigator)) return reject(new Error("Location isn't available in this browser."));
      navigator.geolocation.getCurrentPosition(resolve, (err) => reject(new Error(
        err.code === 1 ? "Location permission was denied." : err.code === 3 ? "Finding your location took too long." : "Your location couldn't be found."
      )), { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000, ...options });
    });
  }
- Always offer a manual fallback (type a city or address). Use watchPosition/clearWatch only while a screen needs it.
- Vibration: if ("vibrate" in navigator) navigator.vibrate(30); patterns like [100, 50, 100]. Not on iOS: never the only feedback.
- QR codes: generate with the "qrcode" package (import QRCode from "qrcode"; await QRCode.toCanvas(canvas, text)).
  Scan with BarcodeDetector where it exists ("BarcodeDetector" in window), otherwise "jsqr":
  import jsQR from "jsqr";  const code = jsQR(imageData.data, imageData.width, imageData.height);  // code?.data
` });

  add({ id: "canvas-games", title: "CANVAS GAME TEMPLATE",
    match: /\b(game|games|canvas|sprite|sprites|platformer|shooter|arcade|snake|tetris|pong|breakout|flappy|asteroids|invaders)\b|משחק/i,
    files: /(game|sprites?|levels?|collide|particles)\.js$/i, text: `
## A complete skeleton (adapt it; keep the structure)
Fixed logical resolution (960x540) letterboxed to any screen, sharp on high-DPI displays, a fixed 60 Hz update,
a menu / playing / paused / gameover state machine, keyboard and touch input, generated sound, a saved high score.

  <!-- index.html -->
  <!doctype html>
  <html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <title>Sky Dodge</title>
    <link rel="stylesheet" href="css/game.css">
  </head>
  <body>
    <div id="stage">
      <canvas id="game" aria-label="Sky Dodge game"></canvas>
      <div id="touch" class="touch">
        <button type="button" data-key="left" aria-label="Move left">Left</button>
        <button type="button" data-key="pause" aria-label="Pause">Pause</button>
        <button type="button" data-key="right" aria-label="Move right">Right</button>
      </div>
    </div>
    <script type="module" src="js/main.js"></script>
  </body>
  </html>

  /* css/game.css */
  html, body { margin: 0; height: 100%; background: #020617; overflow: hidden; }
  #stage { position: fixed; inset: 0; display: grid; place-items: center; touch-action: none; user-select: none; -webkit-user-select: none; }
  canvas { display: block; }
  .touch { position: absolute; left: 0; right: 0; bottom: 0; display: flex; justify-content: space-between; gap: 12px;
           padding: 16px max(16px, env(safe-area-inset-left)) max(16px, env(safe-area-inset-bottom)); pointer-events: none; }
  .touch button { pointer-events: auto; min-width: 72px; height: 72px; border: 0; border-radius: 50%; font: 600 15px system-ui, sans-serif;
                  color: #fff; background: rgba(255, 255, 255, 0.16); }
  @media (hover: hover) and (pointer: fine) { .touch { display: none; } }

  // js/main.js
  import { createInput } from "./input.js";
  import { createGame } from "./game.js";
  import { unlockAudio } from "./audio.js";
  const WIDTH = 960, HEIGHT = 540, STEP = 1 / 60;
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const input = createInput(canvas, document.getElementById("touch"));
  const game = createGame({ width: WIDTH, height: HEIGHT, input });

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const scale = Math.min(window.innerWidth / WIDTH, window.innerHeight / HEIGHT);
    const cssW = Math.floor(WIDTH * scale), cssH = Math.floor(HEIGHT * scale);
    canvas.style.width = cssW + "px";
    canvas.style.height = cssH + "px";
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
  }
  let last = performance.now(), acc = 0;
  function frame(now) {
    acc += Math.min(Math.max(now - last, 0) / 1000, 0.25);   // clamp: a background tab must not teleport things
    last = now;
    while (acc >= STEP) { game.update(STEP); input.endFrame(); acc -= STEP; }
    ctx.setTransform(canvas.width / WIDTH, 0, 0, canvas.height / HEIGHT, 0, 0);   // draw in logical units
    game.render(ctx);
    requestAnimationFrame(frame);
  }
  window.addEventListener("resize", resize);
  window.addEventListener("pointerdown", unlockAudio);
  window.addEventListener("keydown", unlockAudio);
  document.addEventListener("visibilitychange", () => { if (document.hidden) game.pause(); });
  resize();
  requestAnimationFrame(frame);

  // js/input.js
  const KEYMAP = { ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right", ArrowUp: "up", KeyW: "up",
                   Space: "action", Enter: "action", KeyP: "pause", Escape: "pause", KeyM: "mute" };
  export function createInput(canvas, touchRoot) {
    const down = new Set(), pressed = new Set();
    const press = (a) => { if (!down.has(a)) pressed.add(a); down.add(a); };
    const release = (a) => down.delete(a);
    window.addEventListener("keydown", (e) => { const a = KEYMAP[e.code]; if (a) { e.preventDefault(); press(a); } });
    window.addEventListener("keyup", (e) => { const a = KEYMAP[e.code]; if (a) release(a); });
    window.addEventListener("blur", () => down.clear());
    canvas.addEventListener("pointerdown", () => press("action"));
    canvas.addEventListener("pointerup", () => release("action"));
    touchRoot?.addEventListener("pointerdown", (e) => {
      const btn = e.target.closest("[data-key]");
      if (!btn) return;
      e.preventDefault();
      btn.setPointerCapture(e.pointerId);
      press(btn.dataset.key);
    });
    const lift = (e) => { const btn = e.target.closest("[data-key]"); if (btn) release(btn.dataset.key); };
    touchRoot?.addEventListener("pointerup", lift);
    touchRoot?.addEventListener("pointercancel", lift);
    window.addEventListener("contextmenu", (e) => e.preventDefault());
    return { isDown: (a) => down.has(a), wasPressed: (a) => pressed.has(a), endFrame: () => pressed.clear() };
  }

  // js/audio.js
  let ctx = null, muted = false;
  try { muted = localStorage.getItem("skydodge.muted") === "1"; } catch { /* storage blocked */ }
  export function unlockAudio() {
    if (!ctx) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return; ctx = new AC(); }
    if (ctx.state === "suspended") ctx.resume();
  }
  export const isMuted = () => muted;
  export function setMuted(on) { muted = on; try { localStorage.setItem("skydodge.muted", on ? "1" : "0"); } catch { /* ignore */ } }
  export function beep({ freq = 440, duration = 0.1, type = "square", volume = 0.15, slide = 0 } = {}) {
    if (!ctx || muted) return;
    const t = ctx.currentTime, osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + duration);
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }
  export const sfx = {
    start: () => beep({ freq: 440, slide: 440, duration: 0.15 }),
    point: () => beep({ freq: 880, duration: 0.06, volume: 0.08 }),
    hit: () => beep({ freq: 220, type: "sawtooth", slide: -160, duration: 0.35, volume: 0.2 }),
  };

  // js/storage.js
  const KEY = "skydodge.best.v1";
  export function loadBest() { try { return Number(localStorage.getItem(KEY)) || 0; } catch { return 0; } }
  export function saveBest(score) { try { localStorage.setItem(KEY, String(score)); } catch { /* blocked: keep in memory */ } }

  // js/game.js
  import { aabb } from "./collide.js";
  import { sfx, isMuted, setMuted } from "./audio.js";
  import { loadBest, saveBest } from "./storage.js";
  const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  export function createGame({ width, height, input }) {
    let mode = "menu";                 // "menu" | "playing" | "paused" | "gameover"
    let best = loadBest(), player, rocks, score, spawn, time, shake = 0, cooldown = 0, nextPoint = 10;
    function reset() {
      player = { x: width / 2 - 20, y: height - 80, w: 40, h: 40, vx: 0 };
      rocks = []; score = 0; spawn = 0; time = 0; nextPoint = 10;
    }
    reset();
    function update(dt) {
      shake = Math.max(0, shake - dt);
      if (input.wasPressed("mute")) setMuted(!isMuted());
      if (mode === "menu" || mode === "gameover") {
        cooldown -= dt;
        if (cooldown <= 0 && input.wasPressed("action")) { reset(); mode = "playing"; sfx.start(); }
        return;
      }
      if (mode === "paused") { if (input.wasPressed("pause") || input.wasPressed("action")) mode = "playing"; return; }
      if (input.wasPressed("pause")) { mode = "paused"; return; }
      time += dt;
      const dir = (input.isDown("right") ? 1 : 0) - (input.isDown("left") ? 1 : 0);
      player.vx += (dir * 4000 - player.vx * 10) * dt;          // acceleration with friction
      player.x = Math.max(0, Math.min(width - player.w, player.x + player.vx * dt));
      spawn -= dt;
      if (spawn <= 0) {
        spawn = Math.max(0.22, 0.9 - time * 0.02);              // difficulty ramps up
        const size = 24 + Math.random() * 36;
        rocks.push({ x: Math.random() * (width - size), y: -size, w: size, h: size, vy: 180 + time * 8 + Math.random() * 120 });
      }
      for (const r of rocks) r.y += r.vy * dt;
      rocks = rocks.filter((r) => r.y < height + 60);
      score += dt * 10;
      if (score >= nextPoint) { nextPoint += 10; sfx.point(); }
      if (rocks.some((r) => aabb(player, r))) {
        mode = "gameover"; cooldown = 0.6; shake = calm ? 0 : 0.35; sfx.hit();
        if (Math.floor(score) > best) { best = Math.floor(score); saveBest(best); }
      }
    }
    function render(ctx) {
      ctx.fillStyle = "#0b1020";
      ctx.fillRect(0, 0, width, height);
      if (mode !== "menu") {
        ctx.save();
        if (shake > 0) ctx.translate((Math.random() * 2 - 1) * shake * 24, (Math.random() * 2 - 1) * shake * 24);
        ctx.fillStyle = "#f97316";
        for (const r of rocks) ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.fillStyle = "#38bdf8";
        ctx.fillRect(player.x, player.y, player.w, player.h);
        ctx.restore();
        ctx.fillStyle = "#e2e8f0";
        ctx.font = "600 22px system-ui, sans-serif";
        ctx.textAlign = "left";
        ctx.fillText("Score " + Math.floor(score), 24, 40);
        ctx.textAlign = "right";
        ctx.fillText("Best " + best, width - 24, 40);
      }
      if (mode === "menu") overlay(ctx, "Sky Dodge", "Arrows or A/D to move. Space or tap to start.");
      if (mode === "paused") overlay(ctx, "Paused", "Press P or tap to continue");
      if (mode === "gameover") overlay(ctx, "Game over", "Score " + Math.floor(score) + "   Best " + best + "   Space or tap to play again");
    }
    function overlay(ctx, title, sub) {
      ctx.fillStyle = "rgba(2, 6, 23, 0.65)";
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = "#f8fafc";
      ctx.textAlign = "center";
      ctx.font = "700 56px system-ui, sans-serif";
      ctx.fillText(title, width / 2, height / 2 - 10);
      ctx.font = "400 22px system-ui, sans-serif";
      ctx.fillText(sub, width / 2, height / 2 + 36);
    }
    return { update, render, pause: () => { if (mode === "playing") mode = "paused"; } };
  }

## Collision helpers (js/collide.js)
  export const aabb = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  export function circles(a, b) { const dx = a.x - b.x, dy = a.y - b.y, r = a.r + b.r; return dx * dx + dy * dy < r * r; }
  export function circleRect(c, r) {
    const nx = Math.max(r.x, Math.min(c.x, r.x + r.w)), ny = Math.max(r.y, Math.min(c.y, r.y + r.h));
    const dx = c.x - nx, dy = c.y - ny;
    return dx * dx + dy * dy < c.r * c.r;
  }
  export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  export const lerp = (a, b, t) => a + (b - a) * t;
- Platformers: move on x and resolve overlaps, then move on y and resolve (set vy = 0 and onGround on a floor hit).
  Fast bullets: several substeps per update, or test the segment, so they don't tunnel through thin walls.

## Particles, screen shake, camera
  export function createParticles(max = 600) {
    const list = [];
    return {
      burst(x, y, { count = 16, color = "#fbbf24", speed = 240, life = 0.6 } = {}) {
        for (let i = 0; i < count && list.length < max; i++) {
          const a = Math.random() * Math.PI * 2, s = speed * (0.3 + Math.random() * 0.7);
          list.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life, total: life, color });
        }
      },
      update(dt) {
        for (let i = list.length - 1; i >= 0; i--) {
          const p = list[i];
          p.life -= dt;
          if (p.life <= 0) { list[i] = list[list.length - 1]; list.pop(); continue; }
          p.vy += 500 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
        }
      },
      draw(ctx) {
        for (const p of list) { ctx.globalAlpha = p.life / p.total; ctx.fillStyle = p.color; ctx.fillRect(p.x - 2, p.y - 2, 4, 4); }
        ctx.globalAlpha = 1;
      },
    };
  }
- Shake as in game.js: a timer that decays in update, a random translate inside save/restore around the world only
  (never the HUD), zero when prefers-reduced-motion is set.
- Camera for worlds bigger than the screen:
  const camera = { x: 0, y: 0, w: 960, h: 540 };
  function follow(cam, target, world, dt) {
    const k = Math.min(1, dt * 8);
    cam.x = clamp(lerp(cam.x, target.x + target.w / 2 - cam.w / 2, k), 0, Math.max(0, world.w - cam.w));
    cam.y = clamp(lerp(cam.y, target.y + target.h / 2 - cam.h / 2, k), 0, Math.max(0, world.h - cam.h));
  }
  // render: ctx.save(); ctx.translate(-Math.round(camera.x), -Math.round(camera.y)); drawWorld(); ctx.restore(); drawHud();
- Draw only what the camera sees (aabb(camera, thing)); for tile maps loop only over the visible tile range.
  Parallax backgrounds: translate by camera.x * 0.3 before drawing them.
- Sprites: load all images before starting (loadImage() from the files section works in the preview), draw frames
  from a sheet with ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh); ctx.imageSmoothingEnabled = false for pixel art.
` });

  add({ id: "threejs", title: "3D WITH THREE.JS",
    match: /\b(3d|three\.?js|threejs|webgl|scene|gltf|glb|orbit|orbitcontrols|3d model)\b/i,
    files: /\.(glb|gltf)$/i, text: `
## Imports (bare names map to esm.sh in the preview)
  import * as THREE from "three";
  import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
  import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
- Import only through these names; never mix in a second copy of three from another URL or version
  ("Multiple instances of Three.js" warnings, broken instanceof checks).

## Scene setup (js/scene.js)
  const canvas = document.querySelector("#scene");     // CSS: display: block; width: 100%; height: 100%;
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true }); }
  catch { canvas.replaceWith(Object.assign(document.createElement("p"), { textContent: "3D needs WebGL, which isn't available here." })); throw new Error("WebGL unavailable"); }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#0f172a");
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
  camera.position.set(3, 2.5, 5);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, 0.5, 0);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x334155, 1.2));
  const sun = new THREE.DirectionalLight(0xffffff, 2.5);
  sun.position.set(5, 8, 4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  scene.add(sun);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshStandardMaterial({ color: "#1e293b" }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: "#38bdf8", roughness: 0.4 }));
  box.position.y = 0.5;
  box.castShadow = true;
  scene.add(box);

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);                    // false: don't touch the CSS size
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(canvas);

  let last = 0;
  renderer.setAnimationLoop((t) => {
    const dt = Math.min((t - last) / 1000, 0.1);
    last = t;
    box.rotation.y += dt * 0.6;
    controls.update();                                 // required every frame with damping
    renderer.render(scene, camera);
  });
- Give the canvas's container a real height (height: 100dvh, or a fixed height in a layout), or the size is 0.
- Static scenes: skip the loop; render once and on controls.addEventListener("change", ...) instead.
- Lights: MeshStandardMaterial is black without lights. Colors in hex or CSS strings; lengths in meters-ish units.

## Loading models (glTF / GLB)
- Use .glb (one self-contained file). In the preview, loaders that fetch with a Request object or set img.src don't
  see project files, so fetch the bytes yourself and parse them:
  const loader = new GLTFLoader();
  async function loadModel(path) {
    const res = await fetch(path);
    if (!res.ok) throw new Error("Model not found: " + path);
    const gltf = await loader.parseAsync(await res.arrayBuffer(), "");
    const model = gltf.scene;
    const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
    model.scale.setScalar(2 / Math.max(size.x, size.y, size.z, 0.001));   // fit to about 2 units
    const center = new THREE.Box3().setFromObject(model).getCenter(new THREE.Vector3());
    model.position.sub(center);
    model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    scene.add(model);
    return gltf;
  }
- Show a loading state and an error message; models from URLs on other sites need CORS.
- Animations: const mixer = new THREE.AnimationMixer(gltf.scene); mixer.clipAction(gltf.animations[0]).play();
  and mixer.update(dt) in the loop.
- Textures from project files: const tex = await new THREE.TextureLoader().loadAsync(await assetURL("textures/wood.jpg"));
  tex.colorSpace = THREE.SRGBColorSpace; (assetURL from the files section.)
- No model file? Build the object from primitives (Box, Sphere, Cylinder, Torus, Lathe, Extrude) grouped in THREE.Group.

## Picking objects with the pointer
  const ray = new THREE.Raycaster(), pointer = new THREE.Vector2();
  canvas.addEventListener("pointerdown", (e) => {
    const r = canvas.getBoundingClientRect();
    pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(pointer, camera);
    const hit = ray.intersectObjects(scene.children, true)[0];
    if (hit) select(hit.object);
  });

## Disposing (memory is not freed automatically)
  export function disposeObject(root) {
    root.traverse((o) => {
      o.geometry?.dispose();
      for (const m of [].concat(o.material || [])) {
        for (const v of Object.values(m)) if (v?.isTexture) v.dispose();
        m.dispose();
      }
    });
    root.removeFromParent();
  }
  // leaving the screen: renderer.setAnimationLoop(null); controls.dispose(); renderer.dispose();

## Performance
- Pixel ratio capped at 2 (1.5 on phones for heavy scenes); one renderer for the page; one or two shadow-casting lights.
- Many copies of one thing: one THREE.InstancedMesh(geometry, material, count) with setMatrixAt(i, matrix) and
  mesh.instanceMatrix.needsUpdate = true, instead of thousands of meshes.
- Share geometries and materials; never create geometries, materials or vectors inside the frame loop.
- Watch renderer.info.render.calls (draw calls) and keep it in the low hundreds; small textures (1024 or 2048 max).
- Labels and UI as HTML positioned over the canvas, not 3D text.
` });

  add({ id: "charts-svg", title: "CHARTS WITHOUT LIBRARIES",
    match: /\b(chart|charts|graph|graphs|plot|bar chart|line chart|pie|donut|doughnut|sparkline|sparklines|histogram)\b|גרף/i,
    files: /chart[\w-]*\.js$/i, text: `
## Shared helpers (js/charts/core.js)
  const NS = "http://www.w3.org/2000/svg";
  export function svgEl(tag, attrs = {}) {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
    return n;
  }
  export const scale = (d0, d1, r0, r1) => (v) => r0 + ((v - d0) / (d1 - d0 || 1)) * (r1 - r0);
  export function niceTicks(min, max, count = 5) {
    const raw = (max - min || 1) / count;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const f = raw / mag;
    const step = (f >= 7.5 ? 10 : f >= 3.5 ? 5 : f >= 1.5 ? 2 : 1) * mag;
    const ticks = [];
    for (let v = Math.floor(min / step) * step; v <= Math.ceil(max / step) * step + step / 2; v += step) ticks.push(Number(v.toFixed(10)));
    return ticks;
  }
  export function mountSvg(container, svg) {   // replaces the old chart, keeps the tooltip element
    const old = container.querySelector(":scope > svg");
    if (old) old.replaceWith(svg); else container.prepend(svg);
  }
  export function attachTooltip(container) {
    const tip = Object.assign(document.createElement("div"), { className: "chart-tip", hidden: true });
    container.style.position = "relative";
    container.append(tip);
    const show = (t, x, y) => { tip.textContent = t.dataset.tip; tip.style.left = x + "px"; tip.style.top = y + "px"; tip.hidden = false; };
    container.addEventListener("pointermove", (e) => {
      const t = e.target.closest("[data-tip]");
      if (!t) { tip.hidden = true; return; }
      const r = container.getBoundingClientRect();
      show(t, e.clientX - r.left, e.clientY - r.top);
    });
    container.addEventListener("pointerleave", () => { tip.hidden = true; });
    container.addEventListener("focusin", (e) => {
      const t = e.target.closest("[data-tip]");
      if (!t) return;
      const r = container.getBoundingClientRect(), b = t.getBoundingClientRect();
      show(t, b.left - r.left + b.width / 2, b.top - r.top);
    });
    container.addEventListener("focusout", () => { tip.hidden = true; });
  }
  /* CSS */
  .chart-tip { position: absolute; transform: translate(-50%, calc(-100% - 10px)); pointer-events: none; padding: 4px 8px;
               border-radius: 6px; background: #111827; color: #fff; font-size: 12px; white-space: nowrap; }
  .chart .grid { stroke: currentColor; opacity: 0.12; }
  .chart .tick { fill: currentColor; opacity: 0.7; font-size: 12px; font-variant-numeric: tabular-nums; }
  .chart .bar { fill: var(--accent); }  .chart .bar:hover, .chart .bar:focus { opacity: 0.8; outline: none; }

## Bar chart (values of 0 or more)
  export function barChart(container, data, { height = 280, format = (v) => v.toLocaleString(), label = "Bar chart" } = {}) {
    const width = container.clientWidth || 600;
    const m = { top: 16, right: 12, bottom: 32, left: 52 };
    const iw = width - m.left - m.right, ih = height - m.top - m.bottom;
    const ticks = niceTicks(0, Math.max(0, ...data.map((d) => d.value)) || 1);
    const y = scale(0, ticks[ticks.length - 1], ih, 0);
    const band = iw / Math.max(1, data.length), bw = Math.max(2, band * 0.66);
    const svg = svgEl("svg", { class: "chart", viewBox: "0 0 " + width + " " + height, width: "100%", height, role: "img", "aria-label": label });
    const g = svgEl("g", { transform: "translate(" + m.left + "," + m.top + ")" });
    svg.append(g);
    for (const t of ticks) {
      g.append(svgEl("line", { class: "grid", x1: 0, x2: iw, y1: y(t), y2: y(t) }));
      const tx = svgEl("text", { class: "tick", x: -8, y: y(t), "text-anchor": "end", "dominant-baseline": "middle" });
      tx.textContent = format(t);
      g.append(tx);
    }
    data.forEach((d, i) => {
      const x = i * band + (band - bw) / 2;
      const bar = svgEl("rect", { class: "bar", x, y: y(d.value), width: bw, height: Math.max(0, ih - y(d.value)), rx: 3, tabindex: 0 });
      bar.dataset.tip = d.label + ": " + format(d.value);
      const lab = svgEl("text", { class: "tick", x: x + bw / 2, y: ih + 20, "text-anchor": "middle" });
      lab.textContent = d.label;
      g.append(bar, lab);
    });
    mountSvg(container, svg);
  }
- Call attachTooltip(container) once, render on data change, and re-render on resize:
  new ResizeObserver(debounce(() => barChart(el, data), 100)).observe(el);
- Many or long labels: show every nth label, rotate them, or switch to horizontal bars.
- Empty data: render a designed empty state ("No sales in this period") instead of an empty axis.

## Line chart (one or more series, x as numbers or timestamps)
  export function lineChart(container, series, { height = 280, format = (v) => v.toLocaleString(), formatX = String, label = "Line chart" } = {}) {
    const width = container.clientWidth || 600;
    const m = { top: 16, right: 16, bottom: 32, left: 52 };
    const iw = width - m.left - m.right, ih = height - m.top - m.bottom;
    const pts = series.flatMap((s) => s.points);
    if (!pts.length) return;
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    const ticks = niceTicks(Math.min(0, ...ys), Math.max(...ys));
    const x = scale(Math.min(...xs), Math.max(...xs), 0, iw);
    const y = scale(ticks[0], ticks[ticks.length - 1], ih, 0);
    const svg = svgEl("svg", { class: "chart", viewBox: "0 0 " + width + " " + height, width: "100%", height, role: "img", "aria-label": label });
    const g = svgEl("g", { transform: "translate(" + m.left + "," + m.top + ")" });
    svg.append(g);
    for (const t of ticks) {
      g.append(svgEl("line", { class: "grid", x1: 0, x2: iw, y1: y(t), y2: y(t) }));
      const tx = svgEl("text", { class: "tick", x: -8, y: y(t), "text-anchor": "end", "dominant-baseline": "middle" });
      tx.textContent = format(t);
      g.append(tx);
    }
    const first = series[0].points;
    const every = Math.max(1, Math.ceil(first.length / 6));
    first.forEach((p, i) => {
      if (i % every) return;
      const tx = svgEl("text", { class: "tick", x: x(p.x), y: ih + 20, "text-anchor": "middle" });
      tx.textContent = formatX(p.x);
      g.append(tx);
    });
    for (const s of series) {
      const d = s.points.map((p, i) => (i ? "L" : "M") + x(p.x).toFixed(1) + " " + y(p.y).toFixed(1)).join(" ");
      g.append(svgEl("path", { d, fill: "none", stroke: s.color, "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" }));
      for (const p of s.points) {
        const dot = svgEl("circle", { cx: x(p.x), cy: y(p.y), r: 4, fill: s.color, tabindex: 0 });
        dot.dataset.tip = s.name + ", " + formatX(p.x) + ": " + format(p.y);
        g.append(dot);
      }
    }
    mountSvg(container, svg);
  }
- Dates: pass timestamps (date.getTime()) and formatX = (t) => shortDate.format(t) with a module-level
  Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).
- Area fill: the line path + " L" + x(lastX) + " " + ih + " L" + x(firstX) + " " + ih + " Z" with a low-opacity fill.
- More than about 100 points: skip the dots and find the nearest point to the pointer on an overlay rect instead.
- Several series need a legend (HTML list with a color swatch and the name), and distinct, color-blind-safe colors.

## Donut (stroke-dasharray)
  export function donut(container, data, { size = 180, thickness = 26, colors = ["#2563eb", "#16a34a", "#f59e0b", "#dc2626", "#7c3aed"] } = {}) {
    const r = (size - thickness) / 2, c = 2 * Math.PI * r, mid = size / 2;
    const total = data.reduce((sum, d) => sum + d.value, 0);
    const svg = svgEl("svg", { viewBox: "0 0 " + size + " " + size, width: size, height: size, role: "img", "aria-label": data.map((d) => d.label + " " + d.value).join(", ") });
    svg.append(svgEl("circle", { cx: mid, cy: mid, r, fill: "none", stroke: "currentColor", "stroke-opacity": 0.1, "stroke-width": thickness }));
    let offset = 0;
    data.forEach((d, i) => {
      const len = total ? (d.value / total) * c : 0;
      const arc = svgEl("circle", { cx: mid, cy: mid, r, fill: "none", stroke: colors[i % colors.length], "stroke-width": thickness,
        "stroke-dasharray": len + " " + (c - len), "stroke-dashoffset": -offset, transform: "rotate(-90 " + mid + " " + mid + ")", tabindex: 0 });
      arc.dataset.tip = d.label + ": " + Math.round(total ? (d.value / total) * 100 : 0) + "%";
      svg.append(arc);
      offset += len;
    });
    mountSvg(container, svg);
  }
- Put the total in the middle as HTML over the SVG (or an SVG text), and a legend with values beside it.
- A pie is the same with thickness close to size / 2. More than 5 slices: use a bar chart instead.

## Sparkline
  export function sparkline(values, { width = 120, height = 32, stroke = "currentColor" } = {}) {
    const svg = svgEl("svg", { viewBox: "0 0 " + width + " " + height, width, height, "aria-hidden": "true" });
    if (values.length < 2) return svg;
    const x = scale(0, values.length - 1, 1, width - 1);
    const y = scale(Math.min(...values), Math.max(...values), height - 2, 2);
    const d = values.map((v, i) => (i ? "L" : "M") + x(i).toFixed(1) + " " + y(v).toFixed(1)).join(" ");
    svg.append(svgEl("path", { d, fill: "none", stroke, "stroke-width": 1.5, "stroke-linejoin": "round", "stroke-linecap": "round" }));
    return svg;
  }
- Sparklines are decoration next to a number: the KPI text carries the meaning (aria-hidden on the SVG).

## When to use Chart.js instead
- Many series or points, zoom/pan, mixed types, animated updates, legends that toggle series:
  import Chart from "chart.js/auto";
  const chart = new Chart(canvas, {
    type: "line",
    data: { labels, datasets: [{ label: "Revenue", data: values, borderColor: "#2563eb", tension: 0.3 }] },
    options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } },
  });
- Wrap the canvas in a div with position: relative and a fixed height when maintainAspectRatio is false.
- Update with chart.data.datasets[0].data = next; chart.update(); call chart.destroy() before creating a new chart
  on the same canvas ("Canvas is already in use"). Time axes need a date adapter; category labels are simpler.
` });

  add({ id: "workers-perf", title: "HEAVY WORK AND PERFORMANCE IN JS",
    match: /\b(slow|slowly|performance|perf|worker|workers|web worker|heavy|large list|long list|virtual|virtuali[sz]e|lag|laggy|jank|janky|freez\w*|fps|optimi\w*)\b/i,
    files: /worker[\w-]*\.js$/i, text: `
## Measure first
  const t0 = performance.now();
  const result = buildReport(rows);
  console.log("buildReport: " + (performance.now() - t0).toFixed(1) + " ms for " + rows.length + " rows");
- Anything over about 50 ms on the main thread is a visible freeze. Fix the biggest measured cost, then measure again.
- Usual culprits: re-rendering everything on each keystroke, layout thrashing, huge DOM lists, work repeated inside
  loops (formatters, regexes, querySelector), and unthrottled scroll or pointer handlers.

## Web workers for heavy computation
- Normal hosting and Vite: new Worker(new URL("./worker.js", import.meta.url), { type: "module" }).
- In the FIZZ preview, project modules are served as data: URLs, so a worker file from the project may not load.
  The safe pattern everywhere is an inline worker built from a self-contained function:
  // js/worker-client.js
  function workerMain() {                        // runs inside the worker: no imports, no outer variables, no DOM
    function countPrimes(limit) {
      const sieve = new Uint8Array(limit + 1);
      let count = 0;
      for (let i = 2; i <= limit; i++) {
        if (sieve[i]) continue;
        count++;
        for (let j = i * i; j <= limit; j += i) sieve[j] = 1;
      }
      return count;
    }
    const tasks = { countPrimes };
    self.onmessage = (e) => {
      const { id, type, payload } = e.data;
      try { self.postMessage({ id, result: tasks[type](payload) }); }
      catch (err) { self.postMessage({ id, error: String(err?.message || err) }); }
    };
  }
  const pending = new Map();
  let worker = null, nextId = 0;
  function getWorker() {
    if (worker) return worker;
    const url = URL.createObjectURL(new Blob(["(" + workerMain.toString() + ")();"], { type: "text/javascript" }));
    worker = new Worker(url);
    worker.onmessage = (e) => {
      const { id, result, error } = e.data;
      const p = pending.get(id);
      if (!p) return;
      pending.delete(id);
      if (error) p.reject(new Error(error)); else p.resolve(result);
    };
    worker.onerror = (e) => {
      pending.forEach((p) => p.reject(new Error(e.message || "Worker failed")));
      pending.clear();
    };
    return worker;
  }
  export function runTask(type, payload) {
    return new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve, reject });
      try { getWorker().postMessage({ id, type, payload }); }
      catch (err) { pending.delete(id); reject(err); }
    });
  }
  // usage: const n = await runTask("countPrimes", 5000000);
- Show progress or a spinner while a task runs; keep the UI usable. If creating the worker throws, fall back to
  running the function on the main thread in chunks (below).
- Large binary data: transfer instead of copying, postMessage(msg, [buffer]). Workers can't touch the DOM; to draw
  off the main thread use canvas.transferControlToOffscreen().
- A blob worker created with { type: "module" } can import absolute URLs (https://esm.sh/...), not project files.

## Chunking on the main thread
  const yieldToBrowser = () => (globalThis.scheduler?.yield ? scheduler.yield() : new Promise((r) => setTimeout(r, 0)));
  export async function processInChunks(items, fn, size = 500, onProgress) {
    for (let i = 0; i < items.length; i += size) {
      for (const item of items.slice(i, i + size)) fn(item);
      onProgress?.(Math.min(1, (i + size) / items.length));
      await yieldToBrowser();
    }
  }

## Batching DOM work with requestAnimationFrame
  let queued = false;
  export function scheduleRender() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; render(store.get()); });
  }
- Many state changes in one tick then cost one render. Subscribe scheduleRender instead of render for busy apps.
- Read layout first, then write: measure all elements (getBoundingClientRect, offsetHeight) in one pass, then set
  styles in a second pass. Alternating read/write in a loop forces a layout per item.
- Scroll and touch listeners with { passive: true }; animate only transform and opacity; will-change sparingly.

## Virtual list (fixed row height, for thousands of rows)
  export function virtualList(viewport, { rowHeight, count, renderRow, overscan = 6 }) {
    // viewport needs a fixed height in CSS (e.g. height: 70vh) and position: relative
    viewport.style.overflowY = "auto";
    const spacer = document.createElement("div");
    const layer = document.createElement("div");
    layer.style.cssText = "position:absolute;top:0;left:0;right:0";
    viewport.replaceChildren(spacer, layer);
    let total = count, raf = 0;
    function draw() {
      const first = Math.max(0, Math.floor(viewport.scrollTop / rowHeight) - overscan);
      const last = Math.min(total, first + Math.ceil(viewport.clientHeight / rowHeight) + overscan * 2);
      spacer.style.height = total * rowHeight + "px";
      layer.style.transform = "translateY(" + first * rowHeight + "px)";
      const rows = [];
      for (let i = first; i < last; i++) { const row = renderRow(i); row.style.height = rowHeight + "px"; rows.push(row); }
      layer.replaceChildren(...rows);
    }
    viewport.addEventListener("scroll", () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; draw(); }); }, { passive: true });
    new ResizeObserver(draw).observe(viewport);
    draw();
    return { setCount(n) { total = n; draw(); }, refresh: draw };
  }
- Use it only for very long lists (thousands of rows): it breaks find-in-page and needs care for accessibility.
  For hundreds of rows, pagination or CSS content-visibility: auto with contain-intrinsic-size: auto 64px is enough.

## Lazy loading
- Images: loading="lazy" decoding="async" with width and height set. Heavy screens: load their module on demand with a
  literal path, const { openEditor } = await import("./editor.js"); (the preview resolves literal import paths).
- Infinite scroll with a sentinel element and a guard:
  let loading = false, hasMore = true;
  const io = new IntersectionObserver(async ([entry]) => {
    if (!entry.isIntersecting || loading || !hasMore) return;
    loading = true;
    try { hasMore = await loadNextPage(); } finally { loading = false; }
  }, { rootMargin: "400px" });
  io.observe(document.querySelector("#sentinel"));
- Cache expensive results (a Map keyed by input) and create formatters, regexes and lookups once, outside loops.
` });
})();
