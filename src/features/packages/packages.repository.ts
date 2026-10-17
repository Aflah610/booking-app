import { and, asc, desc, eq, gt, isNull, or, sql } from "drizzle-orm";
import type { Db, Tx } from "@/db";
import { booking, client, clientPackage, creditUse, service, servicePackage, walletLot } from "@/db/schema";
import { writeAudit } from "@/features/audit/audit.repository";
import type { AuditEntry } from "@/features/audit/audit.types";
import {
  sessionValuePaise,
  type ClientPackageDTO,
  type CreditSummaryDTO,
  type CreditTaken,
  type CreditUseDTO,
  type PackageDTO,
  type WalletLotDTO,
} from "./packages.dto";
import type { PackageData } from "./packages.schemas";

const packageColumns = {
  id: servicePackage.id,
  name: servicePackage.name,
  serviceIds: servicePackage.serviceIds,
  sessions: servicePackage.sessions,
  validityDays: servicePackage.validityDays,
  pricePaise: servicePackage.pricePaise,
  active: servicePackage.active,
};

const clientPackageColumns = {
  id: clientPackage.id,
  clientId: clientPackage.clientId,
  packageId: clientPackage.packageId,
  packageName: servicePackage.name,
  serviceIds: servicePackage.serviceIds,
  sessionsTotal: clientPackage.sessionsTotal,
  sessionsLeft: clientPackage.sessionsLeft,
  pricePaise: clientPackage.pricePaise,
  expiresAt: clientPackage.expiresAt,
  paymentNote: clientPackage.paymentNote,
  createdAt: clientPackage.createdAt,
};

const lotColumns = {
  id: walletLot.id,
  amountPaise: walletLot.amountPaise,
  remainingPaise: walletLot.remainingPaise,
  expiresAt: walletLot.expiresAt,
  note: walletLot.note,
  createdAt: walletLot.createdAt,
};

/**
 * Spends credit for a booking, inside the booking's own transaction so the booking and what paid for it
 * succeed or fail together. A package session is used first (the one expiring soonest that covers the
 * service); otherwise wallet money, oldest expiry first, up to the price. Rows are locked, so two bookings
 * made at the same moment can never spend the same session or rupee twice.
 */
export async function applyCredits(
  tx: Tx,
  t: { bookingId: string; clientId: string; serviceId: string; owes: boolean; pricePaise: number | null; now: Date },
): Promise<CreditTaken> {
  if (t.owes) {
    const [pkg] = await tx
      .select({ id: clientPackage.id, total: clientPackage.sessionsTotal, price: clientPackage.pricePaise })
      .from(clientPackage)
      .innerJoin(servicePackage, eq(servicePackage.id, clientPackage.packageId))
      .where(
        and(
          eq(clientPackage.clientId, t.clientId),
          gt(clientPackage.sessionsLeft, 0),
          or(isNull(clientPackage.expiresAt), gt(clientPackage.expiresAt, t.now)),
          sql`(cardinality(${servicePackage.serviceIds}) = 0 or ${t.serviceId}::uuid = any(${servicePackage.serviceIds}))`,
        ),
      )
      .orderBy(sql`${clientPackage.expiresAt} asc nulls last`, asc(clientPackage.createdAt))
      .limit(1)
      .for("update", { of: clientPackage });
    if (pkg) {
      await tx.update(clientPackage).set({ sessionsLeft: sql`${clientPackage.sessionsLeft} - 1` }).where(eq(clientPackage.id, pkg.id));
      await tx.insert(creditUse).values({
        bookingId: t.bookingId,
        clientPackageId: pkg.id,
        sessions: 1,
        valuePaise: sessionValuePaise(pkg.price, pkg.total),
      });
      await tx.update(booking).set({ creditSession: true }).where(eq(booking.id, t.bookingId));
      return { session: true, walletPaise: 0 };
    }
  }

  let need = t.pricePaise && t.pricePaise > 0 ? t.pricePaise : 0;
  let taken = 0;
  if (need > 0) {
    const lots = await tx
      .select({ id: walletLot.id, remaining: walletLot.remainingPaise })
      .from(walletLot)
      .where(and(eq(walletLot.clientId, t.clientId), gt(walletLot.remainingPaise, 0), gt(walletLot.expiresAt, t.now)))
      .orderBy(asc(walletLot.expiresAt), asc(walletLot.createdAt))
      .for("update");
    for (const lot of lots) {
      if (need === 0) break;
      const take = Math.min(lot.remaining, need);
      await tx.update(walletLot).set({ remainingPaise: sql`${walletLot.remainingPaise} - ${take}` }).where(eq(walletLot.id, lot.id));
      await tx.insert(creditUse).values({ bookingId: t.bookingId, walletLotId: lot.id, amountPaise: take, valuePaise: take });
      need -= take;
      taken += take;
    }
    if (taken) await tx.update(booking).set({ creditPaise: taken }).where(eq(booking.id, t.bookingId));
  }
  return { session: false, walletPaise: taken };
}

