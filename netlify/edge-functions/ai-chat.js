// FIZZ AI proxy: streams completions from OpenRouter using the site owner's key,
// with a per-visitor daily quota. Runs at the edge so long streams aren't cut off.
import { getStore } from "@netlify/blobs";

const env = (k) => (globalThis.Netlify?.env.get(k) ?? "").trim() || undefined;
const err = (status, message, code) =>
  new Response(JSON.stringify({ error: { code, message } }), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

function cookie(req, name) {
  for (const part of (req.headers.get("cookie") || "").split(/;\s*/)) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i) === name) return part.slice(i + 1);
  }
  return null;
}

async function bump(store, key, limit) {
  const current = Number((await store.get(key)) || 0);
  if (current >= limit) return false;
  await store.set(key, String(current + 1));
  return true;
}

export default async (req, context) => {
  if (req.method !== "POST") return err(405, "Use POST.", "method");
  if (req.headers.get("origin") !== new URL(req.url).origin) return err(403, "Not allowed.", "origin");
  const apiKey = env("OPENROUTER_API_KEY");
  if (!apiKey) return err(503, "FIZZ AI isn't configured on this server yet.", "not_configured");

  let body;
  try {
    body = await req.json();
  } catch {
    return err(400, "Invalid request.", "bad_request");
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0 || body.messages.length > 200) return err(400, "Invalid messages.", "bad_request");
  if (JSON.stringify(body).length > 4_000_000) return err(413, "This conversation is too large. Start a new chat.", "too_large");

  // Per-visitor quota (anonymous id cookie + IP), reset daily (UTC).
  const limit = Number(env("FIZZ_DAILY_LIMIT") || 50);
  let uid = cookie(req, "fizz_uid");
  const headers = new Headers({ "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform" });
  if (!uid || !/^[A-Za-z0-9_-]{16,64}$/.test(uid)) {
    uid = crypto.randomUUID().replace(/-/g, "");
    headers.append("Set-Cookie", `fizz_uid=${uid}; Path=/api; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax`);
  }
  const day = new Date().toISOString().slice(0, 10);
  try {
    const store = getStore("fizz-quota");
    const okUser = await bump(store, `${day}/u/${uid}`, limit);
    const okIp = okUser && (await bump(store, `${day}/ip/${context.ip}`, limit * 3));
    if (!okUser || !okIp) return err(429, `You've used today's ${limit} free FIZZ messages. Connect your own OpenRouter account in Settings to keep going, or come back tomorrow.`, "quota");
  } catch (e) {
    console.error("quota store unavailable", e);
  }

  const allowed = (env("FIZZ_MODELS") || "").split(",").map((s) => s.trim()).filter(Boolean);
  const defaultModel = env("FIZZ_DEFAULT_MODEL") || "z-ai/glm-4.6";
  const model = allowed.includes(body.model) ? body.model : defaultModel;

  const upstream = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "HTTP-Referer": new URL(req.url).origin, "X-Title": "FIZZ" },
    body: JSON.stringify({
      model,
      stream: true,
      max_tokens: Math.min(Number(env("FIZZ_MAX_TOKENS") || 16000), 32000),
      messages: [{ role: "system", content: String(body.system || "").slice(0, 200_000) }, ...body.messages],
    }),
    signal: req.signal,
  }).catch(() => null);
  if (!upstream) return err(502, "Couldn't reach the AI service. Please try again.", "upstream");
  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => "");
    console.error("openrouter", upstream.status, detail.slice(0, 500));
    const msg = upstream.status === 429 ? "FIZZ is very busy right now. Please try again in a moment." : upstream.status === 402 ? "FIZZ AI is temporarily unavailable." : "The AI service returned an error. Please try again.";
    return err(upstream.status === 429 ? 429 : 502, msg, "upstream");
  }
  return new Response(upstream.body, { headers });
};

export const config = { path: "/api/ai/chat" };
