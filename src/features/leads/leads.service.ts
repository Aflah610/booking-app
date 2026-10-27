import type { Actor } from "@/features/audit/audit.types";
import type { BookingEvent } from "@/features/bookings/bookings.dto";
import { DomainError } from "@/features/shared/errors";
import { isUuid } from "@/features/shared/validation";
import { can, type AccessRole } from "@/features/access/permissions";
import { zonedToUtc } from "@/lib/time";
import { OPEN_STATUSES, type CaptureResult, type LeadDTO, type LeadFilters, type LeadStatus, type LeadViewer } from "./leads.dto";
import type { LeadsRepository } from "./leads.repository";
import { captureInput, leadUpdateInput, type CaptureInput } from "./leads.schemas";

/** Sees every lead, reassigns, and switches others online ("leads.all"). */
const isManager = (v: LeadViewer) => can(v, "leads.all");

/** BDEs work their own leads; whoever runs sales sees and reassigns all of them (Settings > Roles & access). */
export function canUseLeads(v: LeadViewer): boolean {
  return isManager(v) || can(v, "leads.own");
}

/** The instant a YYYY-MM-DD day begins in the firm's time zone. */
const dayStart = (day: string, timeZone: string) => zonedToUtc(`${day}T00:00`, timeZone);
const nextDay = (day: string) => new Date(Date.parse(`${day}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

export function createLeadsService({ leadsRepo, salesRoles }: {
  leadsRepo: LeadsRepository;
  /** The roles that get a share of new leads (those with "leads.own"). */
  salesRoles: () => Promise<AccessRole[]>;
}) {
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
        salesRoles: await salesRoles(),
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
    async list(viewer: LeadViewer, opts: LeadFilters = {}, timeZone = "Asia/Kolkata") {
      if (!canUseLeads(viewer)) throw new DomainError("forbidden", "Only sales executives, managers and admins can see leads");
      const statuses: readonly LeadStatus[] | undefined = opts.status
        ? [opts.status]
        : opts.view === "closed" ? ["converted", "lost"] : opts.view === "all" ? undefined : OPEN_STATUSES;
      return leadsRepo.list({
        assignedTo: isManager(viewer) ? opts.assignedTo : viewer.id,
        statuses,
        source: opts.source,
        from: opts.from ? dayStart(opts.from, timeZone) : undefined,
        to: opts.to ? dayStart(nextDay(opts.to), timeZone) : undefined,
        followUpBy: opts.followUpBy,
        q: opts.q,
      });
    },

    /** Converted leads, newest deal first, closed within [from, to] (YYYY-MM-DD, both days included). */
    async closedDeals(viewer: LeadViewer, opts: { from?: string; to?: string; assignedTo?: string } = {}, timeZone = "Asia/Kolkata") {
      if (!canUseLeads(viewer)) throw new DomainError("forbidden", "Only sales executives, managers and admins can see deals");
      return leadsRepo.list({
        assignedTo: isManager(viewer) ? opts.assignedTo : viewer.id,
        statuses: ["converted"],
        from: opts.from ? dayStart(opts.from, timeZone) : undefined,
        to: opts.to ? dayStart(nextDay(opts.to), timeZone) : undefined,
        byClosed: true,
      });
    },

    /** Managers' summary per sales executive for the days [from, to] in the firm's time zone. */
    async summary(viewer: LeadViewer, from: string, to: string, timeZone = "Asia/Kolkata") {
      if (!isManager(viewer)) throw new DomainError("forbidden", "Only managers and admins see the sales summary");
      return leadsRepo.summary(dayStart(from, timeZone), dayStart(nextDay(to), timeZone));
    },

    /** For the menu: new leads waiting for this person (or for anyone, for managers). */
    countNew: (viewer: LeadViewer) => (canUseLeads(viewer) ? leadsRepo.countNew(isManager(viewer) ? undefined : viewer.id) : Promise.resolve(0)),

    assignable: async () => leadsRepo.assignable(await salesRoles()),

    /** Whether anyone active works leads. With nobody (sales paused), the menu leaves Leads out. */
    hasSalesTeam: async () => (await leadsRepo.salesTeam(await salesRoles())).length > 0,

    /** The sales executives and whether each is taking leads, for the switches on the Leads page. */
    async salesTeam(viewer: LeadViewer) {
      if (!canUseLeads(viewer)) throw new DomainError("forbidden", "Only sales executives, managers and admins can see the sales team");
      return leadsRepo.salesTeam(await salesRoles());
    },

    /**
     * Online means "give me new leads". Sales executives switch themselves; managers can switch anyone (someone forgot before
     * leaving). Coming online picks up leads that arrived while nobody was online. Returns how many were handed out.
     */
    async setOnline(viewer: LeadViewer, staffId: string, online: boolean, now = new Date()): Promise<number> {
      if (staffId !== viewer.id && !isManager(viewer)) throw new DomainError("forbidden", "You can only switch yourself online or offline");
      if (!(await leadsRepo.salesTeam(await salesRoles())).some((s) => s.id === staffId)) throw new DomainError("invalid", `Staff member ${staffId} is not an active sales executive`);
      return leadsRepo.setOnline(staffId, online, now, await salesRoles(), {
        actor: { staffId: viewer.id }, action: online ? "leads_online" : "leads_offline", entity: "staff", entityId: staffId,
      });
    },

    async update(viewer: LeadViewer, id: string, input: unknown, now = new Date()) {
      const current = await get(viewer, id);
      const d = leadUpdateInput.parse(input);
      const closing = d.status === "converted" || d.status === "lost";
      if (d.status === "follow_up" && !d.followUpOn) throw new DomainError("invalid", "Choose the date to follow up on");
      if (d.status === "lost" && !d.lostReason) throw new DomainError("invalid", "Choose why the lead was lost");
      const converted = d.status === "converted";
      await leadsRepo.update(
        id,
        {
          status: d.status,
          followUpOn: closing ? null : d.followUpOn,
          notes: d.notes,
          closedAt: closing ? (current.status === d.status && current.closedAt ? current.closedAt : now) : null,
          lostReason: d.status === "lost" ? d.lostReason : null,
          // A deal closed by phone or cash is recorded by hand; a booking fills these in by itself.
          dealAmountPaise: converted ? (d.dealAmount != null ? Math.round(d.dealAmount * 100) : current.dealAmountPaise) : null,
          dealNote: converted ? d.dealNote : null,
        },
        { actor: { staffId: viewer.id }, action: "update", entity: "lead", entityId: id, details: { status: d.status, previousStatus: current.status } },
      );
    },

    async reassign(viewer: LeadViewer, id: string, staffId: string) {
      if (!isManager(viewer)) throw new DomainError("forbidden", "Only managers and admins can reassign leads");
      const current = await get(viewer, id);
      if (!(await leadsRepo.assignable(await salesRoles())).some((s) => s.id === staffId)) throw new DomainError("invalid", `Staff member ${staffId} can't be given leads`);
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
