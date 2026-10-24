import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import type { LeadViewer } from "@/features/leads/leads.dto";
import { incomingMessages, signatureValid } from "@/features/leads/whatsapp-webhook";
import { c, reset } from "./helpers";

beforeEach(reset);

let n = 0;
const sales = (name: string) => c.staff.create({}, { name, email: `${name.toLowerCase()}${++n}@firm.test`, designation: "Sales Executive" });
const message = (phone: string, at: string, ad = false) =>
  c.leads.receive({ phone, name: "Someone", source: ad ? "whatsapp_ad" : "whatsapp", adHeadline: ad ? "Anxiety reel" : null, at: new Date(at) });
const asViewer = (s: { id: string; role: "staff" | "manager" | "admin"; designation: string | null }): LeadViewer => s;

describe("sharing new leads", () => {
  it("gives new leads to the sales executives in turn", async () => {
    const asha = await sales("Asha");
    const binu = await sales("Binu");
    const owners: (string | null)[] = [];
    for (let i = 0; i < 4; i++) {
      const r = await message(`9800000000${i}`, `2026-10-20T0${i}:00:00Z`);
      owners.push(r.kind === "created" ? r.lead.assignedTo : null);
    }
    expect(owners).toEqual([asha.id, binu.id, asha.id, binu.id]);
  });

  it("only shares with active sales executives, skipping anyone on leave", async () => {
    await c.staff.create({}, { name: "Therapist", email: "t@firm.test", designation: "Psychologist" });
    const asha = await sales("Asha");
    const binu = await sales("Binu");
    const gone = await sales("Gone");
    await c.staff.update({}, gone.id, { active: false });
    await c.schedules.addTimeOff({}, binu.id, { startsAt: "2026-10-20T00:00:00Z", endsAt: "2026-10-21T00:00:00Z" });
    const a = await message("98000 00001", "2026-10-20T05:00:00Z");
    const b = await message("98000 00002", "2026-10-20T06:00:00Z");
    expect(a.kind === "created" && a.lead.assignedTo).toBe(asha.id);
    expect(b.kind === "created" && b.lead.assignedTo).toBe(asha.id);
  });

  it("keeps a lead with nobody when no sales executive is free", async () => {
    const r = await message("98000 00001", "2026-10-20T05:00:00Z");
    expect(r.kind === "created" && r.lead.assignedTo).toBeNull();
  });
});

describe("messages from the same person", () => {
  it("adds a later message to their open lead instead of opening another", async () => {
    await sales("Asha");
    const first = await message("98765 43210", "2026-10-20T05:00:00Z", true);
    const again = await message("+91 98765 43210", "2026-10-20T07:00:00Z");
    expect(first.kind).toBe("created");
    expect(again.kind).toBe("existing");
    if (first.kind !== "created" || again.kind !== "existing") return;
    expect(again.lead.id).toBe(first.lead.id);
    expect(again.lead.lastMessageAt).toEqual(new Date("2026-10-20T07:00:00Z"));
    expect(again.lead.adHeadline).toBe("Anxiety reel");
  });

  it("treats someone who has booked before as a client, not a new lead", async () => {
    await sales("Asha");
    const svc = await c.catalog.create({}, { name: "Consult", durationMin: 30 });
    const therapist = await c.staff.create({}, { name: "Tara", email: "tara@firm.test" });
    await c.staff.setServices({}, therapist.id, [svc.id]);
    await c.schedules.setWeeklyHours({}, therapist.id, [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, startTime: "09:00", endTime: "17:00" })));
    await c.bookings.create({ mode: "staff" }, { serviceId: svc.id, staffId: therapist.id, start: new Date("2026-10-19T05:00:00Z"), client: { name: "Ravi", phone: "98765 43210" } }, { now: new Date("2026-10-15T02:30:00Z") });
    expect((await message("98765 43210", "2026-10-20T05:00:00Z")).kind).toBe("client");
  });
});

