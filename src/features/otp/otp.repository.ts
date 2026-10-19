import { and, count, desc, eq, gt, gte, ilike, or, sql, type SQL } from "drizzle-orm";
import type { Db } from "@/db";
import { otpRequest } from "@/db/schema";
import { OTP_STATUSES, type OtpCounts, type OtpListFilter, type OtpRecord, type OtpRequestDTO, type OtpStatus } from "./otp.dto";

// A row still `created` past its expiry has timed out. Worked out here so nothing has to sweep old rows.
const effectiveStatus = sql<OtpStatus>`case when ${otpRequest.status} = 'created' and ${otpRequest.expiresAt} <= now() then 'timed_out' else ${otpRequest.status} end`;

const columns = {
  id: otpRequest.id,
  requestNo: otpRequest.requestNo,
  reference: otpRequest.reference,
  phone: otpRequest.phoneE164,
  countryCode: otpRequest.countryCode,
  status: effectiveStatus,
  attempts: otpRequest.attempts,
  maxAttempts: otpRequest.maxAttempts,
  createdAt: otpRequest.createdAt,
  expiresAt: otpRequest.expiresAt,
  sentAt: otpRequest.sentAt,
  verifiedAt: otpRequest.verifiedAt,
  failureReason: otpRequest.failureReason,
};

const statusWhere = (s: OtpStatus): SQL =>
  s === "timed_out"
    ? sql`${otpRequest.status} = 'created' and ${otpRequest.expiresAt} <= now()`
    : s === "created"
      ? sql`${otpRequest.status} = 'created' and ${otpRequest.expiresAt} > now()`
      : eq(otpRequest.status, s);

export function createOtpRepository(db: Db) {
  return {
    /** Retires any code still waiting for this number and stores the new one, in one transaction: only the newest code works. */
    async create(data: {
      reference: string;
      phone: string;
      countryCode: string | null;
      codeHash: string;
      maxAttempts: number;
      expiresAt: Date;
      apiKeyId: string | null;
    }): Promise<{ id: string }> {
      return db.transaction(async (tx) => {
        await tx
          .update(otpRequest)
          .set({ status: "replaced" })
          .where(and(eq(otpRequest.phoneE164, data.phone), eq(otpRequest.status, "created")));
        const [row] = await tx
          .insert(otpRequest)
          .values({
            reference: data.reference,
            phoneE164: data.phone,
            countryCode: data.countryCode,
            codeHash: data.codeHash,
            maxAttempts: data.maxAttempts,
            expiresAt: data.expiresAt,
            apiKeyId: data.apiKeyId,
          })
          .returning({ id: otpRequest.id });
        return row;
      });
    },

    async markSent(id: string, providerMessageId: string | null) {
      await db.update(otpRequest).set({ sentAt: new Date(), providerMessageId }).where(eq(otpRequest.id, id));
    },

    async markSendFailed(id: string, reason: string) {
      await db.update(otpRequest).set({ status: "send_failed", failureReason: reason.slice(0, 500) }).where(eq(otpRequest.id, id));
    },

    /** When this number was last sent a code, and how many codes it was sent since `since`. */
    async recentForPhone(phone: string, since: Date): Promise<{ sentLast: Date | null; sentSince: number }> {
      const [row] = await db
        .select({ sentLast: sql<Date | null>`max(${otpRequest.createdAt})`, sentSince: count() })
        .from(otpRequest)
        .where(and(eq(otpRequest.phoneE164, phone), gte(otpRequest.createdAt, since)));
      return { sentLast: row.sentLast ? new Date(row.sentLast) : null, sentSince: row.sentSince };
    },

    async findByReference(reference: string): Promise<OtpRecord | null> {
      const [row] = await db
        .select({ ...columns, codeHash: otpRequest.codeHash, storedStatus: otpRequest.status })
        .from(otpRequest)
        .where(eq(otpRequest.reference, reference))
        .limit(1);
      return row ?? null;
    },

    /**
     * Counts one guess, but only while the code is still open: waiting, not expired and with guesses left. One
     * statement, so parallel guesses cannot sneak past the attempt limit. Returns the new attempt count, or null when closed.
     */
    async registerAttempt(id: string): Promise<number | null> {
      const [row] = await db
        .update(otpRequest)
        .set({ attempts: sql`${otpRequest.attempts} + 1` })
        .where(
          and(
            eq(otpRequest.id, id),
            eq(otpRequest.status, "created"),
            gt(otpRequest.expiresAt, sql`now()`),
            sql`${otpRequest.attempts} < ${otpRequest.maxAttempts}`,
          ),
        )
        .returning({ attempts: otpRequest.attempts });
      return row?.attempts ?? null;
    },

    /** False when another request got there first, so one code can only ever verify once. */
    async markVerified(id: string): Promise<boolean> {
      const rows = await db
        .update(otpRequest)
        .set({ status: "verified", verifiedAt: new Date() })
        .where(and(eq(otpRequest.id, id), eq(otpRequest.status, "created")))
        .returning({ id: otpRequest.id });
      return rows.length > 0;
    },

    async markNotVerified(id: string) {
      await db.update(otpRequest).set({ status: "not_verified" }).where(and(eq(otpRequest.id, id), eq(otpRequest.status, "created")));
    },

    async list(filter: OtpListFilter): Promise<OtpRequestDTO[]> {
      return db
        .select(columns)
        .from(otpRequest)
        .where(listWhere(filter))
        .orderBy(desc(otpRequest.requestNo))
        .limit(filter.pageSize)
        .offset((filter.page - 1) * filter.pageSize);
    },

    async total(filter: OtpListFilter): Promise<number> {
      const [row] = await db.select({ n: count() }).from(otpRequest).where(listWhere(filter));
      return row.n;
    },

    /** Requests per status for the tabs, ignoring any status filter but honouring the search. */
    async counts(search?: string): Promise<OtpCounts> {
      const rows = await db
        .select({ status: effectiveStatus, n: count() })
        .from(otpRequest)
        .where(searchWhere(search))
        .groupBy(effectiveStatus);
      const out = Object.fromEntries(OTP_STATUSES.map((s) => [s, 0])) as Record<OtpStatus, number>;
      for (const r of rows) out[r.status] = r.n;
      return { ...out, all: Object.values(out).reduce((a, b) => a + b, 0) };
    },
  };
}

function searchWhere(search?: string): SQL | undefined {
  const q = search?.trim();
  if (!q) return undefined;
  const digits = q.replace(/\D/g, "");
  return or(ilike(otpRequest.reference, `%${q}%`), digits ? ilike(otpRequest.phoneE164, `%${digits}%`) : undefined);
}

function listWhere(filter: Pick<OtpListFilter, "status" | "search">): SQL | undefined {
  return and(filter.status ? statusWhere(filter.status) : undefined, searchWhere(filter.search));
}

export type OtpRepository = ReturnType<typeof createOtpRepository>;
