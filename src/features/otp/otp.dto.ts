/** What an admin sees. "timed_out" is worked out from the expiry time, it is never stored. */
export const OTP_STATUSES = ["created", "verified", "not_verified", "timed_out", "replaced", "send_failed"] as const;
export type OtpStatus = (typeof OTP_STATUSES)[number];

export const OTP_STATUS_LABEL: Record<OtpStatus, string> = {
  created: "Created",
  verified: "Verified",
  not_verified: "Not verified",
  timed_out: "Timed out",
  replaced: "Replaced",
  send_failed: "Send failed",
};

/** A row of the admin report. Never carries the code or its hash. */
export type OtpRequestDTO = {
  id: string;
  requestNo: number;
  reference: string;
  phone: string;
  countryCode: string | null;
  status: OtpStatus;
  attempts: number;
  maxAttempts: number;
  createdAt: Date;
  expiresAt: Date;
  sentAt: Date | null;
  verifiedAt: Date | null;
  failureReason: string | null;
};

/** What the service needs to check a code. Stays inside the otp slice. */
export type OtpRecord = OtpRequestDTO & { codeHash: string; storedStatus: string };

export type OtpListFilter = { status?: OtpStatus; search?: string; page: number; pageSize: number };
export type OtpCounts = Record<OtpStatus, number> & { all: number };

/** Sends the code over WhatsApp. Lives in otp.sender.ts. */
export type OtpSender = (msg: { to: string; code: string; reference: string }) => Promise<{ providerMessageId?: string }>;

export type OtpSent = { reference: string; phone: string; expiresAt: string; expiresInSec: number };

export type OtpFailReason = "incorrect_code" | "expired" | "too_many_attempts" | "already_used" | "replaced" | "not_sent";
export type OtpVerified = { verified: boolean; reference: string; phone: string; reason?: OtpFailReason; attemptsLeft?: number };
