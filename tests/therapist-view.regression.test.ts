import React, { type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { can, DEFAULT_PERMISSIONS } from "@/features/access/permissions";
import type { Me } from "@/lib/session";
import type { Container } from "@/features/container";
import { sql } from "drizzle-orm";
import { c, db, reset } from "./helpers";

const runtime = vi.hoisted(() => ({ me: null as Me | null, container: null as Container | null }));
vi.mock("@/features/container", async (original) => ({ ...await original<typeof import("@/features/container")>(), app: () => runtime.container }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/auth", () => ({ signOut: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/", redirect: (url: string) => { throw new Error(`redirect:${url}`); }, notFound: () => { throw new Error("not-found"); } }));
vi.mock("@/components/ColumnsManager", () => ({ ColumnsManager: () => null }));
vi.mock("@/components/PrintButton", () => ({ PrintButton: () => null }));
vi.mock("@/lib/session", () => ({
  allowed: can,
  isFrontDesk: (me: Me) => can(me, "bookings.all"),
  currentStaff: async () => runtime.me,
  requireStaff: async () => runtime.me,
  hasRole: (me: Me, min: "staff" | "manager" | "admin") => ({staff:0,manager:1,admin:2}[me.role] >= {staff:0,manager:1,admin:2}[min]),
  requirePermission: async (...permissions: Parameters<typeof can>[1][]) => {
    if (!runtime.me || !permissions.some((p) => can(runtime.me!, p))) throw new Error("redirect:forbidden");
    return runtime.me;
  },
}));

