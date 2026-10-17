import { describe, expect, it } from "vitest";
import { mailStatus, sendTestEmail } from "@/features/workflows/mail";
import { smtpPassword } from "@/features/workflows/senders";
import { NotConfigured, type OutgoingMessage } from "@/features/workflows/workflows.dto";

describe("mail status", () => {
  it("says what is missing without showing any secret", () => {
    expect(mailStatus({})).toMatchObject({ configured: false, missing: ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "EMAIL_FROM"], from: null });
    const some = mailStatus({ SMTP_HOST: "smtp.zoho.in", EMAIL_FROM: "Firm <b@firm.com>", EMAIL_REPLY_TO: "desk@firm.com" });
    expect(some).toMatchObject({ configured: true, missing: ["SMTP_USER", "SMTP_PASS"], from: "Firm <b@firm.com>", host: "smtp.zoho.in", replyTo: "desk@firm.com" });
    expect(JSON.stringify(mailStatus({ SMTP_HOST: "h", SMTP_USER: "u", SMTP_PASS: "supersecret", EMAIL_FROM: "f@x.com" }))).not.toContain("supersecret");
  });
});

describe("test email", () => {
  it("sends one plain message through the same sender every notification uses", async () => {
    const sent: OutgoingMessage[] = [];
    await sendTestEmail(async (m) => void sent.push(m) as never, " Ameen@Firm.com ", "Waky Booking");
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ channel: "email", to: "ameen@firm.com", subject: "Test email from Waky Booking" });
  });

  it("refuses a bad address before sending anything", async () => {
    let called = false;
    await expect(sendTestEmail(async () => void (called = true) as never, "not-an-email", "Firm")).rejects.toMatchObject({ code: "invalid" });
    expect(called).toBe(false);
  });

  it("explains when email is not set up, and passes on the mail server's own words when it refuses", async () => {
    await expect(sendTestEmail(async () => { throw new NotConfigured("Email isn't set up yet. Set SMTP_HOST."); }, "a@b.com", "Firm")).rejects.toMatchObject({ code: "invalid", message: "Email isn't set up yet. Set SMTP_HOST." });
    await expect(sendTestEmail(async () => { throw new Error("Invalid login: 535 Authentication failed"); }, "a@b.com", "Firm")).rejects.toThrow("The email could not be sent: Invalid login: 535 Authentication failed");
  });
});

describe("SMTP password", () => {
  it("drops the spaces Google shows in an app password, for Google's servers only", () => {
    expect(smtpPassword({ SMTP_HOST: "smtp.gmail.com", SMTP_PASS: "abcd efgh ijkl mnop" })).toBe("abcdefghijklmnop");
    expect(smtpPassword({ SMTP_HOST: "smtp.gmail.com", SMTP_PASS: "abcdefghijklmnop" })).toBe("abcdefghijklmnop");
    expect(smtpPassword({ SMTP_HOST: "smtp.zoho.in", SMTP_PASS: "keep my spaces" })).toBe("keep my spaces");
    expect(smtpPassword({ SMTP_HOST: "smtp.gmail.com" })).toBeUndefined();
  });
});
