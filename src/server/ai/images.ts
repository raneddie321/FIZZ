import "server-only";
import { env } from "../env";
import { notConfigured } from "../http";
import { openaiClient, mapOpenAIError } from "./openai";

export function imageGenerationConfigured() {
  return Boolean(env().OPENAI_API_KEY);
}

/** Generates a PNG via the configured OpenAI-compatible Images API. */
export async function generateImage(prompt: string, size: "1024x1024" | "1536x1024" | "1024x1536") {
  if (!imageGenerationConfigured()) throw notConfigured("Image generation isn't connected yet. An administrator needs to add an OpenAI API key.");
  try {
    const res = await openaiClient().images.generate({ model: env().OPENAI_IMAGE_MODEL, prompt, size, n: 1 });
    const item = res.data?.[0];
    if (item?.b64_json) return Buffer.from(item.b64_json, "base64");
    if (item?.url) {
      const r = await fetch(item.url, { signal: AbortSignal.timeout(60_000) });
      if (!r.ok) throw new Error(`Could not download generated image (${r.status})`);
      return Buffer.from(await r.arrayBuffer());
    }
    throw new Error("The image provider returned no image.");
  } catch (error) {
    throw mapOpenAIError(error);
  }
}
