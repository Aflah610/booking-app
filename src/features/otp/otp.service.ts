import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { DomainError, UpstreamError, isUpstreamError } from "../shared/errors";
import { toE164 } from "../shared/phone";
import type { OtpFailReason, OtpListFilter, OtpRecord, OtpSender, OtpSent, OtpStatus, OtpVerified } from "./otp.dto";
import type { OtpRepository } from "./otp.repository";
import { sendOtpInput, verifyOtpInput } from "./otp.schemas";

export const OTP_RULES = {
  /** How long a code works. */
  ttlSec: 5 * 60,
  /** Wrong guesses allowed before the code is burnt. */
  maxAttempts: 5,
  /** Gap before the same number may ask for another code. */
  resendCooldownSec: 30,
  /** Codes one number may be sent per hour, so the endpoint cannot be used to spam someone's WhatsApp. */
  maxSendsPerHour: 5,
} as const;

/** Why a code that is no longer open cannot be used. */
function closedReason(r: OtpRecord, now: Date): OtpFailReason {
  if (r.storedStatus === "verified") return "already_used";
  if (r.storedStatus === "replaced") return "replaced";
  if (r.storedStatus === "send_failed") return "not_sent";
  if (r.storedStatus === "not_verified" || r.attempts >= r.maxAttempts) return "too_many_attempts";
  return r.expiresAt <= now ? "expired" : "incorrect_code";
}

export function createOtpService({
  otpRepo,
  send,
  secret,
  now = () => new Date(),
}: {
  otpRepo: OtpRepository;
  send: OtpSender;
  /** Keys the hash of each code. Without it nothing can be sent or verified. */
  secret: string | undefined;
  now?: () => Date;
}) {
  // Keyed with the reference too, so the same code on two requests never hashes alike.
  const hashCode = (reference: string, code: string) => {
    if (!secret) throw new UpstreamError("not_configured", "OTP needs AUTH_SECRET to be set so codes can be stored safely");
    return createHmac("sha256", secret).update(`${reference}:${code}`).digest("hex");
  };

  return {
    /** Creates a code, texts it to the client's WhatsApp and returns the reference to verify it with. The code itself is never returned. */
    async send(raw: unknown, actor: { apiKeyId: string | null } = { apiKeyId: null }): Promise<OtpSent> {
      const input = sendOtpInput.parse(raw);
      const phone = toE164(input.countryCode && !input.phone.trim().startsWith("+") ? `+${input.countryCode}${input.phone.replace(/\D/g, "").replace(/^0+/, "")}` : input.phone);
      if (!phone) throw new DomainError("invalid", `"${input.phone}" is not a valid phone number, e.g. +91 98765 43210`);

      const at = now();
      const recent = await otpRepo.recentForPhone(phone, new Date(at.getTime() - 3_600_000));
      if (recent.sentLast) {
        const wait = Math.ceil((recent.sentLast.getTime() + OTP_RULES.resendCooldownSec * 1000 - at.getTime()) / 1000);
        if (wait > 0) throw new DomainError("conflict", `A code was just sent to ${phone}. Try again in ${wait} seconds`, { retryAfterSec: wait });
      }
      if (recent.sentSince >= OTP_RULES.maxSendsPerHour) {
        throw new DomainError("conflict", `Too many codes sent to ${phone} in the last hour. Try again later`);
      }

      const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
      const reference = `OTP-REF-${randomBytes(5).toString("hex").toUpperCase()}`;
      const expiresAt = new Date(at.getTime() + OTP_RULES.ttlSec * 1000);
      const row = await otpRepo.create({
        reference,
        phone,
        countryCode: input.countryCode ?? null,
        codeHash: hashCode(reference, code),
        maxAttempts: OTP_RULES.maxAttempts,
        expiresAt,
        apiKeyId: actor.apiKeyId,
      });
      try {
        const sent = await send({ to: phone, code, reference });
        await otpRepo.markSent(row.id, sent.providerMessageId ?? null);
      } catch (err) {
        // Keep the row so the admin report shows what failed, then tell the caller.
        const message = err instanceof Error ? err.message : "Unknown error";
        await otpRepo.markSendFailed(row.id, message);
        if (isUpstreamError(err)) throw err;
        throw new UpstreamError("delivery_failed", `The code could not be sent: ${message}`);
      }
      return { reference, phone, expiresAt: expiresAt.toISOString(), expiresInSec: OTP_RULES.ttlSec };
    },

    /** A wrong or late code is a normal answer (`verified: false` with a reason), not an error. An unknown reference is a 404. */
    async verify(raw: unknown): Promise<OtpVerified> {
      const input = verifyOtpInput.parse(raw);
      const record = await otpRepo.findByReference(input.reference);
      const wanted = input.phone ? toE164(input.phone) : null;
      if (!record || (input.phone && record.phone !== wanted)) {
        throw new DomainError("not_found", `OTP reference ${input.reference} not found${input.phone ? " for that phone number" : ""}`);
      }
      const base = { reference: record.reference, phone: record.phone };
      const fail = (reason: OtpFailReason, attemptsLeft?: number): OtpVerified => ({ verified: false, ...base, reason, ...(attemptsLeft === undefined ? {} : { attemptsLeft }) });

      const attempts = await otpRepo.registerAttempt(record.id);
      if (attempts === null) return fail(closedReason(record, now()));

      const expected = Buffer.from(record.codeHash, "hex");
      const actual = Buffer.from(hashCode(record.reference, input.code), "hex");
      if (expected.length === actual.length && timingSafeEqual(expected, actual)) {
        // Two right guesses at the same instant: only the first flips the status.
        return (await otpRepo.markVerified(record.id)) ? { verified: true, ...base } : fail("already_used");
      }
      const left = record.maxAttempts - attempts;
      if (left <= 0) {
        await otpRepo.markNotVerified(record.id);
        return fail("too_many_attempts", 0);
      }
      return fail("incorrect_code", left);
    },

    /** The admin report: a page of requests, how many there are in total, and the count behind each status tab. */
    async report(filter: { status?: OtpStatus; search?: string; page?: number }) {
      const f: OtpListFilter = { status: filter.status, search: filter.search, page: Math.max(1, filter.page ?? 1), pageSize: 50 };
      const [rows, total, counts] = await Promise.all([otpRepo.list(f), otpRepo.total(f), otpRepo.counts(filter.search)]);
      return { rows, total, counts, page: f.page, pageSize: f.pageSize };
    },
  };
}

export type OtpService = ReturnType<typeof createOtpService>;
