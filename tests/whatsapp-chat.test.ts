import { beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { createContainer } from "@/features/container";
import { incomingMessages, statusUpdates } from "@/features/leads/whatsapp-webhook";
import type { ChatGraph } from "@/features/whatsapp-chat/whatsapp-chat.dto";
import { db, reset } from "./helpers";

const sent: { from: string; to: string; text: string }[] = [];
let refuse = false;
const chatGraph: ChatGraph = {
  sendText: async (from, to, text) => {
    if (refuse) throw new Error("Number blocked");
    sent.push({ from, to, text });
    return `wamid.out${sent.length}`;
  },
  download: async () => ({ bytes: new ArrayBuffer(1), mimeType: "audio/ogg" }),
};
const c = createContainer(db, { chatGraph, metaGraph: { exchangeCode: async () => "t", subscribeApp: async () => {}, registerNumber: async () => {} } });

const NOW = new Date("2026-11-09T10:00:00Z");
const plusHours = (h: number) => new Date(NOW.getTime() + h * 3_600_000);

beforeEach(async () => {
  await reset();
  sent.length = 0;
  refuse = false;
  await db.execute(sql`update business set whatsapp_waba_id = '111111', whatsapp_phone_number_id = '222222', whatsapp_msg_phone_number_id = null`);
});

let n = 0;
const receive = async (phone: string, text: string, at = NOW) => {
  const m = { phone, name: "Riya", source: "whatsapp" as const, at, text, waMessageId: `wamid.in${++n}`, kind: "text" };
  const r = await c.leads.receive(m);
  await c.whatsappChat.receive(m);
  return { r, m };
};
const team = async () => ({
  manager: await c.staff.create({}, { name: "Mana", email: "mana@firm.test", role: "manager" }),
  bde: await c.staff.create({}, { name: "Binu", email: "binu@firm.test", designation: "Sales Executive" }),
  other: await c.staff.create({}, { name: "Ote", email: "ote@firm.test", designation: "Sales Executive" }),
});
const createdLead = (r: Awaited<ReturnType<typeof c.leads.receive>>) => {
  if (r.kind !== "created") throw new Error("expected a new lead");
  return r.lead;
};

describe("WhatsApp chat on the leads number", () => {
  it("shows a sales executive only their own leads' chats; managers see all; others none", async () => {
    const { manager, bde, other } = await team();
    const therapist = await c.staff.create({}, { name: "Tara", email: "tara@firm.test", designation: "Psychologist" });
    const lead = createdLead((await receive("+919800000001", "Hello")).r);
    const owner = lead.assignedTo === bde.id ? bde : other;
    const notOwner = owner === bde ? other : bde;

    expect((await c.whatsappChat.conversations(owner)).map((x) => x.clientId)).toEqual([lead.clientId]);
    expect(await c.whatsappChat.conversations(notOwner)).toEqual([]);
    expect((await c.whatsappChat.conversations(manager)).map((x) => x.unread)).toEqual([1]);
    await expect(c.whatsappChat.thread(notOwner, lead.clientId, NOW)).rejects.toMatchObject({ code: "not_found" });
    await expect(c.whatsappChat.conversations(therapist)).rejects.toMatchObject({ code: "forbidden" });
  });

  it("clears unread when the owner opens it, not when a manager looks in", async () => {
    const { manager, bde, other } = await team();
    const lead = createdLead((await receive("+919800000001", "Hello")).r);
    const owner = lead.assignedTo === bde.id ? bde : other;
    await c.whatsappChat.thread(manager, lead.clientId, NOW);
    expect(await c.whatsappChat.unread(owner)).toBe(1);
    await c.whatsappChat.thread(owner, lead.clientId, NOW);
    expect(await c.whatsappChat.unread(owner)).toBe(0);
  });

  it("stores a repeated webhook once", async () => {
    const { manager } = await team();
    const { m, r } = await receive("+919800000001", "Hello");
    await c.whatsappChat.receive(m);
    expect((await c.whatsappChat.thread(manager, createdLead(r).clientId, NOW)).messages).toHaveLength(1);
  });

  it("replies from the leads number within 24 hours, moves the lead to contacted, and refuses after", async () => {
    const { manager } = await team();
    const { clientId } = createdLead((await receive("+919800000001", "Hello")).r);
    await c.whatsappChat.reply(manager, clientId, { text: "Hi Riya" }, plusHours(1));
    expect(sent).toEqual([{ from: "222222", to: "+919800000001", text: "Hi Riya" }]);
    const { messages, lead } = await c.whatsappChat.thread(manager, clientId, plusHours(1));
    expect(messages.map((m) => [m.direction, m.status, m.staffName])).toEqual([["in", "received", null], ["out", "sent", "Mana"]]);
    expect(lead?.status).toBe("contacted");
    await expect(c.whatsappChat.reply(manager, clientId, { text: "Late" }, plusHours(25))).rejects.toMatchObject({ code: "conflict" });
    expect((await c.whatsappChat.thread(manager, clientId, plusHours(25))).canReply).toBe(false);
  });

  it("keeps a refused reply visible as not sent", async () => {
    const { manager } = await team();
    const { clientId } = createdLead((await receive("+919800000001", "Hello")).r);
    refuse = true;
    await expect(c.whatsappChat.reply(manager, clientId, { text: "Hi" }, plusHours(1))).rejects.toMatchObject({ code: "conflict" });
    const last = (await c.whatsappChat.thread(manager, clientId, plusHours(1))).messages.at(-1);
    expect(last).toMatchObject({ direction: "out", status: "failed", error: "Number blocked" });
  });

  it("keeps a chat from someone who has booked before, with no lead, for managers only", async () => {
    const { manager, bde } = await team();
    const svc = await c.catalog.create({}, { name: "T", durationMin: 30 });
    await c.staff.setServices({}, bde.id, [svc.id]);
    await c.schedules.setWeeklyHours({}, bde.id, [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, startTime: "00:00", endTime: "23:30" })));
    const start = new Date(Math.ceil((Date.now() + 3 * 86_400_000) / 3_600_000) * 3_600_000);
    await c.bookings.create({ mode: "staff" }, { serviceId: svc.id, staffId: bde.id, start, client: { name: "Old client", phone: "+919800000009" } });
    const { r } = await receive("+919800000009", "Can I move my session?");
    expect(r.kind).toBe("client");
    expect((await c.whatsappChat.conversations(manager))[0]).toMatchObject({ lastText: "Can I move my session?" });
    expect(await c.whatsappChat.conversations(bde)).toEqual([]);
  });

  it("hides the chat of a client in the Bin", async () => {
    const { manager } = await team();
    const { clientId } = createdLead((await receive("+919800000001", "Hello")).r);
    await c.clients.remove({}, clientId);
    expect(await c.whatsappChat.conversations(manager)).toEqual([]);
    await expect(c.whatsappChat.thread(manager, clientId, NOW)).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("reading Meta's webhook", () => {
  const payload = (message: Record<string, unknown>) => ({
    object: "whatsapp_business_account",
    entry: [{ changes: [{ field: "messages", value: { metadata: { phone_number_id: "222222" }, contacts: [{ wa_id: "919800000001", profile: { name: "Riya" } }], messages: [{ id: "wamid.1", from: "919800000001", timestamp: "1794000000", ...message }] } }] }],
  });

  it("reads voice notes and photos with their file id and caption", () => {
    expect(incomingMessages(payload({ type: "audio", audio: { id: "m1", mime_type: "audio/ogg" } }), "222222")[0]).toMatchObject({ waMessageId: "wamid.1", kind: "audio", mediaId: "m1", mimeType: "audio/ogg" });
    expect(incomingMessages(payload({ type: "image", image: { id: "m2", mime_type: "image/jpeg", caption: "My report" } }), "222222")[0]).toMatchObject({ kind: "image", mediaId: "m2", text: "My report" });
    expect(incomingMessages(payload({ type: "location" }), "222222")[0]).toMatchObject({ kind: "other" });
  });

  it("reads receipts for the leads number only, and never lets delivered overwrite read", async () => {
    const receipt = { object: "whatsapp_business_account", entry: [{ changes: [{ field: "messages", value: { metadata: { phone_number_id: "222222" }, statuses: [{ id: "wamid.x", status: "read" }] } }] }] };
    expect(statusUpdates(receipt, "222222")).toEqual([{ waMessageId: "wamid.x", status: "read", error: null }]);
    expect(statusUpdates(receipt, "999999")).toEqual([]);
    const { manager } = await team();
    const { clientId } = createdLead((await receive("+919800000001", "Hello")).r);
    await c.whatsappChat.reply(manager, clientId, { text: "Hi" }, plusHours(1));
    await c.whatsappChat.statusUpdate({ waMessageId: "wamid.out1", status: "read", error: null });
    await c.whatsappChat.statusUpdate({ waMessageId: "wamid.out1", status: "delivered", error: null });
    expect((await c.whatsappChat.thread(manager, clientId, plusHours(1))).messages.at(-1)?.status).toBe("read");
  });
});

describe("connecting the leads number without a phone app", () => {
  it("puts the number into service with the PIN using Meta's sign-in token, then subscribes; admins only", async () => {
    const calls: string[] = [];
    const cc = createContainer(db, { chatGraph, metaGraph: {
      exchangeCode: async () => { calls.push("code"); return "business-token"; },
      registerNumber: async (phone, pin, token) => { calls.push(`register:${phone}:${pin}:${token}`); },
      subscribeApp: async (waba, token) => { calls.push(`subscribe:${waba}:${token}`); },
    } });
    const admin = await cc.staff.create({}, { name: "Ad", email: "ad@firm.test", role: "admin" });
    const { manager } = await team();
    const input = { code: "code-0123456789", wabaId: "333333", phoneNumberId: "444444", pin: "123456" };
    await expect(cc.whatsappConnect.connect(manager, "leads", input)).rejects.toMatchObject({ code: "forbidden" });
    await expect(cc.whatsappConnect.connect(admin, "leads", { ...input, pin: "12" })).rejects.toThrow();
    await cc.whatsappConnect.connect(admin, "leads", input);
    expect(calls).toEqual(["code", "register:444444:123456:business-token", "subscribe:333333:business-token"]);
    expect((await cc.whatsappConnect.status()).leads).toMatchObject({ wabaId: "333333", phoneNumberId: "444444" });
  });
});
