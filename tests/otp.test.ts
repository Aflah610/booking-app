import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { db, reset } from "./helpers";
import { createContainer } from "@/features/container";
import { UpstreamError } from "@/features/shared/errors";
import { OTP_RULES } from "@/features/otp/otp.service";
import { POST as sendRoute } from "@/app/api/v1/otp/send/route";
import { POST as verifyRoute } from "@/app/api/v1/otp/verify/route";
import { c as realContainer } from "./helpers";

const secret = "o".repeat(40);
let outbox: { to: string; code: string; reference: string }[] = [];
let failWith: Error | null = null;
const c = createContainer(db, {
  manageSecret: secret,
  otpSender: async (m) => {
    if (failWith) throw failWith;
    outbox.push(m);
    return { providerMessageId: "wamid.1" };
  },
});
const phone = "+919876543210";
const lastCode = () => outbox[outbox.length - 1].code;
const status = async (reference: string) => (await c.otp.report({ search: reference })).rows[0]?.status;
// Moves a request's clock back instead of sleeping.
const age = (reference: string, seconds: number) =>
  db.execute(sql`update otp_request set created_at = created_at - make_interval(secs => ${seconds}), expires_at = expires_at - make_interval(secs => ${seconds}) where reference = ${reference}`);

beforeEach(async () => {
  await reset();
  outbox = [];
  failWith = null;
});

describe("sending a code", () => {
  it("sends a 6 digit code to the normalised number and never returns it", async () => {
    const sent = await c.otp.send({ phone: "98765 43210" });
    expect(sent).toMatchObject({ phone, expiresInSec: 300 });
    expect(sent.reference).toMatch(/^OTP-REF-[0-9A-F]{10}$/);
    expect(outbox).toEqual([{ to: phone, code: expect.stringMatching(/^\d{6}$/), reference: sent.reference }]);
    expect(JSON.stringify(sent)).not.toContain(lastCode());
    expect(await status(sent.reference)).toBe("created");
  });

  it("reads a number without + using the country code sent beside it", async () => {
    const sent = await c.otp.send({ phone: "0412345678", countryCode: "61" });
    expect(sent.phone).toBe("+61412345678");
  });

  it("rejects a bad number", async () => {
    await expect(c.otp.send({ phone: "12" })).rejects.toMatchObject({ code: "invalid", message: expect.stringContaining('"12"') });
  });

  it("stores only a hash of the code", async () => {
    const sent = await c.otp.send({ phone });
    const rows = await db.execute(sql`select code_hash from otp_request where reference = ${sent.reference}`);
    expect(JSON.stringify(rows.rows)).not.toContain(lastCode());
  });

  it("makes a new code replace the one still waiting for that number", async () => {
    const first = await c.otp.send({ phone });
    const code1 = lastCode();
    await age(first.reference, OTP_RULES.resendCooldownSec + 1);
    const second = await c.otp.send({ phone });
    expect(await status(first.reference)).toBe("replaced");
    expect(await c.otp.verify({ reference: first.reference, code: code1 })).toMatchObject({ verified: false, reason: "replaced" });
    expect(await c.otp.verify({ reference: second.reference, code: lastCode() })).toMatchObject({ verified: true });
  });

  it("makes the same number wait before asking again", async () => {
    await c.otp.send({ phone });
    await expect(c.otp.send({ phone })).rejects.toMatchObject({ code: "conflict", details: { retryAfterSec: expect.any(Number) } });
  });

  it("caps codes per number per hour", async () => {
    for (let i = 0; i < OTP_RULES.maxSendsPerHour; i++) {
      const s = await c.otp.send({ phone });
      await age(s.reference, OTP_RULES.resendCooldownSec + 1);
    }
    await expect(c.otp.send({ phone })).rejects.toMatchObject({ code: "conflict", message: expect.stringContaining("Too many codes") });
  });

  it("keeps a failed send visible in the report and tells the caller", async () => {
    failWith = new UpstreamError("not_configured", "OTP sending isn't set up yet");
    await expect(c.otp.send({ phone })).rejects.toBeInstanceOf(UpstreamError);
    const { rows } = await c.otp.report({});
    expect(rows).toEqual([expect.objectContaining({ status: "send_failed", failureReason: "OTP sending isn't set up yet" })]);
  });

  it("wraps an unexpected sender error as a delivery failure", async () => {
    failWith = new Error("socket hang up");
    await expect(c.otp.send({ phone })).rejects.toMatchObject({ code: "delivery_failed" });
  });
});

