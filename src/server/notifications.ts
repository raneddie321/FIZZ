import "server-only";
import { db } from "./db";

export async function notify(userId: string, n: { type: string; title: string; body?: string; link?: string }) {
  try {
    await db.notification.create({ data: { userId, type: n.type, title: n.title, body: n.body ?? "", link: n.link } });
  } catch (error) {
    console.error("[notify] failed", error);
  }
}
