import type { Actor } from "@/features/audit/audit.types";
import { DomainError } from "@/features/shared/errors";
import { isUuid } from "@/features/shared/validation";
import type { StaffDTO } from "./staff.dto";
import type { StaffRepository } from "./staff.repository";
import { staffInput, type StaffInput } from "./staff.schemas";

export function createStaffService({ staffRepo }: { staffRepo: StaffRepository }) {
  async function get(id: string): Promise<StaffDTO> {
    const row = isUuid(id) ? await staffRepo.findById(id) : null;
    if (!row) throw new DomainError("not_found", `Staff member ${id} not found`);
    return row;
  }

  async function create(actor: Actor, input: StaffInput): Promise<StaffDTO> {
    const data = staffInput.parse(input);
    if (await staffRepo.findByEmail(data.email)) {
      throw new DomainError("conflict", `A staff member with email ${data.email} already exists`);
    }
    return staffRepo.create(data, {
      actor,
      action: "create",
      entity: "staff",
      details: { email: data.email, role: data.role },
    });
  }

  async function update(actor: Actor, id: string, input: Partial<StaffInput>): Promise<StaffDTO> {
    const data = staffInput.partial().parse(input);
    await get(id);
    if (data.email) {
      const other = await staffRepo.findByEmail(data.email);
      if (other && other.id !== id) {
        throw new DomainError("conflict", `A staff member with email ${data.email} already exists`);
      }
    }
    const row = await staffRepo.update(id, data, { actor, action: "update", entity: "staff", entityId: id, details: data });
    if (!row) throw new DomainError("not_found", `Staff member ${id} not found`);
    return row;
  }

  return {
    get,
    create,
    update,
    list: () => staffRepo.list(),
    serviceIds: (staffId: string) => staffRepo.serviceIds(staffId),
    listBookableForService: (serviceId: string) => staffRepo.listBookableForService(serviceId),

    async setServices(actor: Actor, staffId: string, serviceIds: string[]) {
      const unique = [...new Set(serviceIds)];
      await staffRepo.replaceServices(staffId, unique, {
        actor,
        action: "set_services",
        entity: "staff",
        entityId: staffId,
        details: { serviceIds: unique },
      });
    },

    /**
     * Called on every Google sign-in. Active staff may log in; emails listed in ADMIN_EMAILS
     * are created as admins on first login so the firm can bootstrap without a seed script.
     */
    async resolveLogin(login: { email: string; name?: string | null }, bootstrapAdmins: string[]) {
      const email = login.email.trim().toLowerCase();
      const existing = await staffRepo.findByEmail(email);
      if (existing) return existing.active ? existing : null;
      if (!bootstrapAdmins.includes(email)) return null;
      return create({}, { name: login.name?.trim() || email, email, role: "admin" });
    },
  };
}

export type StaffService = ReturnType<typeof createStaffService>;
