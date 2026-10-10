import "server-only";

/**
 * Server-sent events channel. Writes after the client disconnects are dropped,
 * so long-running work can continue (and persist) independently of the request.
 */
export function createSSE() {
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  let closed = false;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
      heartbeat = setInterval(() => write(": ping\n\n"), 15_000);
    },
    cancel() {
      closed = true;
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  function write(chunk: string) {
    if (closed || !controller) return;
    try {
      controller.enqueue(encoder.encode(chunk));
    } catch {
      closed = true;
    }
  }

  return {
    stream,
    send(event: string, data: unknown) {
      write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    },
    close() {
      if (heartbeat) clearInterval(heartbeat);
      if (closed || !controller) return;
      closed = true;
      try {
        controller.close();
      } catch {}
    },
    get isClosed() {
      return closed;
    },
  };
}

export const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
};
