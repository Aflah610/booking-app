import { z } from "zod";

export const slotQuery = z
  .object({
    serviceId: z.string().uuid(),
    staffId: z.string().uuid().nullish(),
    from: z.coerce.date(),
    to: z.coerce.date(),
  })
  .refine((q) => q.from < q.to, { message: "from must be before to", path: ["to"] })
  .refine((q) => q.to.getTime() - q.from.getTime() <= 62 * 86_400_000, { message: "Ask for 62 days or fewer", path: ["to"] });
export type SlotQuery = z.input<typeof slotQuery>;
