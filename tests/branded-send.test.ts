import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db, reset } from "./helpers";
import { createContainer } from "@/features/container";
import type { OutgoingMessage } from "@/features/workflows/workflows.dto";
import { zonedToUtc } from "@/lib/time";

const at = (local: string) => zonedToUtc(local, "Asia/Kolkata");
const t0 = at("2026-10-15T08:00");
const sent: OutgoingMessage[] = [];
const send = async (m: OutgoingMessage) => void sent.push(m) as never;
const c = createContainer(db, { manageSecret: "b".repeat(40), appUrl: "https://book.example.com", senders: { email: send, whatsapp: send, webhook: send } });

beforeEach(async () => {
  await reset();
  sent.length = 0;
});
afterEach(async () => {
  await c.settings.update({}, { ...(await c.settings.get()), emailBranded: false, logoUrl: null });
});

async function booked(template: string, branded: boolean, name = "Ravi Kumar") {
  await c.settings.update({}, { ...(await c.settings.get()), name: "Waky Booking", emailBranded: branded });
  const svc = await c.catalog.create({}, { name: "Counselling", durationMin: 60 });
  const staff = await c.staff.create({}, { name: "Dr Meera", email: "meera@firm.test" });
  await c.staff.setServices({}, staff.id, [svc.id]);
  await c.schedules.setWeeklyHours({}, staff.id, [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, startTime: "09:00", endTime: "17:00" })));
  await c.workflows.create({}, { name: "Confirm", trigger: "booked", action: { channel: "email", recipient: "client", subject: "Confirmed", body: template } });
  await c.bookings.create({ mode: "staff" }, { serviceId: svc.id, staffId: staff.id, start: at("2026-10-19T10:00"), client: { name, phone: "98765 43210", email: "ravi@example.com" } }, { now: t0 });
  await c.workflows.processDue({ now: t0 });
  return sent.find((m): m is Extract<OutgoingMessage, { channel: "email" }> => m.channel === "email")!;
}

describe("styled confirmation email", () => {
  it("sends the styled version with its plain-text copy, using the app's logo when the firm set none", async () => {
    const mail = await booked("# Confirmed\n\nHi {{client_name}},\n\n> **When:** {{date}} at {{time}}\n\n[Change it]({{manage_link}})", true);
    expect(mail.html).toContain("https://book.example.com/brand/mindlap-logo.png");
    expect(mail.html).toContain("Waky Booking");
    expect(mail.html).toContain("Monday, 19 October 2026 at 10:00 am");
    expect(mail.body).toContain("Hi Ravi Kumar,");
    expect(mail.body).not.toContain("<");
    expect(mail.html).toMatch(/href="https:\/\/book\.example\.com\/manage\//);
  });

  it("uses the firm's own logo address when one is set", async () => {
    await c.settings.update({}, { ...(await c.settings.get()), logoUrl: "https://cdn.example.com/logo.png" });
    const mail = await booked("Hi", true);
    expect(mail.html).toContain("https://cdn.example.com/logo.png");
    expect(mail.html).not.toContain("mindlap-logo.png");
  });

  it("escapes a client's name in the styled version", async () => {
    const mail = await booked("Hi {{client_name}}", true, "<b>Eve</b>");
    expect(mail.html).toContain("&lt;b&gt;Eve&lt;/b&gt;");
    expect(mail.html).not.toContain("<b>Eve</b>");
  });

  it("sends plain text, as before, when the design is switched off", async () => {
    const mail = await booked("Hi {{client_name}}", false);
    expect(mail.html).toBeUndefined();
    expect(mail.body).toBe("Hi Ravi Kumar");
  });

  it("the sample email uses the firm's confirmation text and made-up details", async () => {
    await c.settings.update({}, { ...(await c.settings.get()), name: "Waky Booking", emailBranded: true });
    await c.workflows.create({}, { name: "Confirm", trigger: "booked", action: { channel: "email", recipient: "client", subject: "x", body: "# Hello {{client_name}}" } });
    await c.mail.sendSample("owner@firm.test");
    const mail = sent[0] as Extract<OutgoingMessage, { channel: "email" }>;
    expect(mail.to).toBe("owner@firm.test");
    expect(mail.subject).toContain("Sample");
    expect(mail.html).toContain("Hello Ravi Kumar");
  });
});
