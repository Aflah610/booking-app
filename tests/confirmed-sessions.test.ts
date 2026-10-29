import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { BookingActor } from "@/features/bookings/bookings.service";
import { isConfirmedSession } from "@/features/bookings/bookings.dto";
import { zonedToUtc } from "@/lib/time";
import { c, db, reset } from "./helpers";

beforeEach(reset);

const at = (local: string) => zonedToUtc(local, "Asia/Kolkata");
const desk: BookingActor = { mode: "staff" };
const everyDay = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, startTime: "09:00", endTime: "17:00" }));

describe("psychologists see only confirmed sessions", () => {
  it("leaves out unpaid and failed online attempts and released slots, keeps paid and desk bookings", async () => {
    const therapy = await c.catalog.create({}, { name: "Therapy", durationMin: 60 });
    const asha = await c.staff.create({}, { name: "Asha", email: "asha@firm.test", designation: "Psychologist" });
    await c.staff.setServices({}, asha.id, [therapy.id]);
    await c.schedules.setWeeklyHours({}, asha.id, everyDay);
    const now = at("2026-08-25T09:00");
    const book = async (start: string, phone: string) =>
      (await c.bookings.create(desk, { serviceId: therapy.id, staffId: asha.id, start: at(start), client: { name: "Ravi", phone }, useCredits: false }, { now })).booking;
    const [deskPending, paid, webPending, failed, released] = [
      await book("2026-09-01T10:00", "98765 43210"),
      await book("2026-09-01T11:00", "98765 43211"),
      await book("2026-09-01T12:00", "98765 43212"),
      await book("2026-09-01T13:00", "98765 43213"),
      await book("2026-09-01T14:00", "98765 43214"),
    ];
    const set = (id: string, fields: ReturnType<typeof sql>) => db.execute(sql`update booking set ${fields} where id = ${id}`);
    await set(deskPending.id, sql`payment_status = 'pending', source = 'staff'`);
    await set(paid.id, sql`payment_status = 'paid', source = 'web'`);
    await set(webPending.id, sql`payment_status = 'pending', source = 'web'`);
    await set(failed.id, sql`payment_status = 'failed', source = 'web'`);
    await set(released.id, sql`payment_status = 'paid', source = 'web', slot_released = true`);

    const all = await c.bookings.list({ view: "all", staffId: asha.id, limit: 50 });
    const shown = await c.bookings.list({ view: "all", staffId: asha.id, limit: 50, confirmedOnly: true });
    expect(all).toHaveLength(5);
    expect(shown.map((b) => b.id).sort()).toEqual([deskPending.id, paid.id].sort());
    expect(all.filter(isConfirmedSession).map((b) => b.id).sort()).toEqual([deskPending.id, paid.id].sort());
  });
});
