export type ServiceDTO = {
  id: string;
  name: string;
  description: string | null;
  durationMin: number;
  bufferBeforeMin: number;
  bufferAfterMin: number;
  priceDisplay: string | null;
  slotIntervalMin: number | null;
  minNoticeMin: number | null;
  maxNoticeDays: number | null;
  active: boolean;
};

/** What the website may see about a service. */
export type PublicServiceDTO = Pick<ServiceDTO, "id" | "name" | "description" | "durationMin" | "priceDisplay">;

export const toPublicService = (s: ServiceDTO): PublicServiceDTO => ({
  id: s.id,
  name: s.name,
  description: s.description,
  durationMin: s.durationMin,
  priceDisplay: s.priceDisplay,
});
