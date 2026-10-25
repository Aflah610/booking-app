import { beforeEach, describe, expect, it, vi } from "vitest";
import { zonedToUtc } from "@/lib/time";
import { c, reset } from "./helpers";

// Server actions read the signed-in person from the session and finish with a redirect; both are stood in for here.
let signedIn: string | null = null;
vi.mock("@/auth", () => ({ auth: async () => (signedIn ? { user: { staffId: signedIn } } : null) }));
vi.mock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), cache: <T,>(fn: T) => fn }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => { throw Object.assign(new Error(`REDIRECT ${url}`), { url }); },
  notFound: () => { throw new Error("NOT_FOUND"); },
}));

const { updateStaffAction } = await import("@/app/admin/actions");
const { cancelBookingAction, setPaymentAction, markBookingAction } = await import("@/app/admin/bookings/actions");

/** Runs an action as `staffId` and returns where it redirected to. */
async function as(staffId: string, run: () => Promise<unknown>): Promise<string> {
  signedIn = staffId;
  try {
    await run();
    return "no redirect";
  } catch (err) {
    const url = (err as { url?: string }).url;
    if (!url) throw err;
    return decodeURIComponent(url.replace(/\+/g, " "));
  }
}

const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

beforeEach(async () => {
  signedIn = null;
  await reset();
});

describe("S1: only admins change an admin", () => {
  it("refuses a manager changing an admin's email or switching them off, and leaves the admin unchanged", async () => {
    const admin = await c.staff.create({}, { name: "Owner", email: "owner@firm.test", accessRole: "admin" });
    const manager = await c.staff.create({}, { name: "Mona", email: "mona@firm.test", accessRole: "manager" });
    const takeover = form({ name: "Owner", email: "attacker@firm.test", accessRole: "admin", active: "on", timezone: "Asia/Kolkata" });
    expect(await as(manager.id, () => updateStaffAction(admin.id, takeover))).toMatch(/error=Only admins can change an admin's details/);
    expect(await as(manager.id, () => updateStaffAction(admin.id, form({ name: "Owner", email: "owner@firm.test", accessRole: "admin" })))).toMatch(/error=/);
    expect(await c.staff.get(admin.id)).toMatchObject({ email: "owner@firm.test", active: true });
    // The service refuses too, so no other screen can get round it.
    await expect(c.staff.update({ staffId: manager.id }, admin.id, { email: "x@firm.test" })).rejects.toMatchObject({ code: "forbidden" });
    await expect(c.staff.setPassword({ staffId: manager.id }, admin.id, "longenough1")).rejects.toMatchObject({ code: "forbidden" });
  });

  it("still lets a manager edit ordinary staff, and an admin edit another admin", async () => {
    const admin = await c.staff.create({}, { name: "Owner", email: "owner@firm.test", accessRole: "admin" });
    const second = await c.staff.create({}, { name: "Partner", email: "partner@firm.test", accessRole: "admin" });
    const manager = await c.staff.create({}, { name: "Mona", email: "mona@firm.test", accessRole: "manager" });
    const psych = await c.staff.create({}, { name: "Asha", email: "asha@firm.test", designation: "Psychologist" });
    expect(await as(manager.id, () => updateStaffAction(psych.id, form({ name: "Asha K", email: "asha@firm.test", accessRole: "psychologist", active: "on", timezone: "Asia/Kolkata" })))).toMatch(/ok=Saved/);
    expect((await c.staff.get(psych.id)).name).toBe("Asha K");
    await c.staff.update({ staffId: admin.id }, second.id, { name: "Partner Two" });
    expect((await c.staff.get(second.id)).name).toBe("Partner Two");
  });
});

describe("S2: only the booking role moves, cancels or takes payment", () => {
  async function bookingFor() {
    const therapy = await c.catalog.create({}, { name: "Therapy", durationMin: 60 });
    const psych = await c.staff.create({}, { name: "Asha", email: "asha@firm.test", designation: "Psychologist" });
    await c.staff.setServices({}, psych.id, [therapy.id]);
    await c.schedules.setWeeklyHours({}, psych.id, [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, startTime: "09:00", endTime: "17:00" })));
    const { booking } = await c.bookings.create({ mode: "staff" }, {
      serviceId: therapy.id, staffId: psych.id, start: zonedToUtc("2026-11-16T10:00", "Asia/Kolkata"), client: { name: "Ravi", phone: "98765 43210" },
    }, { now: zonedToUtc("2026-10-26T09:00", "Asia/Kolkata") });
    return { psych, booking };
  }

  it("refuses the session's psychologist and a manager, but lets the coordinator cancel", async () => {
    const { psych, booking } = await bookingFor();
    const manager = await c.staff.create({}, { name: "Mona", email: "mona@firm.test", accessRole: "manager" });
    const ccd = await c.staff.create({}, { name: "Avanthika", email: "ccd@firm.test", designation: "Consultation Coordinator" });
    expect(await as(psych.id, () => cancelBookingAction(booking.id, form({ reason: "x" })))).toMatch(/error=Only the coordinators/);
    expect(await as(manager.id, () => setPaymentAction(booking.id, "paid"))).toMatch(/error=Only the coordinators/);
    expect((await c.bookings.get(booking.id)).status).toBe("upcoming");
    expect((await c.bookings.get(booking.id)).paymentStatus).not.toBe("paid");
    expect(await as(ccd.id, () => cancelBookingAction(booking.id, form({ reason: "Client asked" })))).toMatch(/ok=Booking cancelled/);
    expect((await c.bookings.get(booking.id)).status).toBe("cancelled");
  });

  it("still lets the psychologist mark their own session's attendance", async () => {
    const { psych, booking } = await bookingFor();
    const result = await as(psych.id, () => markBookingAction(booking.id, "no_show", form({ by: "client" })));
    expect(result).not.toMatch(/Only the coordinators/);
  });
});


describe("S5: client search requires contact and client-list permission", () => {
  it("rejects diary-only and contact-revoked viewers, including phone/email matching", async () => {
    const admin = await c.staff.create({}, { name: "Owner", email: "owner@firm.test", accessRole: "admin" });
    const manager = await c.staff.create({}, { name: "Mona", email: "mona@firm.test", accessRole: "manager" });
    const { GET } = await import("@/app/api/admin/clients/search/route");
    await c.access.setRole({ staffId: admin.id, accessRole: "admin" }, "manager", ["bookings.all", "clients.view"]);
    signedIn = manager.id;
    for (const q of ["Ravi", "98765", "@example.com"]) {
      const r = await GET(new Request(`https://example.invalid/api/admin/clients/search?q=${q}`));
      expect(r.status).toBe(403);
      expect(await r.json()).not.toHaveProperty("data");
    }
    await c.access.setRole({ staffId: admin.id, accessRole: "admin" }, "manager", ["bookings.all", "clients.contact"]);
    expect((await GET(new Request("https://example.invalid/api/admin/clients/search?q=Ravi"))).status).toBe(403);
    await c.access.setRole({ staffId: admin.id, accessRole: "admin" }, "manager", ["clients.view", "clients.contact"]);
    expect((await GET(new Request("https://example.invalid/api/admin/clients/search?q=Ravi"))).status).toBe(200);
    signedIn = null;
    expect((await GET(new Request("https://example.invalid/api/admin/clients/search?q=Ravi"))).status).toBe(401);
  });
});
