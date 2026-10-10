import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodType } from "zod";
import { env } from "./env";
import { logError } from "./errors";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, details?: unknown) => new ApiError(400, "bad_request", message, details);
export const unauthorized = (message = "Sign in to continue.") => new ApiError(401, "unauthorized", message);
export const forbidden = (message = "You do not have permission to do that.") => new ApiError(403, "forbidden", message);
export const notFound = (message = "Not found.") => new ApiError(404, "not_found", message);
export const conflict = (message: string) => new ApiError(409, "conflict", message);
export const tooManyRequests = (message = "Too many requests. Please slow down.", retryAfter?: number) =>
  new ApiError(429, "rate_limited", message, retryAfter ? { retryAfter } : undefined);
export const limitReached = (message: string) => new ApiError(402, "limit_reached", message);
export const notConfigured = (message: string) => new ApiError(503, "not_configured", message);

export function errorResponse(error: unknown): NextResponse {
  if (error instanceof ApiError) {
    const headers: Record<string, string> = {};
    const retry = (error.details as { retryAfter?: number } | undefined)?.retryAfter;
    if (retry) headers["Retry-After"] = String(retry);
    return NextResponse.json(
      { error: { code: error.code, message: error.message, details: error.details } },
      { status: error.status, headers },
    );
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: {
          code: "validation_error",
          message: error.issues[0]?.message ?? "Invalid input.",
          details: error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
      },
      { status: 422 },
    );
  }
  void logError("api", error);
  return NextResponse.json(
    { error: { code: "internal_error", message: "Something went wrong on our side. Please try again." } },
    { status: 500 },
  );
}

/**
 * CSRF defence for cookie-authenticated mutations: the browser always sends an
 * Origin header on cross-origin POST/PUT/PATCH/DELETE, so we require it to
 * match the application origin. Combined with SameSite=Lax session cookies.
 */
export function assertSameOrigin(req: Request) {
  const method = req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return;
  const origin = req.headers.get("origin");
  const allowed = new Set<string>([new URL(env().APP_URL).origin]);
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (host && env().NODE_ENV !== "production") {
    allowed.add(`http://${host}`);
    allowed.add(`https://${host}`);
  }
  if (!origin || !allowed.has(origin)) {
    throw new ApiError(403, "invalid_origin", "Request origin is not allowed.");
  }
}

export function clientIp(req: Request): string {
  if (env().TRUST_PROXY) {
    const forwarded = req.headers.get("x-forwarded-for");
    if (forwarded) return forwarded.split(",")[0]!.trim();
    const real = req.headers.get("x-real-ip");
    if (real) return real;
  }
  return "local";
}

export async function parseJson<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw badRequest("Request body must be valid JSON.");
  }
  return schema.parse(body);
}

type Handler<C> = (req: NextRequest, ctx: C) => Promise<Response>;

/** Wraps a route handler with origin checks and uniform error handling. */
export function route<C = { params: Promise<Record<string, string>> }>(handler: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    try {
      assertSameOrigin(req);
      return await handler(req, ctx);
    } catch (error) {
      return errorResponse(error);
    }
  };
}

export function json<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}
