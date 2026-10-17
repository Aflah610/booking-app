import { app } from "@/features/container";
import { DomainError } from "@/features/shared/errors";
import { toE164 } from "@/features/shared/phone";
import { apiRoute } from "@/lib/api";
import { toCredits } from "@/features/packages/packages.dto";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/credits/quote?phone=+919876543210&serviceId=...&staffId=...
 * How a booking of this service would be paid from the client's credit right now, taking nothing:
 * `credits` and `walletPaise` it would use, and `duePaise` still to pay online. Leave out `staffId` to price the
 * service at its own price (a person with their own price may differ). Booking afterwards does exactly this.
 */
export const GET = apiRoute("website", async (req) => {
  const q = new URL(req.url).searchParams;
  const raw = q.get("phone");
  const serviceId = q.get("serviceId");
  if (!raw || !serviceId) throw new DomainError("invalid", "Pass ?phone= and ?serviceId=");
  const phone = toE164(raw);
  if (!phone) throw new DomainError("invalid", "Enter a valid phone number, e.g. +91 98765 43210");
  const { clients, packages } = app();
  const client = await clients.findByPhone(phone);
  if (!client) return { pricePaise: null, creditsUsed: 0, walletPaise: 0, duePaise: null, covered: false, uses: [] };
  const { pricePaise, plan, serviceName } = await packages.quote(client.id, { serviceId, staffId: q.get("staffId") });
  return {
    serviceName,
    pricePaise,
    creditsUsed: toCredits(plan.creditsMilli),
    walletPaise: plan.walletPaise,
    duePaise: plan.duePaise,
    covered: plan.covered,
    uses: [
      ...plan.packages.map((p) => ({ kind: "package", id: p.id, credits: toCredits(p.milli), coveredPaise: p.coveredPaise })),
      ...plan.lots.map((l) => ({ kind: "wallet", id: l.id, amountPaise: l.amountPaise })),
    ],
  };
});
