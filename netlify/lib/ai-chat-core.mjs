// FIZZ AI proxy core, shared by the Netlify edge function and the Vercel function.
// Streams completions from OpenRouter using the site owner's key, with a per-visitor daily quota.
// Host-specific pieces are passed in: env lookup, client IP and a quota counter `bump(key, limit) -> boolean`.
// Which AI service the site owner configured. OpenRouter wins if both keys are set.
// Google AI Studio (Gemini) is used through its OpenAI-compatible endpoint, so streaming works the same way.
export function aiBackend(env) {
  if (env("OPENROUTER_API_KEY")) return { name: "openrouter", key: env("OPENROUTER_API_KEY"), url: "https://openrouter.ai/api/v1/chat/completions", model: env("FIZZ_DEFAULT_MODEL") || "z-ai/glm-4.6" };
  if (env("GEMINI_API_KEY")) return { name: "gemini", key: env("GEMINI_API_KEY"), url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", model: env("FIZZ_DEFAULT_MODEL") || "gemini-3.8-flash" };
  return null;
}

const err = (status, message, code) =>
  new Response(JSON.stringify({ error: { code, message } }), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

function cookie(req, name) {
  for (const part of (req.headers.get("cookie") || "").split(/;\s*/)) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i) === name) return part.slice(i + 1);
  }
  return null;
}

export async function handleChat(req, { env, ip, bump }) {
  if (req.method !== "POST") return err(405, "Use POST.", "method");
  if (req.headers.get("origin") !== new URL(req.url).origin) return err(403, "Not allowed.", "origin");
  const backend = aiBackend(env);
  if (!backend) return err(503, "FIZZ AI isn't configured on this server yet.", "not_configured");

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
    const okUser = await bump(`${day}/u/${uid}`, limit);
    const okIp = okUser && (await bump(`${day}/ip/${ip || "unknown"}`, limit * 3));
    if (!okUser || !okIp) return err(429, `You've used today's ${limit} free FIZZ messages. Connect your own OpenRouter account in Settings to keep going, or come back tomorrow.`, "quota");
  } catch (e) {
    console.error("quota store unavailable", e);
  }

  const allowed = (env("FIZZ_MODELS") || "").split(",").map((s) => s.trim()).filter(Boolean);
  const model = allowed.includes(body.model) ? body.model : backend.model;

  // Busy models (429/500/503) are retried once, then each model in FIZZ_FALLBACK_MODELS is tried in order.
  const call = (m) => fetch(backend.url, {
    method: "POST",
    headers: { Authorization: `Bearer ${backend.key}`, "Content-Type": "application/json", ...(backend.name === "openrouter" ? { "HTTP-Referer": new URL(req.url).origin, "X-Title": "FIZZ" } : {}) },
    body: JSON.stringify({
      model: m,
      stream: true,
      max_tokens: Math.min(Number(env("FIZZ_MAX_TOKENS") || 16000), 32000),
      messages: [{ role: "system", content: String(body.system || "").slice(0, 200_000) }, ...body.messages],
    }),
    signal: req.signal,
  }).catch(() => null);
  const busy = (r) => r && [429, 500, 503].includes(r.status);
  const fallbacks = (env("FIZZ_FALLBACK_MODELS") || "").split(",").map((x) => x.trim()).filter((x) => x && x !== model);
  let upstream = await call(model);
  if (busy(upstream)) { await new Promise((ok) => setTimeout(ok, 1200)); upstream = await call(model); }
  for (const m of fallbacks) { if (!busy(upstream)) break; upstream = await call(m); }
  if (!upstream) return err(502, "Couldn't reach the AI service. Please try again.", "upstream");
  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => "");
    console.error(backend.name, upstream.status, detail.slice(0, 500));
    // Include the provider's short reason (e.g. "API key not valid", unknown model); it never contains the key.
    let reason = "";
    try { const d = JSON.parse(detail); reason = String((Array.isArray(d) ? d[0] : d)?.error?.message || "").slice(0, 200); } catch {}
    const msg = upstream.status === 429 ? "FIZZ is very busy right now. Please try again in a moment." : upstream.status === 402 ? "FIZZ AI is temporarily unavailable." : `The AI service returned an error${reason ? `: ${reason}` : ""}. Please try again.`;
    return err(upstream.status === 429 ? 429 : 502, msg, "upstream");
  }
  return new Response(upstream.body, { headers });
}
