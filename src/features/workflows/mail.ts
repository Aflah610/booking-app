import { z } from "zod";
import { DomainError } from "@/features/shared/errors";
import { renderBrandedEmail, SAMPLE_VARS } from "./email-design";
import { NotConfigured, type Sender } from "./workflows.dto";

type Env = Record<string, string | undefined>;

/** What the app knows about its one sending mailbox, with no secrets: which settings are missing and where mail comes from. */
export function mailStatus(env: Env = process.env) {
  const need = ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "EMAIL_FROM"] as const;
  const missing = need.filter((k) => !env[k]);
  return {
    // Sending needs at least a host and an address to send from; most providers also need the login.
    configured: Boolean(env.SMTP_HOST && env.EMAIL_FROM),
    missing,
    from: env.EMAIL_FROM || null,
    host: env.SMTP_HOST || null,
    replyTo: env.EMAIL_REPLY_TO || null,
  };
}

const address = z.string().trim().toLowerCase().email().max(200);

/** Sends one plain message through the same mailbox as every notification, so staff can see that it works. */
export async function sendTestEmail(sendEmail: Sender, to: string, firmName: string): Promise<void> {
  const parsed = address.safeParse(to);
  if (!parsed.success) throw new DomainError("invalid", "Enter a valid email address to send the test to");
  try {
    await sendEmail({
      channel: "email",
      to: parsed.data,
      subject: `Test email from ${firmName}`,
      body: `This is a test from ${firmName}. If you can read it, booking emails will reach people the same way.`,
    });
  } catch (err) {
    if (err instanceof NotConfigured) throw new DomainError("invalid", err.message);
    // The mail server's own words (for example "Invalid login") tell the admin what to fix.
    throw new DomainError("invalid", `The email could not be sent: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** Sends the branded design with made-up details, so the look can be checked in a real inbox before any client sees it. */
export async function sendSampleEmail(sendEmail: Sender, to: string, firm: { name: string; logoUrl: string | null }, template: string): Promise<void> {
  const parsed = address.safeParse(to);
  if (!parsed.success) throw new DomainError("invalid", "Enter a valid email address to send the sample to");
  const subject = `Sample: your session is confirmed`;
  const out = renderBrandedEmail({ template, vars: { ...SAMPLE_VARS, firm_name: firm.name }, subject, firmName: firm.name, logoUrl: firm.logoUrl });
  try {
    await sendEmail({ channel: "email", to: parsed.data, subject, body: out.text, html: out.html });
  } catch (err) {
    if (err instanceof NotConfigured) throw new DomainError("invalid", err.message);
    throw new DomainError("invalid", `The email could not be sent: ${err instanceof Error ? err.message : String(err)}`);
  }
}
