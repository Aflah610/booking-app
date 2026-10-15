import type { Actor } from "@/features/audit/audit.types";
import { DomainError } from "@/features/shared/errors";
import { isUuid } from "@/features/shared/validation";
import type { ServiceDTO } from "./catalog.dto";
import type { CatalogRepository } from "./catalog.repository";
import { serviceInput, type ServiceInput } from "./catalog.schemas";

/** Services: what clients can book. */
export function createCatalogService({ catalogRepo }: { catalogRepo: CatalogRepository }) {
  async function get(id: string): Promise<ServiceDTO> {
    const row = isUuid(id) ? await catalogRepo.findById(id) : null;
    if (!row) throw new DomainError("not_found", `Service ${id} not found`);
    return row;
  }

  return {
    get,
    list: (opts?: { activeOnly?: boolean }) => catalogRepo.list(opts),

    async create(actor: Actor, input: ServiceInput): Promise<ServiceDTO> {
      const data = serviceInput.parse(input);
      return catalogRepo.create(data, { actor, action: "create", entity: "service", details: { name: data.name } });
    },

    async update(actor: Actor, id: string, input: Partial<ServiceInput>): Promise<ServiceDTO> {
      const data = serviceInput.partial().parse(input);
      await get(id);
      const row = await catalogRepo.update(id, data, { actor, action: "update", entity: "service", entityId: id, details: data });
      if (!row) throw new DomainError("not_found", `Service ${id} not found`);
      return row;
    },
  };
}

export type CatalogService = ReturnType<typeof createCatalogService>;