/**
 * Gives back whatever a booking took. A session or amount whose package or lot has expired in the meantime is not
 * restored (it would be unusable), but the use is still marked returned so it is never handled twice.
 */
export async function returnCredits(tx: Tx, bookingId: string, now: Date): Promise<CreditTaken> {
  const uses = await tx
    .select({
      id: creditUse.id,
      packageId: creditUse.clientPackageId,
      lotId: creditUse.walletLotId,
      amount: creditUse.amountPaise,
    })
    .from(creditUse)
    .where(and(eq(creditUse.bookingId, bookingId), isNull(creditUse.returnedAt)))
    .for("update");
  const back: CreditTaken = { session: false, walletPaise: 0 };
  for (const u of uses) {
    if (u.packageId) {
      const restored = await tx
        .update(clientPackage)
        .set({ sessionsLeft: sql`${clientPackage.sessionsLeft} + 1` })
        .where(and(eq(clientPackage.id, u.packageId), or(isNull(clientPackage.expiresAt), gt(clientPackage.expiresAt, now))))
        .returning({ id: clientPackage.id });
      if (restored.length) back.session = true;
    } else if (u.lotId) {
      const restored = await tx
        .update(walletLot)
        .set({ remainingPaise: sql`${walletLot.remainingPaise} + ${u.amount}` })
        .where(and(eq(walletLot.id, u.lotId), gt(walletLot.expiresAt, now)))
        .returning({ id: walletLot.id });
      if (restored.length) back.walletPaise += u.amount;
    }
    await tx.update(creditUse).set({ returnedAt: now }).where(eq(creditUse.id, u.id));
  }
  if (uses.length) await tx.update(booking).set({ creditSession: false, creditPaise: 0 }).where(eq(booking.id, bookingId));
  return back;
}

/** A moved booking is a new row; what paid for the old one now pays for the new one. */
export async function moveCredits(tx: Tx, fromBookingId: string, toBookingId: string) {
  await tx.update(creditUse).set({ bookingId: toBookingId }).where(and(eq(creditUse.bookingId, fromBookingId), isNull(creditUse.returnedAt)));
  const [old] = await tx.select({ s: booking.creditSession, p: booking.creditPaise }).from(booking).where(eq(booking.id, fromBookingId));
  if (old) {
    await tx.update(booking).set({ creditSession: old.s, creditPaise: old.p }).where(eq(booking.id, toBookingId));
    await tx.update(booking).set({ creditSession: false, creditPaise: 0 }).where(eq(booking.id, fromBookingId));
  }
}

