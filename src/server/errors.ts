import "server-only";
import { db } from "./db";

/** Persists an error for the admin error log without ever throwing. */
export async function logError(source: string, error: unknown, context: Record<string, unknown> = {}, userId?: string) {
  const err = error instanceof Error ? error : new Error(String(error));
  console.error(`[${source}]`, err);
  try {
    await db.errorLog.create({
      data: {
        source,
        message: err.message.slice(0, 2000),
        stack: err.stack?.slice(0, 10_000),
        context: JSON.parse(JSON.stringify(context)),
        userId,
      },
    });
  } catch {
    // Database unavailable — console output above is the fallback.
  }
}
