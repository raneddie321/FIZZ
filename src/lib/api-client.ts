"use client";

export class ApiClientError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

/** JSON fetch helper for the FIZZ API with consistent error messages. */
export async function apiFetch<T = unknown>(
  url: string,
  opts: { method?: string; body?: unknown; signal?: AbortSignal; headers?: Record<string, string> } = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method ?? (opts.body ? "POST" : "GET"),
      headers: opts.body !== undefined ? { "Content-Type": "application/json", ...opts.headers } : opts.headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
      credentials: "same-origin",
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    throw new ApiClientError("Can't reach FIZZ. Check your connection and try again.", 0, "network_error");
  }
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const error = (data as { error?: { message?: string; code?: string; details?: unknown } } | null)?.error;
    throw new ApiClientError(error?.message ?? `Request failed (${res.status}).`, res.status, error?.code, error?.details);
  }
  return data as T;
}
