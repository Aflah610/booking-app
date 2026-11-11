import { createMetaGraph } from "@/features/whatsapp-connect/whatsapp-connect.service";
import { createChatGraph } from "@/features/whatsapp-chat/whatsapp-chat.service";
import { DomainError } from "@/features/shared/errors";
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
    checkApp: async token => { calls.push(`verify:${token}`); },
    exchangeCode: async (code) => { calls.push(`code:${code}`); return "business-token"; },
    subscribeApp: async (waba, token) => { calls.push(`subscribe:${waba}:${token}`); },
    registerNumber: async (phone) => { calls.push(`register:${phone}`); },
  };
  return { calls, graph, c: createContainer(db, { metaGraph: graph }) };
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


describe("direct leads token separation", () => {
  const input = { wabaId: "333333", phoneNumberId: "444444", pin: "0".repeat(6) };
  it("checks and subscribes with the separate leads token before registering; leaves the existing sender intact", async () => {
    vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "synthetic-otp-token");
    vi.stubEnv("WHATSAPP_LEADS_ACCESS_TOKEN", "synthetic-messaging-token");
    const { c, calls } = setup();
    const admin = await c.staff.create({}, { name: "Admin", email: "direct@firm.test", role: "admin" });
    await c.whatsappConnect.connectDirect(admin, input);
    expect(calls).toEqual(["verify:synthetic-messaging-token", "subscribe:333333:synthetic-messaging-token", "register:444444"]);
    expect(process.env.WHATSAPP_ACCESS_TOKEN).toBe("synthetic-otp-token");
    expect((await c.whatsappConnect.status()).leads.phoneNumberId).toBe(input.phoneNumberId);
    const rows = await db.execute(sql`select details from audit_log where action = 'connect_whatsapp'`);
    expect(JSON.stringify(rows)).not.toContain(input.pin);
    expect(JSON.stringify(rows)).not.toContain("synthetic-messaging-token");
  });
  it("refuses a wrong-app token before subscribing, registering or saving a connection", async () => {
    vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "synthetic-otp-token");
    vi.stubEnv("WHATSAPP_LEADS_ACCESS_TOKEN", "");
    const { c, calls, graph } = setup();
    graph.checkApp = async () => { throw new DomainError("invalid", "Token belongs to the other app"); };
    const admin = await c.staff.create({}, { name: "Admin", email: "wrong@firm.test", role: "admin" });
    await expect(c.whatsappConnect.connectDirect(admin, input)).rejects.toMatchObject({ code: "invalid" });
    expect(calls).toEqual([]);
    expect((await c.whatsappConnect.status()).leads.phoneNumberId).toBeNull();
  });
  it("keeps a matching shared token usable when no leads override is set", async () => {
    vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "synthetic-messaging-token");
    vi.stubEnv("WHATSAPP_LEADS_ACCESS_TOKEN", "");
    const { c, calls } = setup();
    const admin = await c.staff.create({}, { name: "Admin", email: "shared@firm.test", role: "admin" });
    await c.whatsappConnect.connectDirect(admin, input);
    expect(calls[0]).toBe("verify:synthetic-messaging-token");
  });
});

describe("Meta token ownership and chat credential boundaries", () => {
  const env = { META_APP_ID: "1528505165963496", WHATSAPP_APP_SECRET: "synthetic-app-secret", WHATSAPP_ACCESS_TOKEN: "synthetic-otp-token", WHATSAPP_LEADS_ACCESS_TOKEN: "synthetic-leads-token" };
  afterEach(() => vi.restoreAllMocks());
  it("uses debug_token with the configured app credential and rejects invalid/wrong-app tokens", async () => {
    const request = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ data: { app_id: env.META_APP_ID, is_valid: true } }));
    await createMetaGraph(env).checkApp(env.WHATSAPP_LEADS_ACCESS_TOKEN);
    expect(String(request.mock.calls[0][0])).toContain("/debug_token?");
    expect(new Headers(request.mock.calls[0][1]?.headers).get("authorization")).toBe(`Bearer ${env.META_APP_ID}|${env.WHATSAPP_APP_SECRET}`);
    for (const data of [{ app_id: "2130581677532743", is_valid: true }, { app_id: env.META_APP_ID, is_valid: false }]) {
      request.mockResolvedValue(Response.json({ data }));
      await expect(createMetaGraph(env).checkApp(env.WHATSAPP_LEADS_ACCESS_TOKEN)).rejects.toMatchObject({ code: "invalid" });
    }
    request.mockResolvedValue(Response.json({ error: { message: env.WHATSAPP_APP_SECRET } }, { status: 401 }));
    await expect(createMetaGraph(env).checkApp(env.WHATSAPP_LEADS_ACCESS_TOKEN)).rejects.not.toThrow(env.WHATSAPP_APP_SECRET);
  });
  it("can verify a separate leads app without changing the embedded-signup app", async () => {
    const request = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ data: { app_id: env.META_APP_ID, is_valid: true } }));
    await createMetaGraph({ ...env, META_APP_ID: "2130581677532743", WHATSAPP_LEADS_APP_ID: env.META_APP_ID }).checkApp(env.WHATSAPP_LEADS_ACCESS_TOKEN);
    expect(new Headers(request.mock.calls[0][1]?.headers).get("authorization")).toBe(`Bearer ${env.META_APP_ID}|${env.WHATSAPP_APP_SECRET}`);
  });
  it("never relays a provider error containing a PIN or credential", async () => {
    const fakePin = "8".repeat(6);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ error: { code: 100, message: `${fakePin} ${env.WHATSAPP_LEADS_ACCESS_TOKEN}` } }, { status: 400 }));
    await expect(createMetaGraph(env).registerNumber("444444", fakePin, env.WHATSAPP_LEADS_ACCESS_TOKEN)).rejects.toThrow("HTTP 400 (code 100)");
  });
  it("uses the leads override for both sending and media, with the old shared-token fallback preserved", async () => {
    const request = vi.spyOn(globalThis, "fetch");
    request.mockResolvedValueOnce(Response.json({ messages: [{ id: "wamid.synthetic" }] }));
    expect(await createChatGraph(env).sendText("444444", "+919800000001", "Synthetic setup test")).toBe("wamid.synthetic");
    request.mockResolvedValueOnce(Response.json({ url: "https://lookaside.fbsbx.com/synthetic", mime_type: "audio/ogg" }));
    request.mockResolvedValueOnce(new Response(new Uint8Array([1])));
    await createChatGraph(env).download("synthetic-media");
    expect(request.mock.calls.every(([, init]) => new Headers(init?.headers).get("authorization") === "Bearer synthetic-leads-token")).toBe(true);
    request.mockResolvedValueOnce(Response.json({ messages: [{ id: "wamid.synthetic2" }] }));
    await createChatGraph({ WHATSAPP_ACCESS_TOKEN: "synthetic-shared-token" }).sendText("444444", "+919800000001", "Synthetic fallback test");
    expect(new Headers(request.mock.calls.at(-1)?.[1]?.headers).get("authorization")).toBe("Bearer synthetic-shared-token");
  });
});
