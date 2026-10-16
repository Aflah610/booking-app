import { z } from "zod";
import type { Actor } from "@/features/audit/audit.types";
import { DomainError } from "@/features/shared/errors";
import { isUuid } from "@/features/shared/validation";
import type { HolidaysRepository } from "./holidays.repository";

const input = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-10-20").refine((d) => !Number.isNaN(Date.parse(`${d}T00:00:00Z`)), "That date doesn't exist"),
  name: z.string().trim().min(1, "Give the holiday a name").max(100),
});

/** Days the whole firm is closed. The availability engine reads them straight from the table. */
export function createHolidaysService({ holidaysRepo }: { holidaysRepo: HolidaysRepository }) {
  return {
    list: (fromDate: string) => holidaysRepo.list(fromDate),

    async add(actor: Actor, raw: unknown) {
      const data = input.parse(raw);
      const row = await holidaysRepo.add(data, { actor, action: "create", entity: "holiday", details: data });
      if (!row) throw new DomainError("conflict", `${data.date} is already a holiday`);
      return row;
    },

    async remove(actor: Actor, id: string) {
      const removed = isUuid(id) && (await holidaysRepo.remove(id, { actor, action: "delete", entity: "holiday", entityId: id }));
      if (!removed) throw new DomainError("not_found", `Holiday ${id} not found`);
    },
  };
}

export type HolidaysService = ReturnType<typeof createHolidaysService>;
