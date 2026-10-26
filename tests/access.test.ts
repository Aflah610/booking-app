import { beforeEach, describe, expect, it } from "vitest";
import { can, DEFAULT_PERMISSIONS } from "@/features/access/permissions";
import type { BookingActor } from "@/features/bookings/bookings.service";
import { zonedToUtc } from "@/lib/time";
import { withoutContact } from "@/lib/contact";
import { c, reset } from "./helpers";

beforeEach(reset);

const at = (local: string) => zonedToUtc(local, "Asia/Kolkata");
const desk: BookingActor = { mode: "staff" };
const everyDay = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, startTime: "08:00", endTime: "20:00" }));
let n = 0;
const person = (name: string, extra: Record<string, unknown> = {}) => c.staff.create({}, { name, email: `${name.toLowerCase()}${++n}@firm.test`, ...extra });

describe("roles", () => {
  it("gives existing kinds of staff the matching role, and keeps the older rank in step", async () => {
    expect((await person("Ada", { role: "admin" })).accessRole).toBe("admin");
    expect((await person("Mona", { role: "manager" })).accessRole).toBe("manager");
    expect((await person("Binu", { designation: "Sales Executive" })).accessRole).toBe("bde");
    expect((await person("Sana", { designation: "Consultation Coordinator" })).accessRole).toBe("ccd");
    expect((await person("Asha", { designation: "Psychologist" })).accessRole).toBe("psychologist");
    const ccd = await person("Cara", { accessRole: "ccd" });
    expect(ccd).toMatchObject({ accessRole: "ccd", role: "staff" });
    const promoted = await c.staff.update({}, ccd.id, { accessRole: "manager" });
    expect(promoted).toMatchObject({ accessRole: "manager", role: "manager" });
  });

  it("has the agreed defaults: only coordinators book, psychologists don't see contacts, managers see pending notes only", () => {
    expect(DEFAULT_PERMISSIONS.ccd.has("bookings.create")).toBe(true);
    for (const r of ["manager", "psychologist", "bde"] as const) expect(DEFAULT_PERMISSIONS[r].has("bookings.create")).toBe(false);
    expect(DEFAULT_PERMISSIONS.psychologist.has("clients.contact")).toBe(false);
    expect(DEFAULT_PERMISSIONS.manager.has("casenotes.pending")).toBe(true);
    expect(DEFAULT_PERMISSIONS.manager.has("casenotes.read_all")).toBe(false);
    expect(can({ accessRole: "admin", permissions: new Set() }, "settings.manage")).toBe(true);
  });
});

describe("changing what a role can do", () => {
  it("lets only admins change a role, never the admin row, and stores only the differences", async () => {
    const admin = await person("Ada", { role: "admin" });
    const mona = await person("Mona", { role: "manager" });
    await expect(c.access.setRole({ staffId: mona.id, accessRole: "manager" }, "psychologist", [])).rejects.toMatchObject({ code: "forbidden" });
    await expect(c.access.setRole({ staffId: admin.id, accessRole: "admin" }, "admin", [])).rejects.toMatchObject({ code: "invalid" });

    // Let psychologists see contact details too, on top of their defaults.
    await c.access.setRole({ staffId: admin.id, accessRole: "admin" }, "psychologist", [...DEFAULT_PERMISSIONS.psychologist, "clients.contact"]);
    expect((await c.access.permissionsFor("psychologist")).has("clients.contact")).toBe(true);
    expect((await c.access.permissionsFor("bde")).has("clients.contact")).toBe(true);
    // Putting the defaults back leaves nothing stored.
    await c.access.setRole({ staffId: admin.id, accessRole: "admin" }, "psychologist", [...DEFAULT_PERMISSIONS.psychologist]);
    expect((await c.access.permissionsFor("psychologist")).has("clients.contact")).toBe(false);
  });

  it("shares new leads with whichever roles may work them", async () => {
    const admin = await person("Ada", { role: "admin" });
    const sana = await person("Sana", { designation: "Consultation Coordinator" });
    const msg = (phone: string, time: string) => c.leads.receive({ phone, name: "Someone", source: "whatsapp", at: new Date(time) });
    const first = await msg("98000 00001", "2026-10-20T01:00:00Z");
    expect(first.kind === "created" && first.lead.assignedTo).toBeNull();
    await c.access.setRole({ staffId: admin.id, accessRole: "admin" }, "ccd", [...DEFAULT_PERMISSIONS.ccd, "leads.own"]);
    const second = await msg("98000 00002", "2026-10-20T02:00:00Z");
    expect(second.kind === "created" && second.lead.assignedTo).toBe(sana.id);
  });

  it("blanks clients' phone and email for roles without contact access", () => {
    const rows = [{ clientName: "Ravi", clientPhone: "+919876543210", clientEmail: "ravi@example.com" }];
    expect(withoutContact({ accessRole: "psychologist" }, rows)).toEqual([{ clientName: "Ravi", clientPhone: "", clientEmail: null }]);
    expect(withoutContact({ accessRole: "ccd" }, rows)).toEqual(rows);
  });
});