export function createPackagesRepository(db: Db) {
  return {
    list(): Promise<PackageDTO[]> {
      return db.select(packageColumns).from(servicePackage).orderBy(desc(servicePackage.active), asc(servicePackage.name));
    },

    async findById(id: string): Promise<PackageDTO | null> {
      const [row] = await db.select(packageColumns).from(servicePackage).where(eq(servicePackage.id, id));
      return row ?? null;
    },

    create(data: PackageData, audit: Omit<AuditEntry, "entityId">): Promise<PackageDTO> {
      return db.transaction(async (tx) => {
        const [row] = await tx.insert(servicePackage).values(data).returning(packageColumns);
        await writeAudit(tx, { ...audit, entityId: row.id });
        return row;
      });
    },

    update(id: string, data: PackageData, audit: AuditEntry): Promise<PackageDTO | null> {
      return db.transaction(async (tx) => {
        const [row] = await tx.update(servicePackage).set(data).where(eq(servicePackage.id, id)).returning(packageColumns);
        if (row) await writeAudit(tx, audit);
        return row ?? null;
      });
    },

    async knownServiceIds(): Promise<Set<string>> {
      return new Set((await db.select({ id: service.id }).from(service)).map((r) => r.id));
    },

    /** Records a sale: the client now holds the package's sessions, priced and dated as of today. */
    sell(clientId: string, pkg: PackageDTO, v: { expiresAt: Date | null; paymentNote: string | null }, audit: Omit<AuditEntry, "entityId">): Promise<string> {
      return db.transaction(async (tx) => {
        const [row] = await tx
          .insert(clientPackage)
          .values({
            clientId,
            packageId: pkg.id,
            sessionsLeft: pkg.sessions,
            sessionsTotal: pkg.sessions,
            pricePaise: pkg.pricePaise,
            expiresAt: v.expiresAt,
            paymentNote: v.paymentNote,
          })
          .returning({ id: clientPackage.id });
        await writeAudit(tx, { ...audit, entityId: row.id, details: { ...audit.details, clientId, packageId: pkg.id, pricePaise: pkg.pricePaise } });
        return row.id;
      });
    },

    topUp(clientId: string, v: { amountPaise: number; expiresAt: Date; note: string | null }, audit: Omit<AuditEntry, "entityId">): Promise<string> {
      return db.transaction(async (tx) => {
        const [row] = await tx
          .insert(walletLot)
          .values({ clientId, amountPaise: v.amountPaise, remainingPaise: v.amountPaise, expiresAt: v.expiresAt, note: v.note })
          .returning({ id: walletLot.id });
        await writeAudit(tx, { ...audit, entityId: row.id, details: { ...audit.details, clientId, amountPaise: v.amountPaise } });
        return row.id;
      });
    },

    /** Everything this client can still spend at `now`. */
    async summary(clientId: string, now: Date): Promise<CreditSummaryDTO> {
      const [packages, lots] = await Promise.all([
        db
          .select(clientPackageColumns)
          .from(clientPackage)
          .innerJoin(servicePackage, eq(servicePackage.id, clientPackage.packageId))
          .where(and(eq(clientPackage.clientId, clientId), gt(clientPackage.sessionsLeft, 0), or(isNull(clientPackage.expiresAt), gt(clientPackage.expiresAt, now))))
          .orderBy(sql`${clientPackage.expiresAt} asc nulls last`, asc(clientPackage.createdAt)),
        db
          .select(lotColumns)
          .from(walletLot)
          .where(and(eq(walletLot.clientId, clientId), gt(walletLot.remainingPaise, 0), gt(walletLot.expiresAt, now)))
          .orderBy(asc(walletLot.expiresAt), asc(walletLot.createdAt)),
      ]);
      return { packages, lots, walletPaise: lots.reduce((n, l) => n + l.remainingPaise, 0) };
    },

    /** Every package the client has bought, including used-up and expired ones. */
    allPackages(clientId: string): Promise<ClientPackageDTO[]> {
      return db
        .select(clientPackageColumns)
        .from(clientPackage)
        .innerJoin(servicePackage, eq(servicePackage.id, clientPackage.packageId))
        .where(eq(clientPackage.clientId, clientId))
        .orderBy(desc(clientPackage.createdAt));
    },

    allLots(clientId: string): Promise<WalletLotDTO[]> {
      return db.select(lotColumns).from(walletLot).where(eq(walletLot.clientId, clientId)).orderBy(desc(walletLot.createdAt));
    },

    /** What one booking, or a client's recent bookings, were paid with. */
    uses(filter: { bookingId?: string; clientId?: string }, limit = 50): Promise<CreditUseDTO[]> {
      return db
        .select({
          id: creditUse.id,
          bookingId: creditUse.bookingId,
          bookingNumber: booking.number,
          kind: sql<"package" | "wallet">`case when ${creditUse.clientPackageId} is not null then 'package' else 'wallet' end`,
          label: sql<string>`coalesce(${servicePackage.name}, 'Wallet')`,
          sessions: creditUse.sessions,
          amountPaise: creditUse.amountPaise,
          valuePaise: creditUse.valuePaise,
          returnedAt: creditUse.returnedAt,
          createdAt: creditUse.createdAt,
        })
        .from(creditUse)
        .innerJoin(booking, eq(booking.id, creditUse.bookingId))
        .leftJoin(clientPackage, eq(clientPackage.id, creditUse.clientPackageId))
        .leftJoin(servicePackage, eq(servicePackage.id, clientPackage.packageId))
        .where(
          and(
            filter.bookingId ? eq(creditUse.bookingId, filter.bookingId) : undefined,
            filter.clientId ? eq(booking.clientId, filter.clientId) : undefined,
          ),
        )
        .orderBy(desc(creditUse.createdAt))
        .limit(limit);
    },

    async clientExists(id: string): Promise<boolean> {
      const [row] = await db.select({ id: client.id }).from(client).where(eq(client.id, id));
      return Boolean(row);
    },
  };
}

export type PackagesRepository = ReturnType<typeof createPackagesRepository>;
