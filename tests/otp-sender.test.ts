import { afterEach, expect, it, vi } from "vitest";
import { createOtpSender } from "@/features/otp/otp.sender";

afterEach(() => vi.unstubAllGlobals());
const env = { OTP_META_API_URL: "https://graph.facebook.com/v25.0/synthetic/messages", OTP_META_TOKEN: "synthetic-token", OTP_TEMPLATE_NAME: "mindlap_verification_code" };
it("uses Creator's English authentication template with a matching body and Copy Code button", async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json({ messages: [{ id: "synthetic-message" }] }));
  vi.stubGlobal("fetch", fetcher);
  expect(await createOtpSender(env)({ to: "+910000000000", code: "123456", reference: "synthetic" })).toEqual({ providerMessageId: "synthetic-message" });
  const [url, options] = fetcher.mock.calls[0];
  expect(url).toBe(env.OTP_META_API_URL);
  const payload = JSON.parse(options.body);
  expect(payload.template).toMatchObject({ name: "mindlap_verification_code", language: { code: "en" } });
  expect(payload.template.components.map((c: { parameters: { text: string }[] }) => c.parameters[0].text)).toEqual(["123456", "123456"]);
});
it("omits provider error text that could echo codes or credentials", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: { code: 100, message: "sensitive synthetic OTP 123456 token synthetic-token" } }, { status: 400 })));
  await expect(createOtpSender(env)({ to: "+910000000000", code: "123456", reference: "synthetic" })).rejects.toMatchObject({ message: "WhatsApp refused the code: HTTP 400 (code 100)" });
});
