/** Only allow same-site relative paths to prevent open redirects. */
export function safeNext(next: string | null | undefined, fallback = "/chat"): string {
  if (!next || typeof next !== "string") return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  if (/[\r\n]/.test(next)) return fallback;
  return next;
}
