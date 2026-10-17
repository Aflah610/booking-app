import type { Actor } from "@/features/audit/audit.types";
import { DomainError } from "@/features/shared/errors";
import { isUuid } from "@/features/shared/validation";
import { WALLET_VALIDITY_DAYS, type PackageDTO } from "./packages.dto";
import type { PackagesRepository } from "./packages.repository";
import { packageInput, sellInput, topUpInput } from "./packages.schemas";

const DAY = 86_400_000;

/**
 * Packages (a number of sessions for one price) and wallet money (rupees paid in advance). Spending and giving
 * back credit happens inside the booking's own transaction (see packages.repository); this service is the
 * staff-facing side: what is on sale, what each client holds.
 */
export function createPackagesService(deps: {
  packagesRepo: PackagesRepository;
  /** What a service costs with a given person (their own price if they have one), for quotes. */
  priceFor: (serviceId: string, staffId: string | null) => Promise<{ serviceName: string; owes: boolean; pricePaise: number | null }>;
}) {
  const { packagesRepo, priceFor } = deps;

  async function checkServices(serviceIds: string[]) {
    if (!serviceIds.length) return;
    const known = await packagesRepo.knownServiceIds();
    const missing = serviceIds.filter((id) => !known.has(id));
    if (missing.length) throw new DomainError("invalid", `Service ${missing.join(", ")} not found`);
  }

  async function get(id: string): Promise<PackageDTO> {
    const row = isUuid(id) ? await packagesRepo.findById(id) : null;
    if (!row) throw new DomainError("not_found", `Package ${id} not found`);
    return row;
  }

  async function requireClient(clientId: string) {
    if (!isUuid(clientId) || !(await packagesRepo.clientExists(clientId))) throw new DomainError("not_found", `Client ${clientId} not found`);
  }

  return {
    get,
    list: () => packagesRepo.list(),

    async create(actor: Actor, input: unknown) {
      const data = packageInput.parse(input);
      await checkServices(data.serviceIds);
      return packagesRepo.create(data, { actor, action: "create", entity: "package" });
    },

    async update(actor: Actor, id: string, input: unknown) {
      const data = packageInput.parse(input);
      await get(id);
      await checkServices(data.serviceIds);
      // Clients who already bought it keep the sessions, price and expiry they bought with.
      return (await packagesRepo.update(id, data, { actor, action: "update", entity: "package", entityId: id }))!;
    },

    /** Records that a client bought a package. Payment itself is taken outside the app; the note says how. */
    async sell(actor: Actor, clientId: string, input: unknown, now = new Date()) {
      const data = sellInput.parse(input);
      await requireClient(clientId);
      const pkg = await get(data.packageId);
      if (!pkg.active) throw new DomainError("invalid", `Package "${pkg.name}" is not on sale`);
      const expiresAt = pkg.validityDays ? new Date(now.getTime() + pkg.validityDays * DAY) : null;
      return packagesRepo.sell(clientId, pkg, { expiresAt, paymentNote: data.paymentNote ?? null }, { actor, action: "sell_package", entity: "client_package" });
    },

    /** Adds wallet money. It is spent oldest-first and each top-up expires a year after it was added. */
    async topUp(actor: Actor, clientId: string, input: unknown, now = new Date()) {
      const data = topUpInput.parse(input);
      await requireClient(clientId);
      return packagesRepo.topUp(
        clientId,
        { amountPaise: data.amountPaise, expiresAt: new Date(now.getTime() + WALLET_VALIDITY_DAYS * DAY), note: data.note ?? null },
        { actor, action: "wallet_top_up", entity: "wallet_lot" },
      );
    },

    /**
     * How a booking of this service would be paid from the client's credit right now, without taking anything. Lets the
     * website show "this costs 1.5 credits" or "₹500 left to pay" before the client commits. It matches what booking does.
     */
    async quote(clientId: string, input: { serviceId: string; staffId?: string | null }, now = new Date()) {
      await requireClient(clientId);
      const price = await priceFor(input.serviceId, input.staffId ?? null);
      const plan = await packagesRepo.quote(clientId, { serviceId: input.serviceId, owes: price.owes, pricePaise: price.pricePaise, now });
      return { serviceName: price.serviceName, pricePaise: price.pricePaise, plan };
    },

    async summary(clientId: string, now = new Date()) {
      await requireClient(clientId);
      return packagesRepo.summary(clientId, now);
    },

    /** Credits looked up by the client's phone number, for the website. Unknown numbers simply have none. */
    allPackages: (clientId: string) => packagesRepo.allPackages(clientId),
    allLots: (clientId: string) => packagesRepo.allLots(clientId),
    usesForBooking: (bookingId: string) => packagesRepo.uses({ bookingId }),
    usesForClient: (clientId: string, limit = 50) => packagesRepo.uses({ clientId }, limit),
  };
}

export type PackagesService = ReturnType<typeof createPackagesService>;
