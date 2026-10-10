import "server-only";

function layout(title: string, body: string, action?: { label: string; url: string }) {
  const button = action
    ? `<p style="margin:28px 0"><a href="${action.url}" style="background:#1d4ed8;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">${action.label}</a></p><p style="color:#64748b;font-size:13px">Or paste this link into your browser:<br>${action.url}</p>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#f8fafc;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a">
<div style="max-width:520px;margin:40px auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:32px">
<div style="font-weight:700;letter-spacing:.08em;font-size:13px;color:#475569">RANEDDIE ID</div>
<h1 style="font-size:22px;margin:16px 0 8px">${title}</h1>${body}${button}
<hr style="border:none;border-top:1px solid #e2e8f0;margin:28px 0"><p style="color:#94a3b8;font-size:12px">You received this email because of activity on your RANEDDIE ID account. If this wasn't you, you can ignore this message.</p>
</div></body></html>`;
}

export function verifyEmailTemplate(name: string, url: string) {
  return {
    subject: "Verify your email for RANEDDIE ID",
    text: `Hi ${name},\n\nConfirm your email address to finish setting up your RANEDDIE ID:\n${url}\n\nThis link expires in 24 hours.`,
    html: layout("Verify your email", `<p>Hi ${escapeHtml(name)}, confirm your email address to finish setting up your RANEDDIE ID. This link expires in 24 hours.</p>`, { label: "Verify email", url }),
  };
}

export function resetPasswordTemplate(name: string, url: string) {
  return {
    subject: "Reset your RANEDDIE ID password",
    text: `Hi ${name},\n\nUse this link to choose a new password:\n${url}\n\nThe link expires in 1 hour. If you didn't request a reset, ignore this email.`,
    html: layout("Reset your password", `<p>Hi ${escapeHtml(name)}, use the button below to choose a new password. The link expires in 1 hour.</p>`, { label: "Choose a new password", url }),
  };
}

export function passwordChangedTemplate(name: string) {
  return {
    subject: "Your RANEDDIE ID password was changed",
    text: `Hi ${name},\n\nThe password for your RANEDDIE ID was just changed. If you didn't do this, reset your password immediately and contact support.`,
    html: layout("Password changed", `<p>Hi ${escapeHtml(name)}, the password for your RANEDDIE ID was just changed. If you didn't do this, reset your password immediately and contact support.</p>`),
  };
}

export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
