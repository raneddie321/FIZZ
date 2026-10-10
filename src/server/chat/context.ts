import "server-only";
import type { Attachment, Message } from "@prisma/client";
import { storage } from "../storage";
import type { ChatMessage, ChatPart } from "../ai/types";

const MAX_HISTORY_MESSAGES = 80;
const MAX_HISTORY_CHARS = 600_000;
const MAX_ATTACHMENT_TEXT = 200_000;

type MessageWithAttachments = Message & { attachments: Attachment[] };

function escapeAttr(v: string) {
  return v.replace(/[<>"&]/g, "_");
}

async function attachmentParts(atts: Attachment[], opts: { vision: boolean; documents: boolean }): Promise<ChatPart[]> {
  const parts: ChatPart[] = [];
  for (const a of atts) {
    if (a.kind === "IMAGE") {
      if (!opts.vision) {
        parts.push({ type: "text", text: `[Image "${a.fileName}" attached, but the selected model cannot view images.]` });
        continue;
      }
      const data = (await storage().get(a.storageKey)).toString("base64");
      parts.push({ type: "image", mediaType: a.mimeType, data });
    } else if (a.mimeType === "application/pdf") {
      if (opts.documents) {
        const data = (await storage().get(a.storageKey)).toString("base64");
        parts.push({ type: "document", mediaType: "application/pdf", data, name: a.fileName });
      } else if (a.extractedText) {
        parts.push({ type: "text", text: `<attachment name="${escapeAttr(a.fileName)}">\n${a.extractedText.slice(0, MAX_ATTACHMENT_TEXT)}\n</attachment>` });
      } else {
        parts.push({ type: "text", text: `[PDF "${a.fileName}" attached, but the selected model cannot read PDF files.]` });
      }
    } else if (a.extractedText !== null) {
      const text = a.extractedText;
      const truncated = text.length > MAX_ATTACHMENT_TEXT;
      parts.push({
        type: "text",
        text: `<attachment name="${escapeAttr(a.fileName)}" type="${escapeAttr(a.mimeType)}"${truncated ? ` truncated="true" total_chars="${text.length}"` : ""}>\n${text.slice(0, MAX_ATTACHMENT_TEXT)}\n</attachment>`,
      });
    } else {
      parts.push({ type: "text", text: `[File "${a.fileName}" (${a.mimeType}) attached; its contents can't be read by FIZZ.]` });
    }
  }
  return parts;
}

/**
 * Builds provider-neutral history from stored messages, newest last.
 * Old messages beyond the budget are omitted (and the count reported) rather than silently cut mid-message.
 */
export async function buildHistory(messages: MessageWithAttachments[], opts: { vision: boolean; documents: boolean }) {
  const usable = messages.filter((m) => m.role === "USER" || (m.role === "ASSISTANT" && m.content.trim() !== ""));
  let chars = 0;
  let start = usable.length;
  while (start > 0 && usable.length - start < MAX_HISTORY_MESSAGES) {
    const len = usable[start - 1]!.content.length;
    if (chars + len > MAX_HISTORY_CHARS && start < usable.length) break;
    chars += len;
    start--;
  }
  // The first message sent to the provider must be from the user.
  while (start < usable.length && usable[start]!.role !== "USER") start++;
  const kept = usable.slice(start);
  const out: ChatMessage[] = [];
  for (const m of kept) {
    if (m.role === "USER") {
      const parts = await attachmentParts(m.attachments, opts);
      out.push({ role: "user", content: [...parts, { type: "text", text: m.content || "(see attachments)" }] });
    } else {
      out.push({ role: "assistant", content: [{ type: "text", text: m.content }] });
    }
  }
  return { messages: out, omitted: start };
}
