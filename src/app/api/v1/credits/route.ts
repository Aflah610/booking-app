import { app } from "@/features/container";
import { DomainError } from "@/features/shared/errors";
import { toE164 } from "@/features/shared/phone";
import { apiRoute } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/credits?phone=+919876543210
 * What this client can still spend: package sessions (with the services they cover and when they expire) and
 * wallet money. A phone number we have never seen simply has none. Bookings use it automatically unless the
 * website sends "useCredits": false.
 */
export const GET = apiRoute("website", async (req) => {
  const raw = new URL(req.url).searchParams.get("phone");
  if (!raw) throw new DomainError("invalid", "Pass the client's phone number as ?phone=");
  const phone = toE164(raw);
  if (!phone) throw new DomainError("invalid", "Enter a valid phone number, e.g. +91 98765 43210");
  const { clients, packages } = app();
  const client = await clients.findByPhone(phone);
  const none = { packages: [], walletPaise: 0, wallet: [] };
  if (!client) return none;
  const credit = await packages.summary(client.id);
  return {
    packages: credit.packages.map((p) => ({
      id: p.id,
      name: p.packageName,
      sessionsLeft: p.sessionsLeft,
      sessionsTotal: p.sessionsTotal,
      // Empty = any service.
      serviceIds: p.serviceIds,
      expiresAt: p.expiresAt?.toISOString() ?? null,
    })),
    walletPaise: credit.walletPaise,
    wallet: credit.lots.map((l) => ({ remainingPaise: l.remainingPaise, expiresAt: l.expiresAt.toISOString() })),
  };
});
