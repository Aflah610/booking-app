import { beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { c, db, reset } from "./helpers";

beforeEach(reset);

const secret = "correct horse battery";

describe("staff password sign-in", () => {
  it("lets an active staff member in with the right password, in any email case", async () => {
    const asha = await c.staff.create({}, { name: "Asha", email: "asha@firm.test" });
    await c.staff.setPassword({}, asha.id, secret);
    expect((await c.staff.verifyPassword("Asha@Firm.test", secret))?.id).toBe(asha.id);
  });

  it("rejects a wrong password, an unknown email and a person with no password", async () => {
    const asha = await c.staff.create({}, { name: "Asha", email: "asha@firm.test" });
    await c.staff.create({}, { name: "Ravi", email: "ravi@firm.test" });
    await c.staff.setPassword({}, asha.id, secret);
    expect(await c.staff.verifyPassword("asha@firm.test", "wrong password")).toBeNull();
    expect(await c.staff.verifyPassword("nobody@firm.test", secret)).toBeNull();
    expect(await c.staff.verifyPassword("ravi@firm.test", secret)).toBeNull();
  });

  it("rejects a deactivated staff member even with the right password", async () => {
    const asha = await c.staff.create({}, { name: "Asha", email: "asha@firm.test" });
    await c.staff.setPassword({}, asha.id, secret);
    await c.staff.update({}, asha.id, { active: false });
    expect(await c.staff.verifyPassword("asha@firm.test", secret)).toBeNull();
  });

  it("refuses a password that is too short", async () => {
    const asha = await c.staff.create({}, { name: "Asha", email: "asha@firm.test" });
    await expect(c.staff.setPassword({}, asha.id, "short")).rejects.toMatchObject({ code: "invalid" });
  });

  it("refuses to set a password for staff that do not exist", async () => {
    await expect(c.staff.setPassword({}, "00000000-0000-4000-8000-000000000000", secret)).rejects.toMatchObject({ code: "not_found" });
  });

  it("stores only a hash and records the change in the audit log without the password", async () => {
    const asha = await c.staff.create({}, { name: "Asha", email: "asha@firm.test" });
    await c.staff.setPassword({}, asha.id, secret);
    const stored = await db.execute(sql`select password_hash from staff where id = ${asha.id}`);
    expect(String(stored.rows[0].password_hash)).toMatch(/^scrypt\$/);
    expect(String(stored.rows[0].password_hash)).not.toContain(secret);
    const log = await db.execute(sql`select details from audit_log where action = 'set_password'`);
    expect(log.rows).toHaveLength(1);
    expect(JSON.stringify(log.rows)).not.toContain(secret);
  });
});
