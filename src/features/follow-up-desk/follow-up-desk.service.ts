import type { BookingEvent } from "@/features/bookings/bookings.dto";
import { DomainError } from "@/features/shared/errors";
import { isUuid } from "@/features/shared/validation";
import { can, type AccessRole } from "@/features/access/permissions";
import { OPEN_REQUEST_STATUSES, type DeskViewer, type FollowUpRequestDTO, type RequestStatus } from "./follow-up-desk.dto";
import type { FollowUpDeskRepository } from "./follow-up-desk.repository";
import { messageInput, requestInput, statusInput } from "./follow-up-desk.schemas";

/** Coordinators (CCD) work every request; managers and admins see them all too ("followups.all"). */
export const seesAllFollowUps = (v: DeskViewer) => can(v, "followups.all");

/** Psychologists use the desk for their own clients ("followups.own"). */
export const canUseFollowUps = (v: DeskViewer) => seesAllFollowUps(v) || can(v, "followups.own");

export function createFollowUpDeskService({ deskRepo, clinicianRoles }: {
  deskRepo: FollowUpDeskRepository;
  /** The roles that treat clients (those with "followups.own"). */
  clinicianRoles: () => Promise<AccessRole[]>;
}) {
  async function get(viewer: DeskViewer, id: string): Promise<FollowUpRequestDTO> {
    if (!canUseFollowUps(viewer)) throw new DomainError("forbidden", "Sales executives don't use the follow-up desk");
    const row = isUuid(id) ? await deskRepo.findById(id) : null;
    // Another psychologist's request looks the same as a missing one.
    if (!row || (!seesAllFollowUps(viewer) && row.psychologistId !== viewer.id)) throw new DomainError("not_found", `Follow-up ${id} not found`);
    return row;
  }

  return {
    get,

    /** The request, its messages, and the viewer marked as having read them. */
    async open(viewer: DeskViewer, id: string, now = new Date()) {
      const request = await get(viewer, id);
      const messages = await deskRepo.messages(id);
      await deskRepo.markRead(id, viewer.id, now);
      return { request, messages };
    },

    async list(viewer: DeskViewer, opts: { view?: "open" | "closed" | "all"; psychologistId?: string } = {}) {
      if (!canUseFollowUps(viewer)) throw new DomainError("forbidden", "Sales executives don't use the follow-up desk");
      const statuses: readonly RequestStatus[] | undefined =
        opts.view === "closed" ? ["booked", "declined"] : opts.view === "all" ? undefined : OPEN_REQUEST_STATUSES;
      return deskRepo.list(viewer.id, { psychologistId: seesAllFollowUps(viewer) ? opts.psychologistId : viewer.id, statuses });
    },

    countUnread: (viewer: DeskViewer) =>
      canUseFollowUps(viewer) ? deskRepo.countUnread(viewer.id, seesAllFollowUps(viewer) ? undefined : viewer.id) : Promise.resolve(0),

    /**
     * A psychologist asks the coordinators to arrange a client's next session (or a coordinator opens one for a psychologist,
     * e.g. when the client calls in). One open request per client.
     */
    async request(viewer: DeskViewer, input: unknown, now = new Date()): Promise<string> {
      if (!canUseFollowUps(viewer)) throw new DomainError("forbidden", "Sales executives don't use the follow-up desk");
      const d = requestInput.parse(input);
      if (!seesAllFollowUps(viewer) && d.psychologistId !== viewer.id) throw new DomainError("forbidden", "You can only ask about your own clients");
      if (!(await deskRepo.psychologists(await clinicianRoles())).some((p) => p.id === d.psychologistId)) throw new DomainError("invalid", `Staff member ${d.psychologistId} doesn't see clients`);
      if (!(await deskRepo.clientsOf(d.psychologistId)).some((c) => c.id === d.clientId)) {
        throw new DomainError("forbidden", "Follow-ups require at least one completed session with this psychologist");
      }
      const existing = await deskRepo.openRequestFor(d.clientId);
      if (existing) throw new DomainError("conflict", `This client already has an open follow-up (with ${existing.psychologistName})`);
      return deskRepo.create(
        { clientId: d.clientId, psychologistId: d.psychologistId, createdBy: viewer.id, suggestedOn: d.suggestedOn, partOfDay: d.partOfDay, message: d.message, at: now },
        // The message itself stays out of the audit log.
        { actor: { staffId: viewer.id }, action: "create", entity: "follow_up_request", details: { psychologistId: d.psychologistId } },
      );
    },

    async post(viewer: DeskViewer, id: string, input: unknown, now = new Date()) {
      await get(viewer, id);
      const { body } = messageInput.parse(input);
      await deskRepo.addMessage(id, viewer.id, body, now);
    },

    /** Coordinators move a request along; closing it as booked or declined records when. */
    async setStatus(viewer: DeskViewer, id: string, input: unknown, now = new Date()) {
      if (!seesAllFollowUps(viewer)) throw new DomainError("forbidden", "Only coordinators and managers change a follow-up's status");
      const current = await get(viewer, id);
      const { status } = statusInput.parse(input);
      if (status === current.status) return;
      const closing = status === "booked" || status === "declined";
      if (!closing && !OPEN_REQUEST_STATUSES.includes(current.status)) {
        const reopened = await deskRepo.openRequestFor(current.clientId);
        if (reopened) throw new DomainError("conflict", "This client already has another open follow-up");
      }
      await deskRepo.setStatus(id, { status, closedAt: closing ? now : null }, {
        actor: { staffId: viewer.id }, action: "set_status", entity: "follow_up_request", entityId: id, details: { status, previousStatus: current.status },
      });
    },

    clientsOf: (staffId?: string) => deskRepo.clientsOf(staffId),
    psychologists: async () => deskRepo.psychologists(await clinicianRoles()),

    /** Booking the client with the request's psychologist closes the request as booked. */
    async onBookingEvent(event: BookingEvent) {
      if (event.type !== "booked") return;
      await deskRepo.bookedFor(event.bookingId, event.at);
    },
  };
}

export type FollowUpDeskService = ReturnType<typeof createFollowUpDeskService>;
