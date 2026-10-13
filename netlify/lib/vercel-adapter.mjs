// Runs the FIZZ server functions on Vercel. Vercel routes by file path (api/...), so the
// path parameters that Netlify passes in `context.params` are read from the URL here.
export function route(handler, names) {
  const run = (req) => {
    // vercel.json rewrites /api/github/repos to /api/github/[action].mjs?action=repos; fall back to the path.
    const url = new URL(req.url);
    const values = url.pathname.split("/").filter(Boolean).slice(-names.length);
    const params = Object.fromEntries(names.map((n, i) => [n, url.searchParams.get(n) ?? decodeURIComponent(values[i] || "")]));
    return handler(req, { params, ip: clientIp(req) });
  };
  return { GET: run, POST: run, PUT: run, DELETE: run };
}

export function clientIp(req) {
  return (req.headers.get("x-real-ip") || req.headers.get("x-forwarded-for")?.split(",")[0] || "").trim() || null;
}

// Daily quota counter for the FIZZ AI proxy. Uses Upstash Redis when it is connected to the
// Vercel project (Storage → Upstash, which sets KV_REST_API_URL/TOKEN); otherwise a per-instance
// in-memory counter, which limits bursts but resets when Vercel starts a new instance.
const memory = new Map();
export function quotaCounter(env) {
  const url = env("KV_REST_API_URL") || env("UPSTASH_REDIS_REST_URL");
  const token = env("KV_REST_API_TOKEN") || env("UPSTASH_REDIS_REST_TOKEN");
  if (url && token) {
    return async (key, limit) => {
      const res = await fetch(`${url.replace(/\/$/, "")}/pipeline`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify([["INCR", `fizz-quota:${key}`], ["EXPIRE", `fizz-quota:${key}`, "172800"]]),
      });
      if (!res.ok) throw new Error(`quota store ${res.status}`);
      const [incr] = await res.json();
      return Number(incr?.result) <= limit;
    };
  }
  return async (key, limit) => {
    const n = (memory.get(key) || 0) + 1;
    if (memory.size > 50_000) memory.clear();
    memory.set(key, n);
    return n <= limit;
  };
}