const now = new Date("2026-11-02T02:30:00Z");
const html = (element: ReactNode) => renderToStaticMarkup(element);
beforeEach(async () => { await reset(); runtime.container = c; vi.stubGlobal("React", React); vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(now); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function setup() {
  const own = await c.staff.create({}, { name: "Own Therapist", email: "own@firm.test", designation: "Psychologist" });
  const other = await c.staff.create({}, { name: "Private Other Therapist", email: "other@firm.test", designation: "Psychologist" });
  const svc = await c.catalog.create({}, { name: "Therapy", durationMin: 60 });
  for (const member of [own, other]) {
    await c.staff.setServices({}, member.id, [svc.id]);
    await c.schedules.setWeeklyHours({}, member.id, [0,1,2,3,4,5,6].map((weekday) => ({ weekday, startTime: "09:00", endTime: "20:00" })));
  }
  const book = async (staffId: string, hour: string, name: string, phone: string) => (await c.bookings.create({ mode: "staff" }, {
    serviceId: svc.id, staffId, start: `2026-11-02T${hour}:00+05:30`, client: { name, phone, email: "hidden-inbox@example.test" }, useCredits: false,
  }, { now })).booking;
  const mine = await book(own.id, "10:00", "Shared Client", "9812345678");
  const sharedOther = await book(other.id, "12:00", "Shared Client", "9812345678");
  const privateOther = await book(other.id, "15:00", "Private Other Client", "9812345679");
  await c.clients.assignTherapist({}, mine.clientId, { staffId: own.id });
  await c.bookings.setMeeting({}, sharedOther.id, { action: "manual", url: "https://meet.google.com/aaa-bbbb-ccc" });
  runtime.me = { ...own, permissions: new Set(DEFAULT_PERMISSIONS.psychologist) };
  return { own, other, mine, sharedOther, privateOther, book };
}

describe("therapist pages keep work and contacts scoped", () => {
  it("does not query or display practice-wide totals on Today", async () => {
    const { own } = await setup();
    const list = vi.spyOn(c.bookings, "list");
    const { default: Home } = await import("@/app/page");
    const page = await Home({ searchParams: Promise.resolve({}) });
    const markup = html((page as ReactElement<{ children: ReactNode }>).props.children);
    expect(markup).toContain("My bookings today");
    expect(markup).not.toContain("Firm bookings today");
    expect(markup).not.toContain("Private Other Client");
    expect(list.mock.calls.every(([f]) => f?.staffId === own.id)).toBe(true);
  });

  it("ignores another staff id in bookings and calendar filters without listing other staff", async () => {
    const { other, mine } = await setup();
    await db.execute(sql`update booking set payment_status = 'paid' where id = ${mine.id}`);
    const { default: Bookings } = await import("@/app/admin/bookings/page");
    const { default: Calendar } = await import("@/app/admin/calendar/page");
    for (const page of [await Bookings({ searchParams: Promise.resolve({ staff: other.id }) }), await Calendar({ searchParams: Promise.resolve({ staff: other.id }) })]) {
      const markup = html(page);
      expect(markup).toContain("Shared Client");
      expect(markup).not.toContain("Private Other Client");
      expect(markup).not.toContain("Private Other Therapist");
      expect(markup).not.toContain("Everyone");
      expect(markup).not.toContain("9812345678");
    }
  });

  it("hides another therapist's session and join link on a shared client's booking history", async () => {
    const { mine, sharedOther } = await setup();
    const { default: Client } = await import("@/app/admin/clients/[id]/page");
    const markup = html(await Client({ params: Promise.resolve({ id: mine.clientId }), searchParams: Promise.resolve({ tab: "bookings" }) }));
    expect(markup).toContain(`/admin/bookings/${mine.id}`);
    expect(markup).not.toContain(`/admin/bookings/${sharedOther.id}`);
    expect(markup).not.toContain("https://meet.google.com/aaa-bbbb-ccc");
    expect(markup).not.toContain("?tab=credits");
    const direct = html(await Client({ params: Promise.resolve({ id: mine.clientId }), searchParams: Promise.resolve({ tab: "credits" }) }));
    expect(direct).not.toContain("Sell a package");
    expect(direct).not.toContain("Add wallet money");
  });

  it("refuses direct booking, client, staff and report links belonging to another therapist", async () => {
    const { other, privateOther } = await setup();
    const { default: Booking } = await import("@/app/admin/bookings/[id]/page");
    const { default: Client } = await import("@/app/admin/clients/[id]/page");
    const { default: Staff } = await import("@/app/admin/staff/[id]/page");
    const { default: Report } = await import("@/app/admin/reports/therapists/[id]/page");
    await expect(Booking({ params: Promise.resolve({ id: privateOther.id }), searchParams: Promise.resolve({}) })).rejects.toThrow("not-found");
    await expect(Client({ params: Promise.resolve({ id: privateOther.clientId }), searchParams: Promise.resolve({}) })).rejects.toThrow("redirect:");
    await expect(Staff({ params: Promise.resolve({ id: other.id }), searchParams: Promise.resolve({}) })).rejects.toThrow("redirect:");
    await expect(Report({ params: Promise.resolve({ id: other.id }), searchParams: Promise.resolve({}) })).rejects.toThrow("redirect:");
    const { updateBookingNotesAction, recordPaymentAction } = await import("@/app/admin/bookings/actions");
    const { setHoursAction, updateStaffAction } = await import("@/app/admin/actions");
    await expect(updateBookingNotesAction(privateOther.id, new FormData())).rejects.toThrow("own diary");
    await expect(setHoursAction(other.id, new FormData())).rejects.toThrow("redirect:");
    await expect(updateStaffAction(other.id, new FormData())).rejects.toThrow("redirect:");
    const ownBooking = (await c.bookings.list({ view: "all", staffId: runtime.me!.id }))[0];
    await expect(recordPaymentAction(ownBooking.id, new FormData())).rejects.toThrow("redirect:");
  });

  it("does not expose hidden phone numbers in own performance pages or CSV, or allow another therapist's CSV", async () => {
    const { own, other } = await setup();
    const { default: Report } = await import("@/app/admin/reports/therapists/[id]/page");
    const { GET } = await import("@/app/admin/export/therapist/[id]/route");
    const markup = html(await Report({ params: Promise.resolve({ id: own.id }), searchParams: Promise.resolve({}) }));
    expect(markup).toContain("Shared Client");
    expect(markup).not.toContain("9812345678");
    expect(markup).not.toContain("All therapists");
    const response = await GET(new Request("https://example.test/admin/export/therapist/own"), { params: Promise.resolve({ id: own.id }) });
    const csv = await response.text();
    expect(csv).toContain("Shared Client");
    expect(csv).not.toContain("9812345678");
    expect((await GET(new Request("https://example.test/admin/export/therapist/other"), { params: Promise.resolve({ id: other.id }) })).status).toBe(403);
  });

  it("searches only names and client IDs without contact permission, and counts only own bookings", async () => {
    const { own, mine } = await setup();
    const f = { treatedBy: own.id, searchContact: false };
    const ownRows = await c.clients.directory({ ...f, q: "Shared Client" });
    expect(ownRows.map((r) => [r.id, r.bookings])).toEqual([[mine.clientId, 1]]);
    expect(await c.clients.directory({ ...f, q: "9812345678" })).toEqual([]);
    expect(await c.clients.directory({ ...f, q: "hidden-inbox" })).toEqual([]);
    expect(await c.clients.directory({ ...f, q: "Private Other Client" })).toEqual([]);
    expect((await c.clients.directory({ q: "9812345678" })).map((r) => r.bookings)).toEqual([2]);
    const { default: Clients } = await import("@/app/admin/clients/page");
    expect(html(await Clients({ searchParams: Promise.resolve({ q: "9812345678" }) }))).not.toContain("Shared Client");
  });

  it("retains practice-wide views and contact downloads for an admin", async () => {
    const { mine } = await setup();
    const admin = await c.staff.create({}, { name: "Admin", email: "admin@firm.test", role: "admin" });
    runtime.me = { ...admin, permissions: new Set(DEFAULT_PERMISSIONS.admin) };
    const { default: Home } = await import("@/app/page");
    const page = await Home({ searchParams: Promise.resolve({}) });
    expect(html((page as ReactElement<{ children: ReactNode }>).props.children)).toContain("Firm bookings today");
    const { default: Bookings } = await import("@/app/admin/bookings/page");
    expect(html(await Bookings({ searchParams: Promise.resolve({}) }))).toContain("Private Other Client");
    const { default: Client } = await import("@/app/admin/clients/[id]/page");
    const markup = html(await Client({ params: Promise.resolve({ id: mine.clientId }), searchParams: Promise.resolve({ tab: "bookings" }) }));
    expect(markup).toContain("https://meet.google.com/aaa-bbbb-ccc");
    expect(markup).toContain("?tab=credits");
    const { GET } = await import("@/app/admin/export/therapist/[id]/route");
    const response = await GET(new Request("https://example.test/download"), { params: Promise.resolve({ id: mine.staffId }) });
    expect(await response.text()).toContain("9812345678");
  });


  it("removes availability from psychologists' menu and blocks their own schedule page and every save action", async () => {
    const { own } = await setup();
    const { Shell } = await import("@/components/Shell");
    expect(html(await Shell({ me: runtime.me!, children: null }))).not.toContain('href="/admin/availability"');
    const { default: Picker } = await import("@/app/admin/availability/page");
    const { default: Staff } = await import("@/app/admin/staff/[id]/page");
    await expect(Picker()).rejects.toThrow("redirect:");
    await expect(Staff({ params: Promise.resolve({ id: own.id }), searchParams: Promise.resolve({}) })).rejects.toThrow("redirect:");
    const a = await import("@/app/admin/actions");
    const before = await c.schedules.weeklyHours(own.id);
    for (const action of [() => a.setHoursAction(own.id, new FormData()), () => a.addTimeOffAction(own.id, new FormData()), () => a.removeTimeOffAction(own.id, "missing"), () => a.setDateOverrideAction(own.id, new FormData()), () => a.removeDateOverrideAction(own.id, "2026-11-03")]) {
      await expect(action()).rejects.toThrow("redirect:");
    }
    expect(await c.schedules.weeklyHours(own.id)).toEqual(before);
  });

  it("gives managers, CCD and admins a therapist picker and real schedule edits without granting CCD profile or calendar controls", async () => {
    const { own } = await setup();
    const { default: Picker } = await import("@/app/admin/availability/page");
    const { default: Staff } = await import("@/app/admin/staff/[id]/page");
    const { Shell } = await import("@/components/Shell");
    const a = await import("@/app/admin/actions");
    for (const role of ["manager", "ccd", "admin"] as const) {
      const member = await c.staff.create({}, { name: role, email: `${role}@firm.test`, accessRole: role });
      runtime.me = { ...member, permissions: await c.access.permissionsFor(role) };
      expect(html(await Shell({ me: runtime.me, children: null }))).toContain('href="/admin/availability"');
      expect(html(await Picker())).toContain(`/admin/staff/${own.id}`);
      const page = html(await Staff({ params: Promise.resolve({ id: own.id }), searchParams: Promise.resolve({}) }));
      expect(page).toContain("Save hours");
      if (role === "ccd") {
        expect(page).not.toContain("Save profile");
        expect(page).not.toContain("own@firm.test");
        expect(page).not.toContain("Google Calendar");
        await expect(a.updateStaffAction(own.id, new FormData())).rejects.toThrow("redirect:");
      }
      const hours = new FormData(); hours.set("day1", "09:00-12:00");
      await expect(a.setHoursAction(own.id, hours)).rejects.toThrow("ok=Working");
      expect(await c.schedules.weeklyHours(own.id)).toEqual([{ weekday: 1, startTime: "09:00", endTime: "12:00" }]);
      const override = new FormData(); override.set("date", "2026-11-03"); override.set("off", "on");
      await expect(a.setDateOverrideAction(own.id, override)).rejects.toThrow("ok=Date");
      expect(await c.schedules.dateOverrides(own.id, "2026-11-03", "2026-11-04")).toHaveLength(1);
      await expect(a.removeDateOverrideAction(own.id, "2026-11-03")).rejects.toThrow("ok=Date");
      expect(await c.schedules.dateOverrides(own.id, "2026-11-03", "2026-11-04")).toEqual([]);
      const off = new FormData(); off.set("startsAt", "2026-11-03T10:00"); off.set("endsAt", "2026-11-03T11:00");
      await expect(a.addTimeOffAction(own.id, off)).rejects.toThrow("ok=Time");
      const blocks = await c.schedules.timeOffBetween(own.id, now, new Date("2026-11-04"));
      expect(blocks).toHaveLength(1);
      await expect(a.removeTimeOffAction(own.id, blocks[0].id)).rejects.toThrow("ok=Time");
      expect(await c.schedules.timeOffBetween(own.id, now, new Date("2026-11-04"))).toEqual([]);
    }
  });


  it("blocks psychologists' and CCD's direct Google controls, including a valid consent callback, while keeping manager/admin control", async () => {
    const { own } = await setup();
    const actions = await import("@/app/admin/actions");
    const connect = await import("@/app/api/calendar/google/connect/route");
    const callback = await import("@/app/api/calendar/google/callback/route");
    const connectUrl = vi.spyOn(c.calendar, "connectUrl").mockReturnValue("https://accounts.google.com/o/oauth2/v2/auth");
    const stateOwner = vi.spyOn(c.calendar, "stateOwner").mockReturnValue(own.id);
    const complete = vi.spyOn(c.calendar, "completeConnect").mockResolvedValue(own.id);
    const options = vi.spyOn(c.calendar, "setOptions").mockResolvedValue(undefined);
    const sync = vi.spyOn(c.calendar, "syncNow").mockResolvedValue(undefined);
    const disconnect = vi.spyOn(c.calendar, "disconnect").mockResolvedValue(undefined);
    for (const role of ["psychologist", "ccd", "manager", "admin"] as const) {
      const member = role === "psychologist" ? own : await c.staff.create({}, { name: `Calendar ${role}`, email: `calendar-${role}@firm.test`, accessRole: role });
      runtime.me = { ...member, permissions: await c.access.permissionsFor(role) };
      vi.clearAllMocks();
      const permitted = role === "manager" || role === "admin";
      const response = await connect.GET(new Request(`https://example.test/api/calendar/google/connect?staff=${own.id}`));
      const returned = await callback.GET(new Request("https://example.test/api/calendar/google/callback?state=valid-test-state&code=test-code"));
      if (!permitted) {
        expect(response.headers.get("location")).toContain("error=forbidden");
        expect(returned.headers.get("location")).toContain("error=forbidden");
        expect(connectUrl).not.toHaveBeenCalled();
        expect(stateOwner).not.toHaveBeenCalled();
        expect(complete).not.toHaveBeenCalled();
      } else {
        expect(response.headers.get("location")).toContain("https://accounts.google.com/");
        expect(connectUrl).toHaveBeenCalledWith(own.id);
        expect(complete).toHaveBeenCalledWith("test-code", "valid-test-state");
      }
      for (const action of [() => actions.calendarOptionsAction(own.id, new FormData()), () => actions.syncCalendarAction(own.id), () => actions.disconnectCalendarAction(own.id)]) {
        await expect(action()).rejects.toThrow(permitted ? "ok=" : "redirect:forbidden");
      }
      for (const method of [options, sync, disconnect]) expect(method).toHaveBeenCalledTimes(permitted ? 1 : 0);
    }
  });


  it("shows only paid and fully prepaid sessions on the calendar for every role, filtering before the row limit", async () => {
    const { own, mine, sharedOther, privateOther, book } = await setup();
    const free = await book(own.id, "12:00", "Free Client", "9812345680");
    const cancelled = await book(own.id, "14:00", "Cancelled Paid Client", "9812345681");
    const released = await book(own.id, "15:00", "Released Paid Client", "9812345682");
    const prepaid = await book(own.id, "16:00", "Prepaid Client", "9812345683");
    const partial = await book(own.id, "17:00", "Partial Credit Client", "9812345684");
    await db.execute(sql`update booking set payment_status = 'paid' where id in (${mine.id}, ${cancelled.id}, ${released.id}, ${prepaid.id})`);
    await c.bookings.cancel({ mode: "staff" }, cancelled.id, {}, { now });
    await db.execute(sql`update booking set slot_released = true where id = ${released.id}`);
    await db.execute(sql`update booking set credit_milli = 1000 where id = ${prepaid.id}`);
    await db.execute(sql`update booking set payment_status = 'pending', source = 'web', credit_milli = 500 where id = ${partial.id}`);
    await db.execute(sql`update booking set payment_status = 'failed', source = 'web', slot_released = false where id = ${sharedOther.id}`);
    await db.execute(sql`update booking set payment_status = 'pending', source = 'staff' where id = ${privateOther.id}`);
    const { default: Calendar } = await import("@/app/admin/calendar/page");
    const list = vi.spyOn(c.bookings, "list");
    for (const role of ["psychologist", "manager", "ccd", "admin"] as const) {
      const member = role === "psychologist" ? own : await c.staff.create({}, { name: `Diary ${role}`, email: `diary-${role}@firm.test`, accessRole: role });
      runtime.me = { ...member, permissions: await c.access.permissionsFor(role) };
      const markup = html(await Calendar({ searchParams: Promise.resolve({}) }));
      expect(markup).toContain("Paid sessions only");
      expect(markup).toContain(`/admin/bookings/${mine.id}`);
      expect(markup).toContain(`/admin/bookings/${prepaid.id}`);
      for (const b of [sharedOther, privateOther, free, cancelled, released, partial]) expect(markup).not.toContain(`/admin/bookings/${b.id}`);
    }
    expect(list.mock.calls.every(([q]) => q?.paymentStatus === "paid")).toBe(true);
    expect(await c.bookings.get(sharedOther.id)).toMatchObject({ paymentStatus: "failed", slotReleased: false });
  });

});
