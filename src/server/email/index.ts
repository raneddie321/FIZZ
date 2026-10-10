import "server-only";
import { db } from "../db";
import { env } from "../env";

export type EmailMessage = { to: string; subject: string; text: string; html?: string };

export function emailConfigured() {
  const e = env();
  if (e.EMAIL_PROVIDER === "resend") return Boolean(e.RESEND_API_KEY);
  if (e.EMAIL_PROVIDER === "smtp") return Boolean(e.SMTP_URL);
  return false;
}

/**
 * Sends a transactional email. When no provider is configured the message is
 * recorded with status LOGGED (visible in the development mailbox) — it is
 * never reported as delivered.
 */
export async function sendEmail(message: EmailMessage): Promise<{ status: "SENT" | "LOGGED" | "FAILED"; error?: string }> {
  const e = env();
  let status: "SENT" | "LOGGED" | "FAILED" = "LOGGED";
  let error: string | undefined;
  try {
    if (e.EMAIL_PROVIDER === "resend" && e.RESEND_API_KEY) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${e.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: e.EMAIL_FROM, to: [message.to], subject: message.subject, text: message.text, html: message.html }),
      });
      if (!res.ok) throw new Error(`Resend responded ${res.status}: ${(await res.text()).slice(0, 300)}`);
      status = "SENT";
    } else if (e.EMAIL_PROVIDER === "smtp" && e.SMTP_URL) {
      const nodemailer = await import("nodemailer");
      const transport = nodemailer.createTransport(e.SMTP_URL);
      await transport.sendMail({ from: e.EMAIL_FROM, to: message.to, subject: message.subject, text: message.text, html: message.html });
      status = "SENT";
    } else {
      console.info(`[email:dev] Not sent (no email provider configured). To: ${message.to} | ${message.subject}\n${message.text}`);
    }
  } catch (err) {
    status = "FAILED";
    error = err instanceof Error ? err.message : String(err);
    console.error("[email] send failed", err);
  }
  await db.outboundEmail
    .create({
      data: { to: message.to, subject: message.subject, text: message.text, html: message.html, status, provider: e.EMAIL_PROVIDER, error },
    })
    .catch(() => undefined);
  return { status, error };
}
