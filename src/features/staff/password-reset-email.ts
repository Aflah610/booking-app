import { renderBrandedEmail } from "@/features/workflows/email-design";
import type { TemplateVars } from "@/features/workflows/templates";

/** The "choose a new password" message. The link carries the one-time token, so nothing secret is in the subject or the preview. */
export function passwordResetEmail(opts: { name: string; link: string; firmName: string; logoUrl: string | null }) {
  const first = opts.name.includes("@") ? opts.name.split("@")[0] : opts.name.trim().split(/\s+/)[0];
  const template = [
    "# Reset your password",
    `Hi ${first},`,
    "We got a request to choose a new password for your account. The link below works once and for the next hour.",
    `[Choose a new password](${opts.link})`,
    "If you did not ask for this, ignore this email. Your password stays the same.",
  ].join("\n\n");
  const subject = `Reset your ${opts.firmName} password`;
  const { html, text } = renderBrandedEmail({
    template,
    vars: {} as TemplateVars,
    subject,
    firmName: opts.firmName,
    logoUrl: opts.logoUrl,
    reason: "You received this email because a password reset was requested for your account.",
  });
  return { subject, html, text };
}
