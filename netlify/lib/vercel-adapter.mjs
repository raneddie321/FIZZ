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

// Daily quota counter for the FIZZ AI proxy (Upstash Redis when connected, else per-instance memory).
export { quotaCounter } from "./kv.mjs";
