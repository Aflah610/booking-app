import type { Actor } from "@/features/audit/audit.types";
import { DomainError } from "@/features/shared/errors";
import { isUuid } from "@/features/shared/validation";
import { clientReference, type ClientDTO } from "./clients.dto";
import type { ClientsRepository } from "./clients.repository";
import { assignTherapistInput, clientCreateInput, clientProfileInput, clientUpdateInput } from "./clients.schemas";

export function createClientsService({ clientsRepo }: { clientsRepo: ClientsRepository }) {
  async function get(id: string): Promise<ClientDTO> {
    const row = isUuid(id) ? await clientsRepo.findById(id) : null;
    if (!row) throw new DomainError("not_found", `Client ${id} not found`);
    return row;
  }

  async function save(actor: Actor, id: string, data: Record<string, unknown>) {
    await get(id);
    // Contact details are personal data: record which fields changed, not their values.
    const row = await clientsRepo.update(id, data, {
      actor,
      action: "update",
      entity: "client",
      entityId: id,
      details: { fields: Object.keys(data) },
    });
    if (!row) throw new DomainError("not_found", `Client ${id} not found`);
    return row;
  }

  return {
    get,
    findByPhone: (phoneE164: string) => clientsRepo.findByPhone(phoneE164),
    list: (opts?: { q?: string; limit?: number; relevance?: boolean }) => clientsRepo.list(opts),
    therapistHistory: (clientId: string) => clientsRepo.therapistHistory(clientId),

    /** Adds a client by hand. Clients are matched by mobile number, so a number already on file is refused. */
    async create(actor: Actor, input: unknown): Promise<ClientDTO> {
      const data = clientCreateInput.parse(input);
      const existing = await clientsRepo.findByPhone(data.phone);
      if (existing) throw new DomainError("conflict", `A client with mobile ${data.phone} already exists: ${existing.name} (${clientReference(existing.number)})`);
      const { phone, ...rest } = data;
      // Personal data: the audit row says a client was added, not who.
      return clientsRepo.create({ ...rest, email: rest.email ?? null, phoneE164: phone, registeredBy: actor.staffId ?? null },{ actor, action: "create", entity: "client" });
    },

    // Async, so bad input comes back as a rejected promise like every other failure.
    update: async (actor: Actor, id: string, input: unknown) => save(actor, id, clientUpdateInput.parse(input)),

    /** The full edit form: contact details plus every profile field. */
    updateProfile: async (actor: Actor, id: string, input: unknown) => save(actor, id, clientProfileInput.parse(input)),

    async assignTherapist(actor: Actor, clientId: string, input: unknown, now = new Date()) {
      const { staffId, reason } = assignTherapistInput.parse(input);
      await get(clientId);
      const active = await clientsRepo.staffIsActive(staffId);
      if (active === null) throw new DomainError("not_found", `Staff member ${staffId} not found`);
      if (!active) throw new DomainError("invalid", `Staff member ${staffId} is not active`);
      const current = await clientsRepo.currentTherapistId(clientId);
      if (current === staffId) throw new DomainError("conflict", `Staff member ${staffId} is already this client's therapist`);
      // Someone reading the history later needs to know why the client moved.
      if (current && !reason) throw new DomainError("invalid", `Give a reason for moving client ${clientId} to another therapist`);
      await clientsRepo.assignTherapist(clientId, { staffId, assignedBy: actor.staffId ?? null, reason, at: now }, {
        actor,
        action: "assign_therapist",
        entity: "client",
        entityId: clientId,
        details: { staffId, previousStaffId: current },
      });
    },
  };
}

export type ClientsService = ReturnType<typeof createClientsService>;