describe("working the leads", () => {
  it("shows a sales executive only their own leads; managers see all and can reassign", async () => {
    const asha = await sales("Asha");
    const binu = await sales("Binu");
    const manager = await c.staff.create({}, { name: "Mona", email: "mona@firm.test", role: "manager" });
    const one = await message("98000 00001", "2026-10-20T05:00:00Z");
    await message("98000 00002", "2026-10-20T06:00:00Z");
    if (one.kind !== "created") throw new Error("expected a new lead");

    expect((await c.leads.list(asViewer(asha))).map((l) => l.assignedTo)).toEqual([asha.id]);
    await expect(c.leads.get(asViewer(binu), one.lead.id)).rejects.toMatchObject({ code: "not_found" });
    expect(await c.leads.list(asViewer(manager))).toHaveLength(2);

    await expect(c.leads.reassign(asViewer(asha), one.lead.id, binu.id)).rejects.toMatchObject({ code: "forbidden" });
    await c.leads.reassign(asViewer(manager), one.lead.id, binu.id);
    expect((await c.leads.get(asViewer(binu), one.lead.id)).assignedTo).toBe(binu.id);
  });

  it("keeps leads away from staff who aren't in sales", async () => {
    const therapist = await c.staff.create({}, { name: "Tara", email: "tara@firm.test", designation: "Psychologist" });
    await expect(c.leads.list(asViewer(therapist))).rejects.toMatchObject({ code: "forbidden" });
  });

  it("needs a date to follow up, and remembers when a lead was closed", async () => {
    const asha = await sales("Asha");
    const r = await message("98000 00001", "2026-10-20T05:00:00Z");
    if (r.kind !== "created") throw new Error("expected a new lead");
    await expect(c.leads.update(asViewer(asha), r.lead.id, { status: "follow_up", followUpOn: null, notes: null })).rejects.toMatchObject({ code: "invalid" });
    await c.leads.update(asViewer(asha), r.lead.id, { status: "follow_up", followUpOn: "2026-10-25", notes: "Call after 6pm" });
    expect(await c.leads.get(asViewer(asha), r.lead.id)).toMatchObject({ status: "follow_up", followUpOn: "2026-10-25", notes: "Call after 6pm", closedAt: null });
    await c.leads.update(asViewer(asha), r.lead.id, { status: "lost", followUpOn: "2026-10-25", notes: null }, new Date("2026-10-22T00:00:00Z"));
    expect(await c.leads.get(asViewer(asha), r.lead.id)).toMatchObject({ status: "lost", followUpOn: null, closedAt: new Date("2026-10-22T00:00:00Z") });
    // Closed, so the next message opens a fresh lead.
    expect((await message("98000 00001", "2026-10-23T05:00:00Z")).kind).toBe("created");
  });

  it("marks the lead converted when the person books", async () => {
    const asha = await sales("Asha");
    const r = await message("98765 43210", "2026-10-14T05:00:00Z");
    if (r.kind !== "created") throw new Error("expected a new lead");
    const svc = await c.catalog.create({}, { name: "Consult", durationMin: 30 });
    const therapist = await c.staff.create({}, { name: "Tara", email: "tara@firm.test" });
    await c.staff.setServices({}, therapist.id, [svc.id]);
    await c.schedules.setWeeklyHours({}, therapist.id, [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, startTime: "09:00", endTime: "17:00" })));
    await c.bookings.create({ mode: "staff" }, { serviceId: svc.id, staffId: therapist.id, start: new Date("2026-10-19T05:00:00Z"), client: { name: "Ravi", phone: "98765 43210" } }, { now: new Date("2026-10-15T02:30:00Z") });
    expect((await c.leads.get(asViewer(asha), r.lead.id)).status).toBe("converted");
  });

  it("lets staff add a lead by hand, once per person", async () => {
    const asha = await sales("Asha");
    const lead = await c.leads.add(asViewer(asha), { name: "Walk In", phone: "98000 00009", notes: "Asked about couples sessions" });
    expect(lead).toMatchObject({ source: "manual", assignedTo: asha.id, notes: "Asked about couples sessions" });
    await expect(c.leads.add(asViewer(asha), { name: "Walk In", phone: "98000 00009" })).rejects.toMatchObject({ code: "conflict" });
  });
});

