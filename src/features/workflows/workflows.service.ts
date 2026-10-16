import type { Actor } from "@/features/audit/audit.types";
import type { CatalogRepository } from "@/features/catalog/catalog.repository";
import type { SettingsRepository } from "@/features/settings/settings.repository";
import { DomainError } from "@/features/shared/errors";
import { isUuid } from "@/features/shared/validation";
import { bookingReference, type BookingEvent } from "@/features/bookings/bookings.dto";
import { longDayLabel, timeLabel } from "@/lib/format";
import { addToCalendarLinks } from "@/lib/ics";
import { render, type TemplateVars } from "./templates";
import {
  NotConfigured,
  type BookingContextDTO,
  type EmailConfig,
  type OutgoingMessage,
  type Sender,
  type WebhookConfig,
  type WhatsappConfig,
  type WorkflowChannel,
  type WorkflowDTO,
  type WorkflowTrigger,
} from "./workflows.dto";
import type { WorkflowsRepository } from "./workflows.repository";
import { workflowInput, type WorkflowInput } from "./workflows.schemas";

const MIN = 60_000;
const MAX_ATTEMPTS = 3;
/** Wait before the 2nd and 3rd try. */
const RETRY_AFTER_MIN = [1, 10];
/** How long a claimed message stays ours before another worker may take it, if we die mid-send. */
const LEASE_MIN = 5;

/** Event-driven triggers fire from a booking event; the two time-based ones are planned from the booking's own times. */
const TIME_BASED: WorkflowTrigger[] = ["appointment_start", "appointment_end"];
const FIRES_WITH_BOOKING: BookingEvent["type"][] = ["booked", "rescheduled"];

export type Senders = Record<WorkflowChannel, Sender>;
type Firm = { name: string; timezone: string; bookingPrefix: string; resumeUrl: string | null };

/**
 * Workflows: "when X happens to a booking, send Y". Booking events queue messages (a message is a row, so it
 * survives restarts and can be cancelled when the booking moves); a worker calls `processDue` to send them.
 * Nothing here can fail a booking: callers treat `onBookingEvent` as best effort.
 */
/** Events whose email carries a calendar entry: the appointment appears, moves or disappears with these. */
const INVITE_TRIGGERS: WorkflowTrigger[] = ["booked", "rescheduled", "cancelled", "payment_success"];

