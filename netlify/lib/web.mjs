// Web search and page reading for Fizz Code and the FIZZ DEV browser.
// Search: Browserbase (BROWSERBASE_API_KEY), Brave (BRAVE_SEARCH_API_KEY) or Tavily (TAVILY_API_KEY);
// without a key, Wikipedia. Reading: Browserbase's fetch (renders JS, returns Markdown) or a direct fetch
// that refuses private/internal addresses.
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { env } from "./util.mjs";

const BB = "https://api.browserbase.com/v1";
export const searchProvider = () => (env("BROWSERBASE_API_KEY") ? "browserbase" : env("BRAVE_SEARCH_API_KEY") ? "brave" : env("TAVILY_API_KEY") ? "tavily" : "wikipedia");

async function json(url, init, what) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(15000) });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw Object.assign(new Error(`${what} error ${res.status}${data?.message ? `: ${data.message}` : ""}`), { status: 502 });
  return data;
}

export async function search(query, count = 8) {
  const q = String(query || "").trim().slice(0, 300);
  if (!q) throw Object.assign(new Error("Empty search."), { status: 400 });
  const n = Math.min(10, Math.max(1, count));
  const provider = searchProvider();
  if (provider === "browserbase") {
    const d = await json(`${BB}/search`, { method: "POST", headers: { "X-BB-API-Key": env("BROWSERBASE_API_KEY"), "Content-Type": "application/json" }, body: JSON.stringify({ query: q, numResults: n }) }, "Search");
    return { provider, results: (d.results || []).map((r) => ({ title: r.title, url: r.url, snippet: r.author ? `${r.author}${r.publishedDate ? ` · ${r.publishedDate.slice(0, 10)}` : ""}` : r.publishedDate?.slice(0, 10) || "", image: r.image || null })) };
  }
  if (provider === "brave") {
    const d = await json(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=${n}`, { headers: { Accept: "application/json", "X-Subscription-Token": env("BRAVE_SEARCH_API_KEY") } }, "Search");
    return { provider, results: (d.web?.results || []).map((r) => ({ title: r.title, url: r.url, snippet: strip(r.description || "") })) };
  }
  if (provider === "tavily") {
    const d = await json("https://api.tavily.com/search", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${env("TAVILY_API_KEY")}` }, body: JSON.stringify({ query: q, max_results: n }) }, "Search");
    return { provider, results: (d.results || []).map((r) => ({ title: r.title, url: r.url, snippet: (r.content || "").slice(0, 300) })) };
  }
  const lang = /[֐-׿]/.test(q) ? "he" : "en";
  const d = await json(`https://${lang}.wikipedia.org/w/api.php?action=query&list=search&format=json&utf8=1&srlimit=${n}&srsearch=${encodeURIComponent(q)}`, { headers: { "User-Agent": "FIZZ-DEV/1.0 (https://github.com/raneddie321/FIZZ)" } }, "Search");
  return { provider, results: (d.query?.search || []).map((r) => ({ title: r.title, url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(r.title.replace(/ /g, "_"))}`, snippet: strip(r.snippet || "") })) };
}

const strip = (html) => String(html).replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").trim();

/** True for loopback, private, link-local and other non-public addresses. */
export function privateAddress(ip) {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe8") || v.startsWith("fe9") || v.startsWith("fea") || v.startsWith("feb")) return true;
    // IPv4-mapped addresses, dotted (::ffff:10.0.0.1) or hex (::ffff:a00:1, how URL() writes them)
    const m = /^(?:0{0,4}:){0,5}:?ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v);
    if (m) return privateAddress(m[1]);
    const h = /^(?:0{0,4}:){0,5}:?ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(v);
    if (h) { const a = parseInt(h[1], 16), b = parseInt(h[2], 16); return privateAddress(`${a >> 8}.${a & 255}.${b >> 8}.${b & 255}`); }
    return v.startsWith("64:ff9b:") || v.startsWith("2002:"); // NAT64 / 6to4 can wrap private IPv4 too
  }
  const [a, b] = ip.split(".").map(Number);
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}
async function assertPublic(u) {
  if (!/^https?:$/.test(u.protocol)) throw Object.assign(new Error("Only http and https links can be read."), { status: 400 });
  if (u.port && !["80", "443"].includes(u.port)) throw Object.assign(new Error("Only the standard web ports can be read."), { status: 400 });
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (/^(localhost|.*\.local|.*\.internal|metadata\.google\.internal)$/i.test(host)) throw Object.assign(new Error("That address isn't on the public internet."), { status: 400 });
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (!addrs.length || addrs.some((a) => privateAddress(a.address))) throw Object.assign(new Error("That address isn't on the public internet."), { status: 400 });
}

/** Readable text of a page: title, headings, paragraphs, lists and links as Markdown-ish text. */
export function htmlToText(html, base) {
  const title = strip(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] || "");
  let s = html.replace(/<(script|style|noscript|svg|template|iframe)[\s\S]*?<\/\1>/gi, " ").replace(/<!--[\s\S]*?-->/g, " ");
  const main = /<(main|article)\b[\s\S]*?<\/\1>/i.exec(s)?.[0];
  if (main && main.length > 800) s = main;
  s = s.replace(/<a\b[^>]*href=["']([^"'#][^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi, (_m, href, t) => { const text = strip(t); if (!text) return " "; try { return `[${text}](${new URL(href, base).href})`; } catch { return text; } });
  s = s.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_m, n, t) => `\n\n${"#".repeat(Number(n))} ${strip(t)}\n\n`)
    .replace(/<li[^>]*>/gi, "\n- ").replace(/<(br|hr)\s*\/?>/gi, "\n").replace(/<\/(p|div|section|tr|table|ul|ol|header|footer|blockquote)>/gi, "\n\n").replace(/<t[dh][^>]*>/gi, " | ");
  const text = strip(s).replace(/[ \t\f\v]+/g, " ").replace(/\n[ \t]+/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return { title, text };
}

/** A page's readable text — or with raw, the response body as it is (for curl/wget). */
export async function read(rawUrl, { maxChars = 20000, raw = false } = {}) {
  let u;
  try { u = new URL(String(rawUrl)); } catch { throw Object.assign(new Error("That isn't a valid link."), { status: 400 }); }
  if (env("BROWSERBASE_API_KEY") && !raw) {
    await assertPublic(u);
    const d = await json(`${BB}/fetch`, { method: "POST", headers: { "X-BB-API-Key": env("BROWSERBASE_API_KEY"), "Content-Type": "application/json" }, body: JSON.stringify({ url: u.href, format: "markdown", allowRedirects: true }) }, "Read");
    const content = typeof d.content === "string" ? d.content : JSON.stringify(d.content);
    return { url: u.href, status: d.statusCode, title: /^#\s+(.+)$/m.exec(content)?.[1] || "", text: content.slice(0, maxChars), truncated: content.length > maxChars };
  }
  for (let hop = 0; hop < 4; hop++) {
    await assertPublic(u);
    const res = await fetch(u, { redirect: "manual", signal: AbortSignal.timeout(12000), headers: { "User-Agent": "Mozilla/5.0 (compatible; FIZZ-DEV/1.0; +https://github.com/raneddie321/FIZZ)", Accept: "text/html,application/xhtml+xml,text/plain,application/json;q=0.9,*/*;q=0.5" } });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) { u = new URL(res.headers.get("location"), u); continue; }
    const type = res.headers.get("content-type") || "";
    const reader = res.body?.getReader();
    let size = 0;
    const chunks = [];
    while (reader) { const { done, value } = await reader.read(); if (done) break; size += value.length; chunks.push(value); if (size > 2_000_000) { reader.cancel(); break; } }
    const body = new TextDecoder().decode(Buffer.concat(chunks.map((c) => Buffer.from(c))));
    const out = /html|xml/.test(type) && !raw ? htmlToText(body, u.href) : { title: "", text: body };
    return { url: u.href, status: res.status, title: out.title, text: out.text.slice(0, maxChars), truncated: out.text.length > maxChars };
  }
  throw Object.assign(new Error("Too many redirects."), { status: 400 });
}

/** Whether a site lets other sites show it in a frame (X-Frame-Options / CSP frame-ancestors). */
export async function frameable(rawUrl) {
  const u = new URL(String(rawUrl));
  await assertPublic(u);
  const res = await fetch(u, { method: "GET", redirect: "follow", signal: AbortSignal.timeout(8000), headers: { "User-Agent": "Mozilla/5.0 (compatible; FIZZ-DEV/1.0)" } });
  res.body?.cancel?.();
  const xfo = (res.headers.get("x-frame-options") || "").toLowerCase();
  const fa = /frame-ancestors([^;]*)/i.exec(res.headers.get("content-security-policy") || "")?.[1]?.trim() || "";
  const blocked = xfo.includes("deny") || xfo.includes("sameorigin") || (fa && !/(^|\s)\*(\s|$)/.test(fa));
  return { url: res.url || u.href, frameable: !blocked, title: "" };
}
