import type { Actor } from "@/features/audit/audit.types";
import type { BookingEvent } from "@/features/bookings/bookings.dto";
import { DomainError } from "@/features/shared/errors";
import { isUuid } from "@/features/shared/validation";
import { OPEN_STATUSES, SALES_DESIGNATION, type CaptureResult, type LeadDTO, type LeadStatus, type LeadViewer } from "./leads.dto";
import type { LeadsRepository } from "./leads.repository";
import { captureInput, leadUpdateInput, type CaptureInput } from "./leads.schemas";

const RANK = { staff: 0, manager: 1, admin: 2 } as const;
const isManager = (v: LeadViewer) => RANK[v.role] >= RANK.manager;

/** Sales executives work their own leads; managers and admins see and reassign all of them. */
export function canUseLeads(v: LeadViewer): boolean {
  return isManager(v) || v.designation === SALES_DESIGNATION;
}

export function createLeadsService({ leadsRepo }: { leadsRepo: LeadsRepository }) {
  async function get(viewer: LeadViewer, id: string): Promise<LeadDTO> {
    if (!canUseLeads(viewer)) throw new DomainError("forbidden", "Only sales executives, managers and admins can open leads");
    const row = isUuid(id) ? await leadsRepo.findById(id) : null;
    // Someone else's lead looks the same as a missing one, so a sales executive can't probe for them.
    if (!row || (!isManager(viewer) && row.assignedTo !== viewer.id)) throw new DomainError("not_found", `Lead ${id} not found`);
    return row;
  }

  async function capture(actor: Actor, input: CaptureInput, evenForClients: boolean): Promise<CaptureResult> {
    const d = captureInput.parse(input);
    return leadsRepo.capture(
      {
        phoneE164: d.phone,
        name: d.name,
        source: d.source,
        adId: d.adId ?? null,
        adHeadline: d.adHeadline ?? null,
        adUrl: d.adUrl ?? null,
        notes: d.notes ?? null,
        at: d.at ?? new Date(),
        evenForClients,
      },
      // The audit row says a lead was opened and for whom it is; the person's details stay on the client row.
      { actor, action: "create", entity: "lead" },
    );
  }

  return {
    get,

    /** An incoming WhatsApp message. Someone who has booked before is support, not a new lead. */
    receive: (input: CaptureInput) => capture({}, input, false),

    /** Staff typing in a lead (a phone enquiry, a walk-in). Always opens one, assigned like any other. */
    async add(viewer: LeadViewer, input: Omit<CaptureInput, "source">): Promise<LeadDTO> {
      if (!canUseLeads(viewer)) throw new DomainError("forbidden", "Only sales executives, managers and admins can add leads");
      const result = await capture({ staffId: viewer.id }, { ...input, source: "manual" }, true);
      if (result.kind === "client") throw new DomainError("conflict", "This person is already a client");
      if (result.kind === "existing") throw new DomainError("conflict", `${result.lead.clientName} already has an open lead (${result.lead.assignedName ?? "not assigned"})`);
      return result.lead;
    },

    // Async, so a refusal comes back as a rejected promise like every other failure.
    async list(viewer: LeadViewer, opts: { assignedTo?: string; view?: "open" | "closed" | "all"; q?: string } = {}) {
      if (!canUseLeads(viewer)) throw new DomainError("forbidden", "Only sales executives, managers and admins can see leads");
      const statuses: readonly LeadStatus[] | undefined =
        opts.view === "closed" ? ["converted", "lost"] : opts.view === "all" ? undefined : OPEN_STATUSES;
      return leadsRepo.list({ assignedTo: isManager(viewer) ? opts.assignedTo : viewer.id, statuses, q: opts.q });
    },

    /** For the menu: new leads waiting for this person (or for anyone, for managers). */
    countNew: (viewer: LeadViewer) => (canUseLeads(viewer) ? leadsRepo.countNew(isManager(viewer) ? undefined : viewer.id) : Promise.resolve(0)),

    assignable: () => leadsRepo.assignable(),

    async update(viewer: LeadViewer, id: string, input: unknown, now = new Date()) {
      const current = await get(viewer, id);
      const d = leadUpdateInput.parse(input);
      const closing = d.status === "converted" || d.status === "lost";
      if (d.status === "follow_up" && !d.followUpOn) throw new DomainError("invalid", "Choose the date to follow up on");
      await leadsRepo.update(
        id,
        { status: d.status, followUpOn: closing ? null : d.followUpOn, notes: d.notes, closedAt: closing ? (current.closedAt ?? now) : null },
        { actor: { staffId: viewer.id }, action: "update", entity: "lead", entityId: id, details: { status: d.status, previousStatus: current.status } },
      );
    },

    async reassign(viewer: LeadViewer, id: string, staffId: string) {
      if (!isManager(viewer)) throw new DomainError("forbidden", "Only managers and admins can reassign leads");
      const current = await get(viewer, id);
      if (!(await leadsRepo.assignable()).some((s) => s.id === staffId)) throw new DomainError("invalid", `Staff member ${staffId} can't be given leads`);
      if (current.assignedTo === staffId) return;
      await leadsRepo.update(id, { assignedTo: staffId }, {
        actor: { staffId: viewer.id }, action: "reassign", entity: "lead", entityId: id, details: { staffId, previousStaffId: current.assignedTo },
      });
    },

    /** A booking (or its payment) closes the person's open lead as converted. */
    async onBookingEvent(event: BookingEvent) {
      if (event.type !== "booked" && event.type !== "payment_success") return;
      await leadsRepo.convertForBooking(event.bookingId, event.at);
    },
  };
}

export type LeadsService = ReturnType<typeof createLeadsService>;
