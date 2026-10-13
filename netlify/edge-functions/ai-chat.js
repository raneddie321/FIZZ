// FIZZ AI proxy on Netlify. Runs at the edge so long streams aren't cut off; quota in Netlify Blobs.
import { getStore } from "@netlify/blobs";
import { handleChat } from "../lib/ai-chat-core.mjs";

const env = (k) => (globalThis.Netlify?.env.get(k) ?? "").trim() || undefined;

export default async (req, context) => {
  const store = getStore("fizz-quota");
  const bump = async (key, limit) => {
    const current = Number((await store.get(key)) || 0);
    if (current >= limit) return false;
    await store.set(key, String(current + 1));
    return true;
  };
  return handleChat(req, { env, ip: context.ip, bump });
};

export const config = { path: "/api/ai/chat" };