describe("the WhatsApp webhook", () => {
  const payload = (phoneNumberId: string, referral?: object) => ({
    object: "whatsapp_business_account",
    entry: [{ changes: [
      { field: "messages", value: {
        metadata: { phone_number_id: phoneNumberId },
        contacts: [{ wa_id: "919876543210", profile: { name: "Anu" } }],
        messages: [{ from: "919876543210", timestamp: "1792800000", type: "text", ...(referral ? { referral } : {}) }],
      } },
      { field: "messages", value: { metadata: { phone_number_id: phoneNumberId }, statuses: [{ status: "delivered" }] } },
      { field: "smb_message_echoes", value: { message_echoes: [{ to: "919876543210" }] } },
    ] }],
  });

  it("reads customer messages and the ad they came from, skipping receipts and our own echoes", () => {
    const got = incomingMessages(payload("111", { source_type: "ad", source_id: "ad-9", headline: "Talk to someone today", source_url: "https://fb.me/x" }));
    expect(got).toEqual([{ phone: "+919876543210", name: "Anu", source: "whatsapp_ad", adId: "ad-9", adHeadline: "Talk to someone today", adUrl: "https://fb.me/x", at: new Date(1792800000 * 1000) }]);
    expect(incomingMessages(payload("111"))[0]).toMatchObject({ source: "whatsapp", adId: null });
  });

  it("only takes messages to the leads number when one is set", () => {
    expect(incomingMessages(payload("111"), "222")).toEqual([]);
    expect(incomingMessages(payload("222"), "222")).toHaveLength(1);
    expect(incomingMessages({ object: "page" })).toEqual([]);
  });

  it("accepts only bodies signed with the app secret", () => {
    const body = JSON.stringify(payload("111"));
    const sig = `sha256=${createHmac("sha256", "secret").update(body).digest("hex")}`;
    expect(signatureValid(body, sig, "secret")).toBe(true);
    expect(signatureValid(body, sig, "other")).toBe(false);
    expect(signatureValid(`${body} `, sig, "secret")).toBe(false);
    expect(signatureValid(body, null, "secret")).toBe(false);
  });
});

describe("online and offline", () => {
  const owner = (r: Awaited<ReturnType<typeof message>>) => (r.kind === "created" ? r.lead.assignedTo : "none");

  it("gives every new lead to whoever is online while the other is offline", async () => {
    const asha = await sales("Asha");
    const binu = await sales("Binu");
    await c.leads.setOnline(asViewer(binu), binu.id, false, new Date("2026-10-20T00:00:00Z"));
    const owners = [];
    for (let i = 0; i < 3; i++) owners.push(owner(await message(`9810000000${i}`, `2026-10-20T0${i + 1}:00:00Z`)));
    expect(owners).toEqual([asha.id, asha.id, asha.id]);
    expect((await c.leads.salesTeam(asViewer(asha))).map((p) => [p.name, p.online])).toEqual([["Asha", true], ["Binu", false]]);
  });

  it("goes back to taking turns once both are online again", async () => {
    const asha = await sales("Asha");
    const binu = await sales("Binu");
    await c.leads.setOnline(asViewer(binu), binu.id, false, new Date("2026-10-20T00:00:00Z"));
    await message("98100 00001", "2026-10-20T01:00:00Z");
    await message("98100 00002", "2026-10-20T02:00:00Z");
    await c.leads.setOnline(asViewer(binu), binu.id, true, new Date("2026-10-20T03:00:00Z"));
    const next = [owner(await message("98100 00003", "2026-10-20T04:00:00Z")), owner(await message("98100 00004", "2026-10-20T05:00:00Z"))];
    expect(next).toEqual([binu.id, asha.id]);
  });

  it("holds leads while everyone is offline and shares them out in turn when someone comes online", async () => {
    const asha = await sales("Asha");
    const binu = await sales("Binu");
    await c.leads.setOnline(asViewer(asha), asha.id, false, new Date("2026-10-20T00:00:00Z"));
    await c.leads.setOnline(asViewer(binu), binu.id, false, new Date("2026-10-20T00:00:00Z"));
    for (let i = 0; i < 3; i++) expect(owner(await message(`9820000000${i}`, `2026-10-20T0${i + 1}:00:00Z`))).toBeNull();
    expect(await c.leads.setOnline(asViewer(asha), asha.id, true, new Date("2026-10-20T05:00:00Z"))).toBe(3);
    const mine = await c.leads.list(asViewer(asha));
    expect(mine).toHaveLength(3);
    // Binu comes online too: the next new lead is his, since Asha just took the waiting ones.
    await c.leads.setOnline(asViewer(binu), binu.id, true, new Date("2026-10-20T06:00:00Z"));
    expect(owner(await message("98200 00009", "2026-10-20T07:00:00Z"))).toBe(binu.id);
  });

  it("lets sales executives switch only themselves; managers can switch anyone", async () => {
    const asha = await sales("Asha");
    const binu = await sales("Binu");
    const boss = await c.staff.create({}, { name: "Boss", email: "boss@firm.test", role: "manager" });
    await expect(c.leads.setOnline(asViewer(asha), binu.id, false)).rejects.toThrow(/only switch yourself/);
    await c.leads.setOnline(asViewer(boss), binu.id, false);
    expect((await c.leads.salesTeam(asViewer(boss))).find((p) => p.id === binu.id)?.online).toBe(false);
    await expect(c.leads.setOnline(asViewer(boss), boss.id, false)).rejects.toThrow(/not an active sales executive/);
  });
});
