import { env, error, json, readJson, sameOrigin } from "../lib/util.mjs";
import { requireUser } from "../lib/auth.mjs";
import { quotaCounter, today } from "../lib/kv.mjs";
import { frameable, read, search, searchProvider } from "../lib/web.mjs";

/** Web search, page reading and frame checks for Fizz Code and the FIZZ DEV browser. */
export default async (req, context) => {
  const action = context.params.action;
  if (!sameOrigin(req)) return error(403, "Not allowed.");
  const who = await requireUser(req);
  if (who.response) return who.response;
  const bump = quotaCounter();
  const limits = { search: Number(env("FIZZ_SEARCH_LIMIT") || 200), read: Number(env("FIZZ_READ_LIMIT") || 400), frame: 2000 };
  if (!limits[action]) return error(404, "Unknown action.");
  try {
    if (!(await bump(`${today()}/web-${action}/${who.userId}`, limits[action]))) return error(429, `You've reached today's limit for ${action === "search" ? "web searches" : "reading pages"}. Try again tomorrow.`, "quota");
    const body = req.method === "POST" ? await readJson(req, 10_000) : Object.fromEntries(new URL(req.url).searchParams);
    if (action === "search") return json(await search(body.q || body.query, Number(body.count) || 8));
    if (action === "read") return json(await read(body.url, { maxChars: Math.min(body.raw === "1" || body.raw === true ? 2_000_000 : 40000, Number(body.max) || 20000), raw: body.raw === "1" || body.raw === true }));
    if (action === "frame") return json(await frameable(body.url));
  } catch (e) {
    if (!e.status) console.error("[web]", e);
    return error(e.status || 502, e.status ? e.message : "Couldn't reach that site.");
  }
};
export const config = { path: "/api/web/:action" };
