import type { CatalogRepository } from "@/features/catalog/catalog.repository";
import type { ServiceDTO } from "@/features/catalog/catalog.dto";
import type { SettingsRepository } from "@/features/settings/settings.repository";
import { DomainError } from "@/features/shared/errors";
import type { StaffRepository } from "@/features/staff/staff.repository";
import type { PublicStaffDTO } from "@/features/staff/staff.dto";
import type { AvailabilityRepository, BusyExclusions } from "./availability.repository";
import type { BookingMode, SlotDTO } from "./availability.dto";
import { slotQuery, type SlotQuery } from "./availability.schemas";
import { addDays, localDate, staffSlots, unionSlots } from "./slots";

const MIN = 60_000;
const DAY = 86_400_000;

/** Free times for a service, across one staff member or everyone who offers it. */
export function createAvailabilityService(deps: {
  availabilityRepo: AvailabilityRepository;
  catalogRepo: CatalogRepository;
  staffRepo: StaffRepository;
  settingsRepo: SettingsRepository;
}) {
  const { availabilityRepo, catalogRepo, staffRepo, settingsRepo } = deps;

  async function bookableService(serviceId: string): Promise<ServiceDTO> {
    const svc = await catalogRepo.findById(serviceId);
    if (!svc || !svc.active) throw new DomainError("not_found", `Service ${serviceId} not found or not bookable`);
    return svc;
  }

  async function staffFor(serviceId: string, staffId?: string | null): Promise<PublicStaffDTO[]> {
    const all = await staffRepo.listBookableForService(serviceId);
    if (!staffId) return all;
    const one = all.filter((s) => s.id === staffId);
    if (!one.length) throw new DomainError("not_found", `Staff member ${staffId} doesn't offer service ${serviceId}`);
    return one;
  }

  async function compute(opts: {
    svc: ServiceDTO;
    staff: PublicStaffDTO[];
    from: Date;
    to: Date;
    now: Date;
    mode: BookingMode;
    exclude?: BusyExclusions;
  }): Promise<SlotDTO[]> {
    const { svc, staff, from, to, now, mode } = opts;
    if (!staff.length) return [];
    const settings = await settingsRepo.get();
    const minNotice = svc.minNoticeMin ?? settings.minNoticeMin;
    const maxDays = svc.maxNoticeDays ?? settings.maxNoticeDays;
    const intervalMin = svc.slotIntervalMin ?? settings.slotIntervalMin;
    // Staff booking on a client's behalf may book right up to now and beyond the website's window.
    const earliest = mode === "client" ? now.getTime() + minNotice * MIN : now.getTime();
    const latest = mode === "client" ? now.getTime() + maxDays * DAY : now.getTime() + 730 * DAY;
    if (earliest >= to.getTime() || latest < from.getTime()) return [];

    const reach = (svc.durationMin + svc.bufferAfterMin + svc.bufferBeforeMin) * MIN;
    // Dates are padded by a day either side so every staff time zone's local dates are covered.
    const loadFrom = new Date(from.getTime() - reach);
    const loadTo = new Date(to.getTime() + reach);
    const schedules = await availabilityRepo.schedules(
      staff.map((s) => s.id),
      {
        from: loadFrom,
        to: loadTo,
        fromDate: addDays(localDate(loadFrom.getTime(), "UTC"), -1),
        toDate: addDays(localDate(loadTo.getTime(), "UTC"), 1),
        now,
      },
      opts.exclude,
    );
    const perStaff = staff.map((s) => {
      const sch = schedules.get(s.id)!;
      return {
        staffId: s.id,
        starts: staffSlots({
          ...sch,
          timeZone: s.timezone,
          from: from.getTime(),
          to: to.getTime(),
          durationMin: svc.durationMin,
          intervalMin,
          bufferBeforeMin: svc.bufferBeforeMin,
          bufferAfterMin: svc.bufferAfterMin,
          earliest,
          latest,
        }),
      };
    });
    const all = unionSlots(perStaff).map(({ start, staffIds }) => ({
      start: new Date(start),
      end: new Date(start + svc.durationMin * MIN),
      staffIds,
    }));
    if (svc.maxPerDay == null) return all;
    // A full day (by the firm's clock) offers no more times. Counted at booking time too, so a stale list can't overbook.
    const counts = await availabilityRepo.bookingsPerDay(svc.id, {
      from: new Date(from.getTime() - DAY),
      to: new Date(to.getTime() + DAY),
      timeZone: settings.timezone,
      excludeBookingId: opts.exclude?.bookingId,
    });
    const max = svc.maxPerDay;
    return all.filter((s) => (counts.get(localDate(s.start.getTime(), settings.timezone)) ?? 0) < max);
  }

  return {
    async slots(query: SlotQuery, opts: { now?: Date; mode?: BookingMode; exclude?: BusyExclusions } = {}) {
      const q = slotQuery.parse(query);
      const svc = await bookableService(q.serviceId);
      const staff = await staffFor(q.serviceId, q.staffId);
      const slots = await compute({ svc, staff, from: q.from, to: q.to, now: opts.now ?? new Date(), mode: opts.mode ?? "client", exclude: opts.exclude });
      return { service: svc, staff, slots };
    },

    /**
     * Who can take exactly this start time right now. Used to re-check at booking time, since the
     * slot list a client saw may be seconds old.
     */
    async freeStaffAt(opts: {
      serviceId: string;
      staffId?: string | null;
      start: Date;
      now: Date;
      mode: BookingMode;
      exclude?: BusyExclusions;
    }): Promise<{ service: ServiceDTO; staffIds: string[] }> {
      const svc = await bookableService(opts.serviceId);
      const staff = await staffFor(opts.serviceId, opts.staffId);
      const slots = await compute({
        svc,
        staff,
        from: opts.start,
        to: new Date(opts.start.getTime() + MIN),
        now: opts.now,
        mode: opts.mode,
        exclude: opts.exclude,
      });
      const hit = slots.find((s) => s.start.getTime() === opts.start.getTime());
      return { service: svc, staffIds: hit?.staffIds ?? [] };
    },
  };
}

export type AvailabilityService = ReturnType<typeof createAvailabilityService>;
