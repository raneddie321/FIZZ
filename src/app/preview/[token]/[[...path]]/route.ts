import type { NextRequest } from "next/server";
import { db } from "@/server/db";
import { verifySignedToken } from "@/server/crypto";
import { projectSettings } from "@/server/projects/service";
import { mimeForPath } from "@/lib/languages";
import { normalizeProjectPath } from "@/lib/paths";
import { env } from "@/server/env";

// The sandbox directive gives preview documents an opaque origin: their scripts can't read
// FIZZ cookies, storage or call the FIZZ API as the user.
const PREVIEW_CSP = [
  "sandbox allow-scripts allow-forms allow-modals allow-popups allow-downloads allow-pointer-lock",
  "default-src * data: blob: 'unsafe-inline' 'unsafe-eval'",
].join("; ");

function frameAncestors() {
  return `frame-ancestors ${new URL(env().APP_URL).origin}`;
}

function notFoundPage(path: string) {
  return new Response(
    `<!doctype html><meta charset="utf-8"><title>Not found</title><body style="font-family:system-ui;padding:40px;color:#334155"><h1 style="font-size:18px">File not found</h1><p><code>${path.replace(/[<>&]/g, "")}</code> doesn't exist in this project.</p></body>`,
    { status: 404, headers: { "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": `${PREVIEW_CSP}; ${frameAncestors()}`, "Cache-Control": "no-store" } },
  );
}

function injectScripts(html: string, design: boolean) {
  const bridge = `<script src="/fizz-preview-bridge.js" data-fizz-injected></script>`;
  const inspector = design ? `<script src="/fizz-inspector.js" data-fizz-injected></script>` : "";
  let out = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => `${m}${bridge}`) : `${bridge}${html}`;
  if (inspector) out = /<\/body>/i.test(out) ? out.replace(/<\/body>(?![\s\S]*<\/body>)/i, `${inspector}</body>`) : `${out}${inspector}`;
  return out;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string; path?: string[] }> }) {
  const { token, path: segments } = await params;
  const claims = verifySignedToken<{ p: string; u: string }>(token);
  if (!claims) return new Response("Preview link expired. Reopen the preview from FIZZ DEV.", { status: 401 });
  const project = await db.project.findFirst({ where: { id: claims.p, ownerId: claims.u, owner: { status: "ACTIVE" } } });
  if (!project) return new Response("Not found", { status: 404 });

  const requested = (segments ?? []).map(decodeURIComponent).join("/");
  const settings = projectSettings(project.settings);
  const candidates = requested
    ? [requested, `${requested}/index.html`, `${requested}.html`]
    : [settings.previewEntry ?? "index.html", "index.html", "public/index.html"];

  for (const candidate of candidates) {
    const p = normalizeProjectPath(candidate);
    if (!p) continue;
    const file = await db.projectFile.findUnique({ where: { projectId_path: { projectId: project.id, path: p } } });
    if (!file) continue;
    const type = mimeForPath(p);
    let body: Uint8Array | string = file.encoding === "base64" ? new Uint8Array(Buffer.from(file.content, "base64")) : file.content;
    if (type.startsWith("text/html") && typeof body === "string") {
      body = injectScripts(body, req.nextUrl.searchParams.get("fizz-design") === "1");
    }
    return new Response(body as BodyInit, {
      headers: {
        "Content-Type": type,
        "Content-Security-Policy": `${PREVIEW_CSP}; ${frameAncestors()}`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
      },
    });
  }
  return notFoundPage(requested || "index.html");
}
