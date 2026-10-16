import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Actor } from "@/features/audit/audit.types";
import type { BookingMode } from "@/features/availability/availability.dto";
import type { AvailabilityService } from "@/features/availability/availability.service";
import type { SettingsRepository } from "@/features/settings/settings.repository";
import { DomainError } from "@/features/shared/errors";
import { isUuid } from "@/features/shared/validation";
import type { BookingDTO, BookingStatus, HoldDTO } from "./bookings.dto";
import type { BookingsRepository, WriteResult } from "./bookings.repository";
import {
  bookingListQuery,
  cancelInput,
  createBookingInput,
  holdInput,
  idempotencyKey as idempotencyKeySchema,
  rescheduleInput,
  type BookingListQuery,
} from "./bookings.schemas";

const MIN = 60_000;
export const HOLD_MINUTES = 5;
const FAIRNESS_WINDOW_DAYS = 28;

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const newToken = () => randomBytes(24).toString("base64url");

/** Who is acting, for `cancelled_by` and permission rules. A website call acts for the client. */
export type BookingActor = Actor & { mode: BookingMode };

const actorLabel = (a: BookingActor) =>
  a.mode === "client" ? "client" : a.staffId ? `staff:${a.staffId}` : a.apiKeyId ? `api:${a.apiKeyId}` : "system";

function fail(result: Exclude<WriteResult<unknown>, { ok: true }>): never {
  switch (result.reason) {
    case "slot_taken":
      throw new DomainError("conflict", "That time was just booked by someone else. Pick another time.", { reason: "slot_taken" });
    case "held":
      throw new DomainError("conflict", "Someone else is booking that time right now. Pick another time.", { reason: "slot_held" });
    case "hold_missing":
      throw new DomainError("conflict", "The hold on this time expired. Pick the time again.", { reason: "hold_expired" });
    case "not_upcoming":
      throw new DomainError("conflict", "This booking is no longer upcoming", { reason: "not_upcoming" });
    case "duplicate_key":
      throw new DomainError("conflict", "This Idempotency-Key was already used", { reason: "idempotency_key_reused" });
  }
}

/**
 * Booking rules: re-check availability at write time (the slot list may be stale), let Postgres have
 * the last word on overlaps, make retries safe, and refuse cancels or moves that make no sense.
 */
