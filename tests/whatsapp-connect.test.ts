import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/whatsapp/webhook/route";
import { sql } from "drizzle-orm";
import type { AccessRole } from "@/features/access/permissions";
import { createContainer } from "@/features/container";
import type { MetaGraph } from "@/features/whatsapp-connect/whatsapp-connect.dto";
import { db, reset } from "./helpers";

beforeEach(async () => {
  await reset();
  await db.execute(sql`update business set whatsapp_waba_id = null, whatsapp_phone_number_id = null, whatsapp_connected_at = null,
    whatsapp_msg_waba_id = null, whatsapp_msg_phone_number_id = null, whatsapp_msg_connected_at = null`);
});

const asViewer = (s: { id: string; accessRole: AccessRole }) => s;

function setup() {
  const calls: string[] = [];
  const graph: MetaGraph = {
    exchangeCode: async (code) => { calls.push(`code:${code}`); return "business-token"; },
    subscribeApp: async (waba, token) => { calls.push(`subscribe:${waba}:${token}`); },
  };
  return { calls, c: createContainer(db, { metaGraph: graph }) };
}

describe("connecting the WhatsApp numbers", () => {
  it("swaps the code, subscribes the app to the account and remembers the leads number; admins only", async () => {
    const { calls, c } = setup();
    const admin = await c.staff.create({}, { name: "Ad", email: "ad@firm.test", role: "admin" });
    const sales = await c.staff.create({}, { name: "Bi", email: "bi@firm.test", designation: "Sales Executive" });
    const input = { code: "code-0123456789", wabaId: "27997481349919392", phoneNumberId: "1391703714022747" };

    await expect(c.whatsappConnect.connect(asViewer(sales), "leads", input)).rejects.toMatchObject({ code: "forbidden" });
    await expect(c.whatsappConnect.connect(asViewer(admin), "leads", { ...input, wabaId: "abc" })).rejects.toThrow();
    await c.whatsappConnect.connect(asViewer(admin), "leads", input, new Date("2026-10-26T18:00:00Z"));
    expect(calls).toEqual(["code:code-0123456789", "subscribe:27997481349919392:business-token"]);
    const status = await c.whatsappConnect.status();
    expect(status.leads).toEqual({ wabaId: "27997481349919392", phoneNumberId: "1391703714022747", connectedAt: new Date("2026-10-26T18:00:00Z") });
    expect(status.messages.phoneNumberId).toBeNull();
  });

  it("keeps the messages number separate, and refuses the same number for both", async () => {
    const { c, calls } = setup();
    const admin = await c.staff.create({}, { name: "Ad", email: "ad@firm.test", role: "admin" });
    await c.whatsappConnect.connect(asViewer(admin), "leads", { code: "code-0123456789", wabaId: "111111", phoneNumberId: "222222" });
    await expect(c.whatsappConnect.connect(asViewer(admin), "messages", { code: "code-0123456789", wabaId: "111111", phoneNumberId: "222222" }))
      .rejects.toMatchObject({ code: "conflict" });
    expect(calls).toHaveLength(2); // Reject before consuming a code or changing Meta subscriptions.
    await c.whatsappConnect.connect(asViewer(admin), "messages", { code: "code-9876543210", wabaId: "333333", phoneNumberId: "444444" });
    const status = await c.whatsappConnect.status();
    expect([status.leads.phoneNumberId, status.messages.phoneNumberId]).toEqual(["222222", "444444"]);
  });
});

afterEach(() => vi.unstubAllEnvs());

async function webhook(numbers: string[]) {
  vi.stubEnv("WHATSAPP_APP_SECRET", "synthetic-webhook-secret");
  vi.stubEnv("WHATSAPP_LEADS_PHONE_NUMBER_ID", "");
  const body = JSON.stringify({ object: "whatsapp_business_account", entry: [{ changes: numbers.map((id, i) => ({ field: "messages", value: {
    metadata: { phone_number_id: id }, messages: [{ from: `91980000000${i}`, timestamp: "1792800000" }],
  } })) }] });
  return POST(new NextRequest("https://book.example.test/api/whatsapp/webhook", { method: "POST", body, headers: {
    "x-hub-signature-256": `sha256=${createHmac("sha256", "synthetic-webhook-secret").update(body).digest("hex")}`,
  } }));
}

describe("CCD replies stay out of sales", () => {
  it("does not create leads when only the CCD number is connected", async () => {
    const { c } = setup();
    const admin = await c.staff.create({}, { name: "Admin", email: "admin@firm.test", role: "admin" });
    await c.whatsappConnect.connect(asViewer(admin), "messages", { code: "code-0123456789", wabaId: "333333", phoneNumberId: "444444" });
    expect((await webhook(["444444", "555555"])).status).toBe(200);
    expect(await c.leads.list(asViewer(admin))).toHaveLength(0);
  });

  it("captures sales chats while ignoring CCD and OTP chats in the same batch", async () => {
    const { c } = setup();
    const admin = await c.staff.create({}, { name: "Admin", email: "admin@firm.test", role: "admin" });
    await c.whatsappConnect.connect(asViewer(admin), "leads", { code: "code-0123456789", wabaId: "111111", phoneNumberId: "222222" });
    expect((await webhook(["222222", "444444", "555555"])).status).toBe(200);
    const leads = await c.leads.list(asViewer(admin));
    expect(leads).toHaveLength(1);
    expect(leads[0].clientPhone).toBe("+919800000000");
  });
});