export function createWorkflowsService(deps: {
  workflowsRepo: WorkflowsRepository;
  catalogRepo: CatalogRepository;
  settingsRepo: SettingsRepository;
  senders: Senders;
  /** Signed link where the client can move or cancel the booking; null when the app has no secret to sign with. */
  manageLink: (bookingId: string) => string | null;
  /** The bare token inside that link, for building a link to the firm's own website page. */
  manageToken: (bookingId: string) => string | null;
  /** Address of the booking's downloadable calendar file (without the token), for the {{add_to_calendar}} link. */
  calendarFileUrl?: (bookingId: string) => string;
}) {
  const { workflowsRepo, catalogRepo, settingsRepo, senders, manageLink, manageToken, calendarFileUrl } = deps;

  async function get(id: string): Promise<WorkflowDTO> {
    const row = isUuid(id) ? await workflowsRepo.findById(id) : null;
    if (!row) throw new DomainError("not_found", `Workflow ${id} not found`);
    return row;
  }

  async function checkServices(serviceIds: string[]) {
    if (!serviceIds.length) return;
    const known = new Set((await catalogRepo.list()).map((s) => s.id));
    const missing = serviceIds.filter((id) => !known.has(id));
    if (missing.length) throw new DomainError("invalid", `Service ${missing.join(", ")} not found`);
  }

  function when(w: WorkflowDTO, ctx: BookingContextDTO, now: Date): Date | null {
    const offset = w.offsetMin * MIN;
    if (TIME_BASED.includes(w.trigger)) {
      const base = (w.trigger === "appointment_start" ? ctx.startsAt : ctx.endsAt).getTime();
      const at = w.timing === "before" ? base - offset : w.timing === "after" ? base + offset : base;
      // A reminder whose moment has passed (booked 1 hour ahead, reminder 24 hours before) is simply not sent.
      return at < now.getTime() ? null : new Date(at);
    }
    return new Date(now.getTime() + (w.timing === "after" ? offset : 0));
  }

  async function onBookingEvent(event: BookingEvent) {
    const now = event.at;
    // Unsent messages for the old time (or a cancelled booking) must not go out.
    await workflowsRepo.cancelQueued([event.type === "rescheduled" ? event.previousBookingId : event.type === "cancelled" ? event.bookingId : undefined].filter((x): x is string => Boolean(x)));
    const ctx = await workflowsRepo.context(event.bookingId);
    if (!ctx) return;
    const fires: WorkflowTrigger[] = [event.type, ...(FIRES_WITH_BOOKING.includes(event.type) ? TIME_BASED : [])];
    const runs = (await workflowsRepo.list())
      .filter((w) => w.active && fires.includes(w.trigger) && (!w.serviceIds.length || w.serviceIds.includes(ctx.serviceId)))
      .flatMap((w) => {
        const at = when(w, ctx, now);
        return at ? [{ workflowId: w.id, bookingId: ctx.bookingId, scheduledFor: at }] : [];
      });
    await workflowsRepo.enqueue(runs);
  }

  /** The firm's own page where the client finishes paying: their address plus the booking and a secure token. */
  function resumeLink(bookingId: string, base: string | null): string {
    const token = manageToken(bookingId);
    if (!base || !token) return "";
    const url = new URL(base);
    url.searchParams.set("booking", bookingId);
    url.searchParams.set("token", token);
    return url.toString();
  }

  /** Where the calendar entry gets its title and notes; shared by the invite and the add-to-calendar links. */
  function eventText(ctx: BookingContextDTO, firm: Firm) {
    return { title: `${ctx.serviceName} with ${ctx.staffName}`, description: `Booking ${bookingReference(firm.bookingPrefix, ctx.number)} at ${firm.name}` };
  }

  function vars(ctx: BookingContextDTO, firm: Firm): TemplateVars {
    const links = addToCalendarLinks({ start: ctx.startsAt, end: ctx.endsAt, location: ctx.location, ...eventText(ctx, firm) });
    const token = manageToken(ctx.bookingId);
    return {
      add_to_google: links.google,
      add_to_outlook: links.outlook,
      add_to_calendar: token && calendarFileUrl ? `${calendarFileUrl(ctx.bookingId)}?t=${token}` : "",
      client_name: ctx.clientName,
      client_phone: ctx.clientPhone,
      service: ctx.serviceName,
      staff: ctx.staffName,
      date: longDayLabel(ctx.startsAt, firm.timezone),
      time: timeLabel(ctx.startsAt, firm.timezone),
      booking_id: bookingReference(firm.bookingPrefix, ctx.number),
      location: ctx.location ?? "",
      amount: ctx.amountPaise ? `₹${(ctx.amountPaise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}` : "",
      resume_link: resumeLink(ctx.bookingId, firm.resumeUrl),
      manage_link: manageLink(ctx.bookingId) ?? "",
      firm_name: firm.name,
      cancel_reason: ctx.cancellationReason ?? "",
    };
  }

  /** The message to send and a readable copy for the log, or a reason there's nobody to send it to. */
  function compose(
    w: WorkflowDTO,
    ctx: BookingContextDTO,
    firm: Firm,
  ): { msg: OutgoingMessage; to: string; summary: string } | { skip: string } {
    const v = vars(ctx, firm);
    if (w.channel === "email") {
      const c = w.config as EmailConfig;
      const to = c.recipient === "staff" ? ctx.staffEmail : ctx.clientEmail;
      if (!to) return { skip: "The client has no email address" };
      const subject = render(c.subject, v);
      const body = render(c.body, v);
      // Invites only go to the client, and only where the calendar entry itself changes.
      const invite =
        c.attachInvite && c.recipient !== "staff" && INVITE_TRIGGERS.includes(w.trigger)
          ? {
              method: ctx.status === "cancelled" ? ("CANCEL" as const) : ("REQUEST" as const),
              uid: ctx.calendarUid,
              // A cancellation must outrank every earlier version of the entry.
              sequence: ctx.calendarSequence + (ctx.status === "cancelled" ? 1 : 0),
              start: ctx.startsAt,
              end: ctx.endsAt,
              ...eventText(ctx, firm),
              location: ctx.location,
              attendee: { name: ctx.clientName, email: to },
            }
          : undefined;
      return { msg: { channel: "email", to, subject, body, invite }, to, summary: `${subject}\n\n${body}${invite ? `\n\n[Calendar invite attached: ${invite.method}]` : ""}` };
    }
    if (w.channel === "whatsapp") {
      const c = w.config as WhatsappConfig;
      if (!ctx.whatsappOptIn) return { skip: "The client has not agreed to WhatsApp messages" };
      const params = c.params.map((p) => render(p, v));
      return {
        msg: { channel: "whatsapp", to: ctx.clientPhone, templateName: c.templateName, language: c.language, params },
        to: ctx.clientPhone,
        summary: `Template ${c.templateName} (${c.language}): ${params.join(" | ")}`,
      };
    }
    const c = w.config as WebhookConfig;
    const payload = {
      event: w.trigger,
      workflow: w.name,
      firm: firm.name,
      booking: {
        id: ctx.bookingId,
        reference: v.booking_id,
        status: ctx.status,
        service: ctx.serviceName,
        staff: ctx.staffName,
        start: ctx.startsAt.toISOString(),
        end: ctx.endsAt.toISOString(),
        cancellationReason: ctx.cancellationReason,
        location: ctx.location,
        manageLink: manageLink(ctx.bookingId),
      },
      client: { name: ctx.clientName, phone: ctx.clientPhone, email: ctx.clientEmail },
    };
    return { msg: { channel: "webhook", url: c.url, payload }, to: c.url, summary: JSON.stringify(payload, null, 2) };
  }

  async function sendOne(run: { id: string; workflowId: string; bookingId: string; attempts: number }, now: Date) {
    const w = await workflowsRepo.findById(run.workflowId);
    const ctx = await workflowsRepo.context(run.bookingId);
    if (!w || !w.active || !ctx) return workflowsRepo.finish(run.id, { status: "skipped", error: "The workflow or booking no longer exists" });
    if (ctx.status === "cancelled" && w.trigger !== "cancelled") {
      return workflowsRepo.finish(run.id, { status: "skipped", error: "The booking was cancelled" });
    }
    const out = compose(w, ctx, await settingsRepo.get());
    if ("skip" in out) return workflowsRepo.finish(run.id, { status: "skipped", error: out.skip });
    try {
      const res = await senders[w.channel](out.msg);
      await workflowsRepo.finish(run.id, { status: "sent", recipient: out.to, message: out.summary, providerMessageId: res.providerMessageId });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      const base = { recipient: out.to, message: out.summary, error };
      if (err instanceof NotConfigured) return workflowsRepo.finish(run.id, { ...base, status: "skipped" });
      if (run.attempts >= MAX_ATTEMPTS) return workflowsRepo.finish(run.id, { ...base, status: "failed" });
      await workflowsRepo.retryAt(run.id, new Date(now.getTime() + RETRY_AFTER_MIN[run.attempts - 1] * MIN), error);
    }
  }

  return {
    get,
    list: () => workflowsRepo.list(),
    runs: async (id: string, limit = 50) => workflowsRepo.listRuns((await get(id)).id, limit),
    onBookingEvent,

    async create(actor: Actor, input: WorkflowInput) {
      const data = workflowInput.parse(input);
      await checkServices(data.serviceIds);
      return workflowsRepo.create(data, { actor, action: "create", entity: "workflow", details: { name: data.name, trigger: data.trigger } });
    },

    async update(actor: Actor, id: string, input: WorkflowInput) {
      const data = workflowInput.parse(input);
      await get(id);
      await checkServices(data.serviceIds);
      const row = await workflowsRepo.update(id, data, { actor, action: "update", entity: "workflow", entityId: id, details: { name: data.name } });
      if (!row) throw new DomainError("not_found", `Workflow ${id} not found`);
      return row;
    },

    async remove(actor: Actor, id: string) {
      const w = await get(id);
      await workflowsRepo.remove(id, { actor, action: "delete", entity: "workflow", entityId: id, details: { name: w.name } });
    },

    /** Sends what is due. Safe to call from several places at once. */
    async processDue(opts: { now?: Date; limit?: number } = {}) {
      const now = opts.now ?? new Date();
      const due = await workflowsRepo.claimDue(now, opts.limit ?? 25, LEASE_MIN);
      for (const run of due) {
        try {
          await sendOne(run, now);
        } catch (err) {
          // A bug or a dropped database connection: leave the lease to expire and try again later.
          console.error(`Workflow run ${run.id} failed`, err);
        }
      }
      return due.length;
    },
  };
}

export type WorkflowsService = ReturnType<typeof createWorkflowsService>;
