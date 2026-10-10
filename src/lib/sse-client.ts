"use client";

export type SSEEvent = { event: string; data: unknown };

/** Parses a text/event-stream response body and invokes `onEvent` for each event. */
export async function readSSE(res: Response, onEvent: (e: SSEEvent) => void, signal?: AbortSignal) {
  if (!res.body) throw new Error("Empty response stream");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const abort = () => reader.cancel().catch(() => undefined);
  signal?.addEventListener("abort", abort);
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf("\n\n")) !== -1) {
        const raw = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        let event = "message";
        const dataLines: string[] = [];
        for (const line of raw.split("\n")) {
          if (line.startsWith(":")) continue;
          if (line.startsWith("event:")) event = line.slice(6).trim();
          else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
        }
        if (!dataLines.length) continue;
        let data: unknown = dataLines.join("\n");
        try {
          data = JSON.parse(dataLines.join("\n"));
        } catch {}
        onEvent({ event, data });
      }
    }
  } finally {
    signal?.removeEventListener("abort", abort);
  }
}
