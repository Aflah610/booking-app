import { afterEach, describe, expect, it, vi } from "vitest";
import { createSenders } from "@/features/workflows/senders";
import { NotConfigured, type OutgoingMessage } from "@/features/workflows/workflows.dto";

afterEach(() => vi.unstubAllGlobals());
const reminder: OutgoingMessage = { channel: "whatsapp", to: "+919800000001", templateName: "booking_reminder_join", language: "en", params: ["Test", "https://book.example.test/join/test"] };

describe("CCD WhatsApp delivery", () => {
  it("uses the connected CCD number before the old environment number and preserves template parameters", async () => {
    const fetch = vi.fn(async (_url: string, _init: RequestInit) => Response.json({ messages: [{ id: "message-1" }] }));
    vi.stubGlobal("fetch", fetch);
    const send = createSenders({ WHATSAPP_PHONE_NUMBER_ID: "111111", WHATSAPP_ACCESS_TOKEN: "test-token" }, async () => "222222").whatsapp;
    await expect(send(reminder)).resolves.toEqual({ providerMessageId: "message-1" });
    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://graph.facebook.com/v21.0/222222/messages");
    expect(JSON.parse(String(init.body))).toMatchObject({ to: "919800000001", template: { name: "booking_reminder_join", components: [{ type: "body", parameters: [{ type: "text", text: "Test" }, { type: "text", text: "https://book.example.test/join/test" }] }] } });
  });

  it("retains the legacy sender until a CCD number is connected", async () => {
    const fetch = vi.fn(async (_url: string, _init: RequestInit) => Response.json({ messages: [{ id: "message-2" }] }));
    vi.stubGlobal("fetch", fetch);
    await createSenders({ WHATSAPP_PHONE_NUMBER_ID: "111111", WHATSAPP_ACCESS_TOKEN: "test-token" }).whatsapp(reminder);
    expect(fetch.mock.calls[0]?.[0]).toBe("https://graph.facebook.com/v21.0/111111/messages");
  });

  it("sends nothing without a number or a permanent sending token", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(createSenders({}, async () => "222222").whatsapp(reminder)).rejects.toBeInstanceOf(NotConfigured);
    await expect(createSenders({ WHATSAPP_ACCESS_TOKEN: "test-token" }).whatsapp(reminder)).rejects.toBeInstanceOf(NotConfigured);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reports Meta refusal instead of treating the reminder as sent", async () => {
    vi.stubGlobal("fetch", async () => Response.json({ error: { message: "Template not approved" } }, { status: 400 }));
    await expect(createSenders({ WHATSAPP_ACCESS_TOKEN: "test-token" }, async () => "222222").whatsapp(reminder)).rejects.toThrow("Template not approved");
  });
});
