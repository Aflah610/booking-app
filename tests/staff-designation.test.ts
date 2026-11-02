import { beforeEach, describe, expect, it } from "vitest";
import { c, reset } from "./helpers";

beforeEach(reset);

describe("staff designation", () => {
  it("is optional, and can be set when adding someone and changed later", async () => {
    const plain = await c.staff.create({}, { name: "Ravi", email: "ravi@firm.test" });
    expect(plain.designation).toBeNull();
    const asha = await c.staff.create({}, { name: "Asha", email: "asha@firm.test", designation: "Psychiatrist" });
    expect(asha.designation).toBe("Psychiatrist");
    expect((await c.staff.update({}, asha.id, { designation: "Sales Executive" })).designation).toBe("Sales Executive");
    expect((await c.staff.update({}, asha.id, { designation: null })).designation).toBeNull();
  });

  it("offers Psychiatrist, Psychologist, Nutritionist and Sales Executive, and rejects anything else", async () => {
    for (const designation of ["Psychiatrist", "Psychologist", "Nutritionist", "Sales Executive"] as const) {
      const m = await c.staff.create({}, { name: designation, email: `${designation.replace(" ", "").toLowerCase()}@firm.test`, designation });
      expect(m.designation).toBe(designation);
    }
    // @ts-expect-error not on the list
    await expect(c.staff.create({}, { name: "X", email: "x@firm.test", designation: "Astronaut" })).rejects.toThrow();
  });

  it("is left alone when an update does not mention it", async () => {
    const asha = await c.staff.create({}, { name: "Asha", email: "asha@firm.test", designation: "Nutritionist" });
    expect((await c.staff.update({}, asha.id, { name: "Asha K" })).designation).toBe("Nutritionist");
  });
});

describe("deleting staff", () => {
  it("deletes someone with no history, but refuses anyone a client is assigned to", async () => {
    const test = await c.staff.create({}, { name: "Test", email: "test@firm.test" });
    await c.staff.remove({}, test.id);
    await expect(c.staff.get(test.id)).rejects.toMatchObject({ code: "not_found" });

    const asha = await c.staff.create({}, { name: "Asha", email: "asha@firm.test" });
    const client = await c.clients.create({}, { name: "Ravi", phone: "98765 43210" });
    await c.clients.assignTherapist({}, client.id, { staffId: asha.id });
    await expect(c.staff.remove({}, asha.id)).rejects.toMatchObject({ code: "conflict" });
    expect((await c.staff.get(asha.id)).name).toBe("Asha");
  });

  it("won't let you delete yourself", async () => {
    const me = await c.staff.create({}, { name: "Me", email: "me@firm.test" });
    await expect(c.staff.remove({ staffId: me.id }, me.id)).rejects.toMatchObject({ code: "invalid" });
  });
});