describe("pending case notes", () => {
  async function setup() {
    const therapy = await c.catalog.create({}, { name: "Therapy", durationMin: 60 });
    const asha = await person("Asha", { designation: "Psychologist" });
    const dev = await person("Dev", { designation: "Psychologist" });
    const mona = await person("Mona", { role: "manager" });
    for (const s of [asha, dev]) {
      await c.staff.setServices({}, s.id, [therapy.id]);
      await c.schedules.setWeeklyHours({}, s.id, everyDay);
    }
    const book = (staffId: string, start: string, phone: string) =>
      c.bookings.create(desk, { serviceId: therapy.id, staffId, start: at(start), client: { name: "Ravi", phone }, useCredits: false }, { now: at("2026-10-01T08:00") }).then((r) => r.booking);
    return { asha, dev, mona, book };
  }

  it("lists sessions without a note, due 24 hours after they end, and shows managers everyone's", async () => {
    const { asha, dev, mona, book } = await setup();
    const early = await book(asha.id, "2026-10-26T10:00", "98765 00001");
    await book(dev.id, "2026-10-27T10:00", "98765 00002");
    await book(asha.id, "2026-10-28T10:00", "98765 00003"); // not held yet
    const now = at("2026-10-27T12:00");

    const all = await c.caseHistory.pendingNotes(mona, {}, now);
    expect(all.map((p) => [p.staffName, p.overdue])).toEqual([["Asha", true], ["Dev", false]]);
    expect(all[0].dueAt).toEqual(at("2026-10-27T11:00"));
    expect(await c.caseHistory.countOverdueNotes(now)).toBe(1);

    // A psychologist sees only their own; writing the note clears it.
    const mine = await c.caseHistory.pendingNotes(asha, { staffId: dev.id }, now);
    expect(mine.map((p) => p.bookingId)).toEqual([early.id]);
    await c.caseHistory.addNote(asha, early.clientId, { bookingId: early.id, summary: "Rapport building.", risk: "low", response: "engaged", progress: "same" });
    expect(await c.caseHistory.pendingNotes(asha, {}, now)).toEqual([]);
  });

  it("ignores sessions before case notes moved here, cancelled sessions, and staff who don't write notes", async () => {
    const { asha, mona, book } = await setup();
    const sana = await person("Sana", { designation: "Consultation Coordinator" });
    await book(asha.id, "2026-10-20T10:00", "98765 00001");
    const cancelled = await book(asha.id, "2026-10-26T10:00", "98765 00002");
    await c.bookings.cancel({ mode: "staff" }, cancelled.id, { reason: "Client unwell" }, { now: at("2026-10-25T09:00") });
    expect(await c.caseHistory.pendingNotes(mona, {}, at("2026-10-28T12:00"))).toEqual([]);
    await expect(c.caseHistory.pendingNotes(sana)).rejects.toMatchObject({ code: "forbidden" });
  });
});

describe("clients by role", () => {
  it("lets psychologists see their own clients without contact details, and only managers reassign", () => {
    expect(DEFAULT_PERMISSIONS.psychologist.has("clients.own")).toBe(true);
    expect(DEFAULT_PERMISSIONS.psychologist.has("clients.view")).toBe(false);
    expect(DEFAULT_PERMISSIONS.manager.has("clients.reassign")).toBe(true);
    expect(DEFAULT_PERMISSIONS.ccd.has("clients.reassign")).toBe(false);
  });
});
