export const TRIGGERS = ["booked", "rescheduled", "cancelled", "completed", "no_show", "appointment_start", "appointment_end", "payment_success", "payment_failed"] as const;
export type WorkflowTrigger = (typeof TRIGGERS)[number];
export const TIMINGS = ["immediately", "before", "after"] as const;
export type WorkflowTiming = (typeof TIMINGS)[number];
export const CHANNELS = ["email", "whatsapp", "webhook"] as const;
export type WorkflowChannel = (typeof CHANNELS)[number];
/** Notifications message a person; system workflows hand the booking to another program. */
export type WorkflowKind = "notification" | "system";
export const kindOf = (channel: WorkflowChannel): WorkflowKind => (channel === "webhook" ? "system" : "notification");
export const KIND_LABEL: Record<WorkflowKind, string> = { notification: "Notifications", system: "System" };
export type RunStatus = "queued" | "sent" | "failed" | "skipped" | "cancelled";

export const TRIGGER_LABEL: Record<WorkflowTrigger, string> = {
  booked: "Booking is made",
  rescheduled: "Booking is rescheduled",
  cancelled: "Booking is cancelled",
  completed: "Marked as completed",
  no_show: "Marked as no-show",
  appointment_start: "Appointment starts",
  appointment_end: "Appointment ends",
  payment_success: "Payment received",
  payment_failed: "Payment failed",
};
export const CHANNEL_LABEL: Record<WorkflowChannel, string> = { email: "Email", whatsapp: "WhatsApp", webhook: "Custom (webhook)" };

/** "Appointment starts · 24 hours before" */
export function whenLabel(w: Pick<WorkflowDTO, "trigger" | "timing" | "offsetMin">): string {
  const m = w.offsetMin;
  const span = m % 1440 === 0 ? `${m / 1440} day${m === 1440 ? "" : "s"}` : m % 60 === 0 ? `${m / 60} hour${m === 60 ? "" : "s"}` : `${m} minutes`;
  const timing = w.timing === "immediately" ? "straight away" : `${span} ${w.timing === "before" ? "before" : "after"}`;
  return `${TRIGGER_LABEL[w.trigger]} · ${timing}`;
}

/** Per-channel settings. The tag is `WorkflowDTO.channel`, kept on the row so it can be filtered. */
export type EmailConfig = {
  recipient: "client" | "staff";
  subject: string;
  body: string;
  /** Attach a calendar invite so Gmail, Outlook and Apple Mail offer to add (or remove) the appointment. */
  attachInvite?: boolean;
};
export type WhatsappConfig = { templateName: string; language: string; params: string[] };
export type WebhookConfig = { url: string };
export type WorkflowConfig = EmailConfig | WhatsappConfig | WebhookConfig;

export type WorkflowDTO = {
  id: string;
  name: string;
  active: boolean;
  trigger: WorkflowTrigger;
  timing: WorkflowTiming;
  offsetMin: number;
  channel: WorkflowChannel;
  config: WorkflowConfig;
  /** Empty means every service. */
  serviceIds: string[];
};

export type WorkflowRunDTO = {
  id: string;
  workflowId: string;
  bookingId: string;
  bookingNumber: number;
  status: RunStatus;
  scheduledFor: Date;
  attempts: number;
  recipient: string | null;
  message: string | null;
  error: string | null;
  sentAt: Date | null;
};

/** Everything a message can mention about a booking, joined once so rendering never queries again. */
export type BookingContextDTO = {
  bookingId: string;
  number: number;
  status: "upcoming" | "completed" | "cancelled" | "no_show";
  serviceId: string;
  serviceName: string;
  location: string | null;
  staffName: string;
  staffEmail: string;
  clientName: string;
  clientPhone: string;
  clientEmail: string | null;
  whatsappOptIn: boolean;
  startsAt: Date;
  endsAt: Date;
  cancellationReason: string | null;
  amountPaise: number | null;
  resumeUntil: Date | null;
  /** Same for a booking and every reschedule of it, so the client's calendar updates one entry instead of piling up. */
  calendarUid: string;
  /** How many times it has been moved; rises with each change so calendars take the newest. */
  calendarSequence: number;
};

/** A calendar invitation to send with an email. The sender adds who it is from. */
export type InviteDTO = {
  method: "REQUEST" | "CANCEL";
  uid: string;
  sequence: number;
  start: Date;
  end: Date;
  title: string;
  description: string;
  location: string | null;
  attendee: { name: string; email: string };
};

/** A message ready to hand to a channel. */
export type OutgoingMessage =
  | { channel: "email"; to: string; subject: string; body: string; invite?: InviteDTO }
  | { channel: "whatsapp"; to: string; templateName: string; language: string; params: string[] }
  | { channel: "webhook"; url: string; payload: Record<string, unknown> };

export type SendResult = { providerMessageId?: string };
/** Throw `NotConfigured` when the channel's settings are missing; the run is then logged as skipped. */
export type Sender = (msg: OutgoingMessage) => Promise<SendResult>;
export class NotConfigured extends Error {}
