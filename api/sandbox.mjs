import { env, error, getBigCookie, getCookie, json, readJson, sameOrigin, unseal } from "../netlify/lib/util.mjs";
import { requireUser } from "../netlify/lib/auth.mjs";
import { quotaCounter, today } from "../netlify/lib/kv.mjs";
import { Sandbox } from "@vercel/sandbox";
import { clone, look, run, sandboxEnabled, setSandboxModule, stop, wait } from "../netlify/lib/sandbox.mjs";

// Imported statically so Vercel bundles the SDK with this function.
setSandboxModule({ Sandbox });

/** Vercel only: Fizz Code's Linux sandbox. */
export async function POST(req) {
  if (!sandboxEnabled()) return error(503, "The sandbox isn't turned on for this site (FIZZ_SANDBOX=on in Vercel).", "not_configured");
  if (!sameOrigin(req)) return error(403, "Not allowed.");
  const who = await requireUser(req);
  if (who.response) return who.response;
  try {
    const body = await readJson(req, 4_500_000);
    const projectId = String(body.projectId || "").replace(/[^\w-]/g, "").slice(0, 64);
    if (!projectId) return error(400, "Missing project.");
    const args = { userId: who.userId, projectId };
    if (body.action === "run") {
      const cmd = String(body.cmd || "").slice(0, 2000);
      if (!cmd.trim()) return error(400, "Missing command.");
      if (!(await quotaCounter()(`${today()}/sandbox/${who.userId}`, Number(env("FIZZ_SANDBOX_LIMIT") || 60)))) return error(429, "You've reached today's sandbox limit. Try again tomorrow.", "quota");
      return json(await run({ ...args, files: body.files || {}, cmd, background: Boolean(body.background) }));
    }
    if (body.action === "wait") return json(await wait({ ...args, cmdId: String(body.cmdId || "") }));
    // A big repository that lives in the sandbox: clone it once, then look at it (tree, grep, read) without running user code.
    if (body.action === "clone") {
      if (!(await quotaCounter()(`${today()}/sandbox/${who.userId}`, Number(env("FIZZ_SANDBOX_LIMIT") || 60)))) return error(429, "You've reached today's sandbox limit. Try again tomorrow.", "quota");
      const gh = unseal(getBigCookie(req, "fizz_gh")); // the user's own GitHub connection, for private repositories
      return json(await clone({ ...args, url: String(body.url || ""), branch: String(body.branch || ""), token: gh?.t || "" }));
    }
    if (body.action === "look") {
      if (!(await quotaCounter()(`${today()}/sandbox-look/${who.userId}`, Number(env("FIZZ_SANDBOX_LOOK_LIMIT") || 2000)))) return error(429, "You've reached today's limit for looking at repositories in the sandbox.", "quota");
      return json(await look({ ...args, kind: String(body.kind || ""), pattern: String(body.pattern || ""), path: String(body.path || ""), glob: String(body.glob || "").slice(0, 200), ignoreCase: Boolean(body.ignoreCase), max: body.max, paths: Array.isArray(body.paths) ? body.paths.map(String) : [] }));
    }
    if (body.action === "stop") return json(await stop(args));
    return error(400, "Unknown action.");
  } catch (e) {
    console.error("[sandbox]", e);
    return error(e.status || 502, e.message || "The sandbox failed.");
  }
}
