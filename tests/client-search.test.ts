import { beforeEach, describe, expect, it } from "vitest";
import { c, reset } from "./helpers";

beforeEach(reset);

let n = 0;
const add = (name: string, phone: string, email?: string) =>
  c.packages.topUpFromPayment({}, { client: { name, phone, email, whatsappOptIn: false }, amountPaise: 10000, razorpayPaymentId: `pay_search_${++n}` });
const found = async (q: string) => (await c.clients.list({ q, limit: 8 })).map((x) => x.name).sort();

describe("finding an existing client", () => {
  it("matches by part of the name or email, ignoring capitals", async () => {
    await add("Ravi Kumar", "98765 43210", "ravi@example.com");
    await add("Meena Rao", "99999 11111");
    expect(await found("rav")).toEqual(["Ravi Kumar"]);
    expect(await found("RAO")).toEqual(["Meena Rao"]);
    expect(await found("example.com")).toEqual(["Ravi Kumar"]);
    expect(await found("nobody")).toEqual([]);
  });

  it("matches a phone number however it is typed", async () => {
    await add("Ravi Kumar", "98765 43210");
    await add("Meena Rao", "99999 11111");
    expect(await found("98765 43210")).toEqual(["Ravi Kumar"]);
    expect(await found("+91 98765")).toEqual(["Ravi Kumar"]);
    expect(await found("9876543210")).toEqual(["Ravi Kumar"]);
    expect(await found("11111")).toEqual(["Meena Rao"]);
  });

  it("gives at most the number asked for, and counts each client's bookings", async () => {
    for (let i = 0; i < 10; i++) await add(`Client ${i}`, `9000000000${i}`);
    expect((await c.clients.list({ q: "Client", limit: 8 })).length).toBe(8);
    expect((await c.clients.list({ q: "Client 3", limit: 8 }))[0]).toMatchObject({ name: "Client 3", bookings: 0 });
  });

  it("counts the bookings each client really has", async () => {
    const svc = await c.catalog.create({}, { name: "Consult", durationMin: 30 });
    const staff = await c.staff.create({}, { name: "Asha", email: "asha@firm.test" });
    await c.staff.setServices({}, staff.id, [svc.id]);
    await c.schedules.setWeeklyHours({}, staff.id, [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, startTime: "09:00", endTime: "17:00" })));
    const now = new Date("2026-10-15T02:30:00Z");
    for (const day of ["19", "20"]) {
      await c.bookings.create({ mode: "staff" }, { serviceId: svc.id, staffId: staff.id, start: new Date(`2026-10-${day}T05:00:00Z`), client: { name: "Ravi Kumar", phone: "98765 43210" } }, { now });
    }
    await add("Meena Rao", "99999 11111");
    const byName = Object.fromEntries((await c.clients.list({ q: "", limit: 10 })).map((x) => [x.name, x.bookings]));
    expect(byName).toMatchObject({ "Ravi Kumar": 2, "Meena Rao": 0 });
  });

  it("does not treat % or _ typed by the person as wildcards", async () => {
    await add("Ravi Kumar", "98765 43210");
    expect(await found("%")).toEqual([]);
    expect(await found("R_vi")).toEqual([]);
  });
});