export function createBookingsService(deps: {
  bookingsRepo: BookingsRepository;
  availability: AvailabilityService;
  settingsRepo: SettingsRepository;
}) {
  const { bookingsRepo, availability, settingsRepo } = deps;

  async function get(id: string): Promise<BookingDTO> {
    const row = isUuid(id) ? await bookingsRepo.findById(id) : null;
    if (!row) throw new DomainError("not_found", `Booking ${id} not found`);
    return row;
  }

  /** Fair "any available" pick: fewest recent bookings, then whoever was booked least recently. */
  async function pickStaff(staffIds: string[], now: Date): Promise<string> {
    if (staffIds.length === 1) return staffIds[0];
    const load = await bookingsRepo.recentLoad(staffIds, new Date(now.getTime() - FAIRNESS_WINDOW_DAYS * 86_400_000));
    const score = (id: string) => load.get(id) ?? { count: 0, lastStart: 0 };
    return [...staffIds].sort((a, b) => score(a).count - score(b).count || score(a).lastStart - score(b).lastStart || a.localeCompare(b))[0];
  }

  /** Who can take this time, for one person or anyone; throws when nobody can. */
  async function resolveStaff(opts: {
    serviceId: string;
    staffId?: string | null;
    start: Date;
    now: Date;
    mode: BookingMode;
    exclude?: { bookingId?: string; holdTokenHash?: string };
  }) {
    if (opts.start.getTime() <= opts.now.getTime()) throw new DomainError("invalid", "That time is in the past");
    const { service, staffIds } = await availability.freeStaffAt(opts);
    if (!staffIds.length) {
      throw new DomainError("conflict", "That time isn't available. Pick another time.", { reason: "slot_unavailable" });
    }
    return { service, staffId: await pickStaff(staffIds, opts.now) };
  }

  function checkClientCutoff(b: BookingDTO, now: Date, cutoffMin: number, what: string) {
    if (b.startsAt.getTime() - now.getTime() < cutoffMin * MIN) {
      const hours = Math.round((cutoffMin / 60) * 10) / 10;
      throw new DomainError("forbidden", `Bookings can't be ${what} online less than ${hours} hours before the start. Please contact the firm.`);
    }
  }

  return {
    get,

    async list(query: BookingListQuery) {
      const q = bookingListQuery.parse(query);
      const now = new Date();
      const views: Record<typeof q.view, { statuses?: BookingStatus[]; from?: Date; to?: Date; order: "asc" | "desc" }> = {
        upcoming: { statuses: ["upcoming"], from: now, order: "asc" },
        past: { statuses: ["upcoming", "completed", "no_show"], to: now, order: "desc" },
        cancelled: { statuses: ["cancelled"], order: "desc" },
        all: { order: "asc" },
      };
      const v = views[q.view];
      return bookingsRepo.list({
        statuses: v.statuses,
        staffId: q.staffId,
        clientId: q.clientId,
        from: q.from ?? v.from,
        to: q.to ?? v.to,
        order: v.order,
        limit: q.limit,
      });
    },

    /**
     * Creates a booking. With an idempotency key, a retry of the same request returns the original
     * booking (`replayed: true`) instead of booking twice. Website bookings get a manage token, shown once.
     */
    async create(actor: BookingActor, input: unknown, opts: { idempotencyKey?: string | null; now?: Date } = {}) {
      const data = createBookingInput.parse(input);
      const now = opts.now ?? new Date();
      const key = opts.idempotencyKey ? idempotencyKeySchema.parse(opts.idempotencyKey) : null;
      if (actor.mode === "client" && !key) {
        throw new DomainError("invalid", "The Idempotency-Key header is required when creating a booking");
      }

      const replay = async () => {
        const existing = key ? await bookingsRepo.findByIdempotencyKey(key) : null;
        if (!existing) return null;
        if (existing.serviceId !== data.serviceId || existing.startsAt.getTime() !== data.start.getTime()) {
          throw new DomainError("conflict", "This Idempotency-Key was already used for a different booking", { reason: "idempotency_key_reused" });
        }
        return { booking: existing, manageToken: null, replayed: true as const };
      };
      const earlier = await replay();
      if (earlier) return earlier;

      const holdTokenHash = data.holdToken ? sha256(data.holdToken) : null;
      let staffId = data.staffId;
      if (holdTokenHash && !staffId) {
        // A hold already picked the person; book with them.
        staffId = (await bookingsRepo.findHold(holdTokenHash, now))?.staffId;
        if (!staffId) fail({ ok: false, reason: "hold_missing" });
      }
      const picked = await resolveStaff({
        serviceId: data.serviceId,
        staffId,
        start: data.start,
        now,
        mode: actor.mode,
        exclude: holdTokenHash ? { holdTokenHash } : undefined,
      });

      const manageToken = actor.mode === "client" ? newToken() : null;
      const result = await bookingsRepo.create(
        {
          serviceId: data.serviceId,
          staffId: picked.staffId,
          startsAt: data.start,
          endsAt: new Date(data.start.getTime() + picked.service.durationMin * MIN),
          source: actor.mode === "client" ? "web" : "staff",
          client: { name: data.client.name, phoneE164: data.client.phone, email: data.client.email ?? null, whatsappOptIn: data.client.whatsappOptIn },
          idempotencyKey: key,
          manageTokenHash: manageToken ? sha256(manageToken) : null,
          notes: data.notes,
          formAnswers: data.formAnswers,
        },
        {
          holdTokenHash,
          now,
          audit: {
            actor,
            action: "create",
            entity: "booking",
            details: { serviceId: data.serviceId, staffId: picked.staffId, start: data.start.toISOString() },
          },
        },
      );
      if (!result.ok) {
        // Two identical retries raced: the other one won, so return what it created.
        if (result.reason === "duplicate_key") {
          const again = await replay();
          if (again) return again;
        }
        fail(result);
      }
      return { booking: await get(result.value), manageToken, replayed: false as const };
    },

    /** Holds a time for a few minutes while the client fills in the website form. */
    async hold(actor: BookingActor, input: unknown, opts: { now?: Date } = {}): Promise<HoldDTO> {
      const data = holdInput.parse(input);
      const now = opts.now ?? new Date();
      const picked = await resolveStaff({ ...data, now, mode: actor.mode });
      const token = newToken();
      const end = new Date(data.start.getTime() + picked.service.durationMin * MIN);
      const expiresAt = new Date(now.getTime() + HOLD_MINUTES * MIN);
      const result = await bookingsRepo.createHold({
        staffId: picked.staffId,
        serviceId: data.serviceId,
        startsAt: data.start,
        endsAt: end,
        tokenHash: sha256(token),
        releaseAt: expiresAt,
        now,
      });
      if (!result.ok) fail(result);
      return { token, staffId: picked.staffId, start: data.start, end, expiresAt };
    },

    releaseHold: (token: string) => bookingsRepo.releaseHold(sha256(token)),

    /** For the website: the client must present the manage token they got when booking. */
    async verifyManageToken(bookingId: string, token: string | null | undefined) {
      const stored = isUuid(bookingId) ? await bookingsRepo.manageTokenHash(bookingId) : null;
      const given = token ? Buffer.from(sha256(token), "hex") : null;
      if (!stored || !given || !timingSafeEqual(Buffer.from(stored, "hex"), given)) {
        throw new DomainError("not_found", `Booking ${bookingId} not found`);
      }
    },

    /** Moves a booking: a new booking is made and the old one cancelled, together, and linked. */
    async reschedule(actor: BookingActor, id: string, input: unknown, opts: { now?: Date } = {}) {
      const data = rescheduleInput.parse(input);
      const now = opts.now ?? new Date();
      const old = await get(id);
      if (old.status !== "upcoming") throw new DomainError("conflict", `Booking ${id} is ${old.status} and can't be moved`, { reason: "not_upcoming" });
      if (old.startsAt <= now) throw new DomainError("invalid", "A booking that has already started can't be moved");
      if (actor.mode === "client") checkClientCutoff(old, now, (await settingsRepo.get()).clientCutoffMin, "moved");
      if (old.startsAt.getTime() === data.start.getTime() && (!data.staffId || data.staffId === old.staffId)) {
        throw new DomainError("invalid", "The new time is the same as the current one");
      }

      const holdTokenHash = data.holdToken ? sha256(data.holdToken) : null;
      const picked = await resolveStaff({
        serviceId: old.serviceId,
        // Keep the same person unless asked otherwise.
        staffId: data.staffId ?? old.staffId,
        start: data.start,
        now,
        mode: actor.mode,
        exclude: { bookingId: old.id, holdTokenHash: holdTokenHash ?? undefined },
      });
      const result = await bookingsRepo.reschedule(
        old.id,
        {
          serviceId: old.serviceId,
          staffId: picked.staffId,
          startsAt: data.start,
          endsAt: new Date(data.start.getTime() + picked.service.durationMin * MIN),
          notes: old.notes,
          reason: "Rescheduled",
          cancelledBy: actorLabel(actor),
        },
        {
          holdTokenHash,
          now,
          audit: {
            actor,
            action: "reschedule",
            entity: "booking",
            entityId: old.id,
            details: { from: old.startsAt.toISOString(), to: data.start.toISOString(), staffId: picked.staffId },
          },
        },
      );
      if (!result.ok) fail(result);
      return get(result.value);
    },

    async cancel(actor: BookingActor, id: string, input: unknown = {}, opts: { now?: Date } = {}) {
      const { reason } = cancelInput.parse(input ?? {});
      const now = opts.now ?? new Date();
      const b = await get(id);
      if (b.status === "cancelled") throw new DomainError("conflict", `Booking ${id} is already cancelled`, { reason: "already_cancelled" });
      if (b.status !== "upcoming") throw new DomainError("conflict", `Booking ${id} is ${b.status} and can't be cancelled`, { reason: "not_upcoming" });
      if (b.endsAt <= now) throw new DomainError("invalid", "A booking that has already ended can't be cancelled");
      if (actor.mode === "client") checkClientCutoff(b, now, (await settingsRepo.get()).clientCutoffMin, "cancelled");
      const result = await bookingsRepo.cancel(id, { reason: reason ?? null, cancelledBy: actorLabel(actor) }, {
        actor,
        action: "cancel",
        entity: "booking",
        entityId: id,
        details: { reason: reason ?? null },
      });
      if (!result.ok) fail(result);
      return get(id);
    },

    /** After the start time, staff mark what happened. Undo puts it back to upcoming. */
    async markStatus(actor: BookingActor, id: string, status: "completed" | "no_show" | "upcoming", opts: { now?: Date } = {}) {
      const now = opts.now ?? new Date();
      const b = await get(id);
      if (status !== "upcoming" && b.startsAt > now) {
        throw new DomainError("invalid", "A booking can only be marked once it has started");
      }
      const from: BookingStatus[] = status === "upcoming" ? ["completed", "no_show"] : ["upcoming", "completed", "no_show"];
      const result = await bookingsRepo.setStatus(id, status, from, {
        actor,
        action: `mark_${status}`,
        entity: "booking",
        entityId: id,
      });
      if (!result.ok) fail(result);
      return get(id);
    },

    async updateNotes(actor: Actor, id: string, notes: string | null) {
      await get(id);
      const clean = notes?.trim().slice(0, 2000) || null;
      await bookingsRepo.updateNotes(id, clean, { actor, action: "update_notes", entity: "booking", entityId: id });
    },

    deleteExpiredHolds: (now = new Date()) => bookingsRepo.deleteExpiredHolds(now),
  };
}

export type BookingsService = ReturnType<typeof createBookingsService>;