describe("verifying a code", () => {
  it("accepts the right code once", async () => {
    const { reference } = await c.otp.send({ phone });
    expect(await c.otp.verify({ reference, code: lastCode(), phone })).toEqual({ verified: true, reference, phone });
    expect(await status(reference)).toBe("verified");
    expect(await c.otp.verify({ reference, code: lastCode() })).toMatchObject({ verified: false, reason: "already_used" });
  });

  it("counts wrong guesses and burns the code after the limit", async () => {
    const { reference } = await c.otp.send({ phone });
    const wrong = lastCode() === "000000" ? "111111" : "000000";
    for (let left = OTP_RULES.maxAttempts - 1; left >= 1; left--) {
      expect(await c.otp.verify({ reference, code: wrong })).toMatchObject({ verified: false, reason: "incorrect_code", attemptsLeft: left });
    }
    expect(await c.otp.verify({ reference, code: wrong })).toMatchObject({ verified: false, reason: "too_many_attempts", attemptsLeft: 0 });
    // Even the right code is refused now.
    expect(await c.otp.verify({ reference, code: lastCode() })).toMatchObject({ verified: false, reason: "too_many_attempts" });
    expect(await status(reference)).toBe("not_verified");
  });

  it("times out after the expiry without anything sweeping the table", async () => {
    const { reference } = await c.otp.send({ phone });
    await age(reference, OTP_RULES.ttlSec + 1);
    expect(await status(reference)).toBe("timed_out");
    expect(await c.otp.verify({ reference, code: lastCode() })).toMatchObject({ verified: false, reason: "expired" });
  });

  it("lets only one of two parallel right guesses succeed", async () => {
    const { reference } = await c.otp.send({ phone });
    const results = await Promise.all([c.otp.verify({ reference, code: lastCode() }), c.otp.verify({ reference, code: lastCode() })]);
    expect(results.filter((r) => r.verified)).toHaveLength(1);
  });

  it("answers 404 for an unknown reference or a different phone number", async () => {
    await expect(c.otp.verify({ reference: "OTP-REF-NOPE", code: "123456" })).rejects.toMatchObject({ code: "not_found", message: expect.stringContaining("OTP-REF-NOPE") });
    const { reference } = await c.otp.send({ phone });
    await expect(c.otp.verify({ reference, code: lastCode(), phone: "+919000000000" })).rejects.toMatchObject({ code: "not_found" });
  });

  it("rejects a code that is not 6 digits", async () => {
    await expect(c.otp.verify({ reference: "x", code: "12ab" })).rejects.toThrow();
  });
});

describe("the admin report", () => {
  it("filters by status, counts each, and searches by phone or reference", async () => {
    const a = await c.otp.send({ phone });
    await c.otp.verify({ reference: a.reference, code: lastCode() });
    const b = await c.otp.send({ phone: "+919111111111" });
    await age(b.reference, OTP_RULES.ttlSec + 1);
    await c.otp.send({ phone: "+919222222222" });

    const all = await c.otp.report({});
    expect(all.counts).toMatchObject({ all: 3, verified: 1, timed_out: 1, created: 1, not_verified: 0 });
    expect(all.rows.map((r) => r.requestNo)).toEqual([3, 2, 1]);
    expect((await c.otp.report({ status: "timed_out" })).rows.map((r) => r.reference)).toEqual([b.reference]);
    expect((await c.otp.report({ status: "created" })).rows).toHaveLength(1);
    expect((await c.otp.report({ search: "91111" })).rows.map((r) => r.reference)).toEqual([b.reference]);
    expect(all.rows[0]).not.toHaveProperty("codeHash");
  });
});

describe("/api/v1/otp", () => {
  const post = (handler: typeof sendRoute, body: unknown, key?: string) =>
    handler(new NextRequest("http://localhost/api/v1/otp/x", { method: "POST", body: JSON.stringify(body), headers: key ? { authorization: `Bearer ${key}` } : {} }));

  it("needs an API key with the otp scope", async () => {
    expect((await post(sendRoute, { phone })).status).toBe(401);
    const { key } = await realContainer.apiKeys.create({ name: "Site", scopes: ["website"] });
    expect((await post(sendRoute, { phone }, key)).status).toBe(403);
    expect((await post(verifyRoute, { reference: "x", code: "123456" }, key)).status).toBe(403);
  });

  it("answers 503 not_configured while the Meta settings are empty, and 400 for bad input", async () => {
    const { key } = await realContainer.apiKeys.create({ name: "OTP", scopes: ["otp"] });
    const res = await post(sendRoute, { phone }, key);
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: { code: "not_configured" } });
    expect((await post(sendRoute, { phone: "" }, key)).status).toBe(400);
    expect((await post(verifyRoute, { reference: "OTP-REF-NOPE", code: "123456" }, key)).status).toBe(404);
  });
});
