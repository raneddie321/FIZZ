import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { AttachmentKind } from "@prisma/client";
import { db } from "./db";
import { storage, storageKey } from "./storage";
import { badRequest, ApiError } from "./http";
import { getEffectivePlan } from "./billing/subscriptions";
import { recordUsage } from "./usage";

const HARD_LIMIT_MB = 50;

const IMAGE_TYPES: Record<string, (b: Buffer) => boolean> = {
  "image/png": (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  "image/jpeg": (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/gif": (b) => b.subarray(0, 6).toString("ascii") === "GIF87a" || b.subarray(0, 6).toString("ascii") === "GIF89a",
  "image/webp": (b) => b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP",
};

const TEXT_EXTENSIONS = new Set([
  "txt", "md", "markdown", "csv", "tsv", "json", "jsonl", "xml", "html", "htm", "css", "scss", "js", "mjs", "cjs", "ts", "tsx", "jsx",
  "py", "java", "kt", "c", "h", "cpp", "hpp", "cs", "go", "rs", "rb", "php", "swift", "sh", "bash", "zsh", "yaml", "yml", "toml",
  "ini", "env", "sql", "log", "graphql", "vue", "svelte", "lua", "r", "dart", "tex", "rst",
]);

export type DetectedFile = { kind: AttachmentKind; mimeType: string; extractedText: string | null };

export function detectFile(fileName: string, declaredType: string, data: Buffer): DetectedFile {
  for (const [mime, check] of Object.entries(IMAGE_TYPES)) {
    if (check(data)) return { kind: "IMAGE", mimeType: mime, extractedText: null };
  }
  if (data.subarray(0, 5).toString("ascii") === "%PDF-") return { kind: "DOCUMENT", mimeType: "application/pdf", extractedText: null };
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  if (TEXT_EXTENSIONS.has(ext) || declaredType.startsWith("text/") || declaredType === "application/json") {
    if (data.includes(0)) throw badRequest(`"${fileName}" looks like a binary file, not text.`);
    const text = data.toString("utf8");
    const mimeType = declaredType && declaredType !== "application/octet-stream" ? declaredType : "text/plain";
    return { kind: "DOCUMENT", mimeType, extractedText: text };
  }
  throw new ApiError(
    415,
    "unsupported_file",
    `"${fileName}" isn't a supported file type. FIZZ accepts images (PNG, JPEG, GIF, WebP), PDFs, and text or code files.`,
  );
}

export async function saveUpload(userId: string, file: File, opts: { conversationId?: string | null; generated?: boolean } = {}) {
  const { limits } = await getEffectivePlan(userId);
  const maxMb = Math.min(limits.maxUploadMb, HARD_LIMIT_MB);
  if (file.size > maxMb * 1024 * 1024) throw new ApiError(413, "file_too_large", `"${file.name}" is larger than your plan's ${maxMb} MB upload limit.`);
  if (file.size === 0) throw badRequest(`"${file.name}" is empty.`);
  const data = Buffer.from(await file.arrayBuffer());
  const detected = detectFile(file.name, file.type, data);
  return storeAttachment(userId, file.name.slice(0, 200), data, detected, opts);
}

export async function storeAttachment(
  userId: string,
  fileName: string,
  data: Buffer,
  detected: DetectedFile,
  opts: { conversationId?: string | null; generated?: boolean } = {},
) {
  if (opts.conversationId) {
    const conv = await db.conversation.findFirst({ where: { id: opts.conversationId, userId } });
    if (!conv) throw badRequest("Conversation not found.");
  }
  const id = randomUUID();
  const key = storageKey(userId, id, fileName);
  await storage().put(key, data, detected.mimeType);
  const attachment = await db.attachment.create({
    data: {
      userId,
      conversationId: opts.conversationId ?? null,
      fileName,
      mimeType: detected.mimeType,
      size: data.length,
      kind: detected.kind,
      storageKey: key,
      sha256: createHash("sha256").update(data).digest("hex"),
      extractedText: detected.extractedText,
      generated: opts.generated ?? false,
    },
  });
  await recordUsage({ userId, kind: "UPLOAD", quantity: 1, metadata: { bytes: data.length, mimeType: detected.mimeType } });
  return attachment;
}

export function publicAttachment(a: { id: string; fileName: string; mimeType: string; size: number; kind: AttachmentKind; generated: boolean }) {
  return { id: a.id, fileName: a.fileName, mimeType: a.mimeType, size: a.size, kind: a.kind, generated: a.generated, url: `/api/attachments/${a.id}` };
}
