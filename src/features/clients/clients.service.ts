import type { Actor } from "@/features/audit/audit.types";
import { DomainError } from "@/features/shared/errors";
import { isUuid } from "@/features/shared/validation";
import type { ClientDTO } from "./clients.dto";
import type { ClientsRepository } from "./clients.repository";
import { clientUpdateInput } from "./clients.schemas";

export function createClientsService({ clientsRepo }: { clientsRepo: ClientsRepository }) {
  async function get(id: string): Promise<ClientDTO> {
    const row = isUuid(id) ? await clientsRepo.findById(id) : null;
    if (!row) throw new DomainError("not_found", `Client ${id} not found`);
    return row;
  }

  return {
    get,
    list: (opts?: { q?: string; limit?: number }) => clientsRepo.list(opts),

    async update(actor: Actor, id: string, input: unknown) {
      const data = clientUpdateInput.parse(input);
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
    },
  };
}

export type ClientsService = ReturnType<typeof createClientsService>;
