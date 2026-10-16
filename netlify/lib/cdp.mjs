// A minimal Chrome DevTools Protocol client over WebSocket (Node 22+ has WebSocket built in).
// Used to drive the cloud browser: one connection per request, attached to one tab.

export async function connect(url, { timeout = 15000 } = {}) {
  const ws = new WebSocket(url);
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("The cloud browser didn't answer.")), timeout);
    ws.addEventListener("open", () => { clearTimeout(t); resolve(); }, { once: true });
    ws.addEventListener("error", () => { clearTimeout(t); reject(new Error("Couldn't connect to the cloud browser.")); }, { once: true });
  });
  let next = 0;
  const pending = new Map();
  const listeners = new Set();
  ws.addEventListener("message", (e) => {
    let m;
    try { m = JSON.parse(typeof e.data === "string" ? e.data : Buffer.from(e.data).toString()); } catch { return; }
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id);
      pending.delete(m.id);
      clearTimeout(p.timer);
      if (m.error) p.reject(Object.assign(new Error(m.error.message || "Browser error"), { cdp: m.error }));
      else p.resolve(m.result || {});
    } else for (const l of listeners) l(m);
  });
  ws.addEventListener("close", () => { for (const p of pending.values()) { clearTimeout(p.timer); p.reject(new Error("The cloud browser closed the connection.")); } pending.clear(); });

  function send(method, params = {}, sessionId, ms = 20000) {
    return new Promise((resolve, reject) => {
      const id = ++next;
      const timer = setTimeout(() => { if (pending.delete(id)) reject(new Error(`The browser took too long (${method}).`)); }, ms);
      pending.set(id, { resolve, reject, timer });
      ws.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }));
    });
  }
  return { send, on: (fn) => (listeners.add(fn), () => listeners.delete(fn)), close: () => { try { ws.close(); } catch {} } };
}

/** A tab: send() bound to the tab's session, plus evaluate(). */
export async function attach(cdp, targetId) {
  const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
  const send = (method, params, ms) => cdp.send(method, params, sessionId, ms);
  async function evaluate(fn, arg) {
    const expression = `(${fn})(${arg === undefined ? "" : JSON.stringify(arg)})`;
    const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true, userGesture: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description?.split("\n")[0] || "The page script failed.");
    return r.result?.value;
  }
  return { targetId, sessionId, send, evaluate };
}

export const pages = async (cdp) => (await cdp.send("Target.getTargets")).targetInfos.filter((t) => t.type === "page" && !t.url.startsWith("devtools://"));
