import { beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { createContainer } from "@/features/container";
import type { OutgoingMessage } from "@/features/workflows/workflows.dto";
import { db, reset } from "./helpers";

const sent: OutgoingMessage[] = [];
const c = createContainer(db, {
  appUrl: "https://app.example.com",
  senders: { email: async (m) => void sent.push(m) as never, whatsapp: async () => ({}), webhook: async () => ({}) },
});

beforeEach(async () => {
  await reset();
  sent.length = 0;
});

/** The one-time token from the link in the last email sent. */
const tokenSent = () => {
  const m = sent.at(-1);
  const match = m && "body" in m ? /reset-password\?token=([\w-]+)/.exec(m.body) : null;
  return match?.[1];
};

describe("forgot password", () => {
  it("emails a link to a staff member, and the link sets a new password that then works", async () => {
    const asha = await c.staff.create({}, { name: "Asha", email: "asha@firm.test" });
    await c.staff.setPassword({}, asha.id, "old password 1");
    await c.staff.requestPasswordReset("ASHA@firm.test");
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ channel: "email", to: "asha@firm.test" });
    const token = tokenSent();
    expect(token).toBeTruthy();
    await c.staff.resetPassword(token!, "new password 2");
    expect(await c.staff.verifyPassword("asha@firm.test", "old password 1")).toBeNull();
    expect((await c.staff.verifyPassword("asha@firm.test", "new password 2"))?.id).toBe(asha.id);
  });

  it("sends nothing, and says nothing, for an unknown address or a deactivated person", async () => {
    const asha = await c.staff.create({}, { name: "Asha", email: "asha@firm.test" });
    await c.staff.update({}, asha.id, { active: false });
    await expect(c.staff.requestPasswordReset("nobody@firm.test")).resolves.toBeUndefined();
    await expect(c.staff.requestPasswordReset("asha@firm.test")).resolves.toBeUndefined();
    expect(sent).toHaveLength(0);
  });

  it("works only once", async () => {
    await c.staff.create({}, { name: "Asha", email: "asha@firm.test" });
    await c.staff.requestPasswordReset("asha@firm.test");
    const token = tokenSent()!;
    await c.staff.resetPassword(token, "new password 2");
    await expect(c.staff.resetPassword(token, "another one 3")).rejects.toMatchObject({ code: "invalid" });
  });

  it("stops working after an hour", async () => {
    await c.staff.create({}, { name: "Asha", email: "asha@firm.test" });
    await c.staff.requestPasswordReset("asha@firm.test");
    await db.execute(sql`update staff set reset_expires_at = now() - interval '1 minute'`);
    await expect(c.staff.resetPassword(tokenSent()!, "new password 2")).rejects.toMatchObject({ code: "invalid" });
  });

  it("rejects a made-up token and a password that is too short, and keeps the link usable after a short one", async () => {
    await c.staff.create({}, { name: "Asha", email: "asha@firm.test" });
    await c.staff.requestPasswordReset("asha@firm.test");
    await expect(c.staff.resetPassword("not-a-real-token", "new password 2")).rejects.toMatchObject({ code: "invalid" });
    await expect(c.staff.resetPassword(tokenSent()!, "short")).rejects.toMatchObject({ code: "invalid" });
    await expect(c.staff.resetPassword(tokenSent()!, "long enough 3")).resolves.toBeUndefined();
  });

  it("sends at most one link a minute per person, and a newer link replaces the older one", async () => {
    await c.staff.create({}, { name: "Asha", email: "asha@firm.test" });
    await c.staff.requestPasswordReset("asha@firm.test");
    await c.staff.requestPasswordReset("asha@firm.test");
    expect(sent).toHaveLength(1);
    const first = tokenSent()!;
    await db.execute(sql`update staff set reset_expires_at = now() + interval '50 minutes'`);
    await c.staff.requestPasswordReset("asha@firm.test");
    expect(sent).toHaveLength(2);
    await expect(c.staff.resetPassword(first, "new password 2")).rejects.toMatchObject({ code: "invalid" });
    await expect(c.staff.resetPassword(tokenSent()!, "new password 2")).resolves.toBeUndefined();
  });

  it("keeps only a hash of the token and records the reset in the audit log without it", async () => {
    await c.staff.create({}, { name: "Asha", email: "asha@firm.test" });
    await c.staff.requestPasswordReset("asha@firm.test");
    const token = tokenSent()!;
    const row = await db.execute(sql`select reset_token_hash from staff`);
    expect(String(row.rows[0].reset_token_hash)).not.toContain(token);
    await c.staff.resetPassword(token, "new password 2");
    const log = await db.execute(sql`select entity_id, details from audit_log where action = 'reset_password'`);
    expect(log.rows).toHaveLength(1);
    expect(JSON.stringify(log.rows)).not.toContain(token);
    expect(JSON.stringify(log.rows)).not.toContain("new password 2");
  });

  it("still answers quietly when the email cannot be sent", async () => {
    const broken = createContainer(db, { senders: { email: async () => { throw new Error("SMTP down"); }, whatsapp: async () => ({}), webhook: async () => ({}) } });
    await broken.staff.create({}, { name: "Asha", email: "asha@firm.test" });
    await expect(broken.staff.requestPasswordReset("asha@firm.test")).resolves.toBeUndefined();
  });
});
