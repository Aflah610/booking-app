import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// Every timestamp is stored in UTC (timestamptz). Staff carry their own time zone.
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

export const staffRole = pgEnum("staff_role", ["admin", "manager", "staff"]);
export const bookingStatus = pgEnum("booking_status", ["upcoming", "completed", "cancelled", "no_show"]);
export const paymentStatus = pgEnum("payment_status", ["pending", "paid", "failed", "not_required"]);
export const noShowBy = pgEnum("no_show_by", ["client", "staff"]);
export const bookingSource = pgEnum("booking_source", ["web", "staff"]);
export const notificationChannel = pgEnum("notification_channel", ["whatsapp", "email"]);
export const notificationStatus = pgEnum("notification_status", ["queued", "sent", "delivered", "failed"]);
export const workflowTrigger = pgEnum("workflow_trigger", [
  "booked", "rescheduled", "cancelled", "completed", "no_show", "appointment_start", "appointment_end", "payment_success", "payment_failed",
]);
export const workflowTiming = pgEnum("workflow_timing", ["immediately", "before", "after"]);
export const workflowChannel = pgEnum("workflow_channel", ["email", "whatsapp", "webhook"]);
export const workflowRunStatus = pgEnum("workflow_run_status", ["queued", "sent", "failed", "skipped", "cancelled"]);

/** Days the whole firm is closed (public holidays, a team day). Every staff member is unavailable that date. */
export const holiday = pgTable("holiday", {
  id: uuid("id").primaryKey().defaultRandom(),
  date: date("date", { mode: "string" }).notNull().unique(),
  name: text("name").notNull(),
  createdAt: createdAt(),
});

/** Single-row business settings. */
export const business = pgTable("business", {
  id: smallint("id").primaryKey().default(1),
  name: text("name").notNull().default("My firm"),
  // The firm is in India; IANA zone and ISO 4217 currency.
  timezone: text("timezone").notNull().default("Asia/Kolkata"),
  currency: text("currency").notNull().default("INR"),
  bookingPrefix: text("booking_prefix").notNull().default("BK-"),
  slotIntervalMin: integer("slot_interval_min").notNull().default(15),
  minNoticeMin: integer("min_notice_min").notNull().default(60),
  maxNoticeDays: integer("max_notice_days").notNull().default(60),
  clientCutoffMin: integer("client_cutoff_min").notNull().default(24 * 60),
  /** Look of the public booking page. */
  logoUrl: text("logo_url"),
  brandColor: text("brand_color").notNull().default("#000000"),
  welcomeText: text("welcome_text"),
  /** Page on the firm's website where a client finishes an unpaid booking; used in "complete your payment" messages. */
  resumeUrl: text("resume_url"),
  /** When on, website bookings of priced services are held for 15 minutes until the website reports a payment. */
  onlinePayment: boolean("online_payment").notNull().default(false),
  /** Online sessions: services marked "Google Meet" get a Meet link in the therapist's calendar event. */
  meetEnabled: boolean("meet_enabled").notNull().default(false),
  /** Emails use the branded design (logo, green and gold) instead of plain text. */
  emailBranded: boolean("email_branded").notNull().default(true),
  updatedAt: updatedAt(),
}, (t) => [check("business_single_row", sql`${t.id} = 1`)]);

export const staff = pgTable("staff", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  role: staffRole("role").notNull().default("staff"),
  timezone: text("timezone").notNull().default("Asia/Kolkata"),
  active: boolean("active").notNull().default(true),
  /** scrypt hash for email-and-password sign-in; null = this person signs in with Google or Zoho only. */
  passwordHash: text("password_hash"),
  /** SHA-256 of the one-time "forgot password" link's token (the token itself is only ever in the email), and when the link stops working. */
  resetTokenHash: text("reset_token_hash"),
  resetExpiresAt: timestamp("reset_expires_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex("staff_email_lower_idx").on(sql`lower(${t.email})`)]);

export const service = pgTable("service", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  durationMin: integer("duration_min").notNull(),
  bufferBeforeMin: integer("buffer_before_min").notNull().default(0),
  bufferAfterMin: integer("buffer_after_min").notNull().default(0),
  priceDisplay: text("price_display"),
  /** Amount charged online, in paise (derived from the price). Null = nothing to pay online. */
  pricePaise: integer("price_paise"),
  // Per-service overrides of the business defaults (null = use the business setting).
  slotIntervalMin: integer("slot_interval_min"),
  minNoticeMin: integer("min_notice_min"),
  maxNoticeDays: integer("max_notice_days"),
  /** Most bookings of this service the firm takes on one day; null = no limit. */
  maxPerDay: integer("max_per_day"),
  /** Where it happens: an address or a meeting link. Shown to the client and in calendar invites. */
  location: text("location"),
  /** Where the session happens. "google_meet" gets a Meet link (if the firm and the therapist have it switched on). */
  meetingType: text("meeting_type").$type<"in_person" | "google_meet">().notNull().default("in_person"),
  /** Extra questions on the booking form: [{ id, label, type, required, options? }]. */
  questions: jsonb("questions").$type<{ id: string; label: string; type: "text" | "longtext" | "choice"; required: boolean; options?: string[] }[]>().notNull().default(sql`'[]'::jsonb`),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  check("service_duration_positive", sql`${t.durationMin} > 0`),
  check("service_buffers_non_negative", sql`${t.bufferBeforeMin} >= 0 and ${t.bufferAfterMin} >= 0`),
]);

export const staffService = pgTable("staff_service", {
  staffId: uuid("staff_id").notNull().references(() => staff.id, { onDelete: "cascade" }),
  serviceId: uuid("service_id").notNull().references(() => service.id, { onDelete: "cascade" }),
  /** This person's own price for the service, in paise (a therapist charging ₹5,000 where the service says ₹1,000). Null = the service's price. */
  pricePaise: integer("price_paise"),
}, (t) => [primaryKey({ columns: [t.staffId, t.serviceId] }), index("staff_service_service_idx").on(t.serviceId)]);

/** Weekly pattern in the staff member's own time zone. Several rows per day allowed. weekday: 0 = Sunday. */
export const workingHours = pgTable("working_hours", {
  id: uuid("id").primaryKey().defaultRandom(),
  staffId: uuid("staff_id").notNull().references(() => staff.id, { onDelete: "cascade" }),
  weekday: smallint("weekday").notNull(),
  startTime: time("start_time").notNull(),
  endTime: time("end_time").notNull(),
}, (t) => [
  index("working_hours_staff_idx").on(t.staffId),
  check("working_hours_weekday_range", sql`${t.weekday} between 0 and 6`),
  check("working_hours_start_before_end", sql`${t.startTime} < ${t.endTime}`),
]);

/** Holidays, leave, sick days and blocked time. */
export const timeOff = pgTable("time_off", {
  id: uuid("id").primaryKey().defaultRandom(),
  staffId: uuid("staff_id").notNull().references(() => staff.id, { onDelete: "cascade" }),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  reason: text("reason"),
  createdAt: createdAt(),
}, (t) => [
  index("time_off_staff_range_idx").on(t.staffId, t.startsAt),
  check("time_off_start_before_end", sql`${t.startsAt} < ${t.endsAt}`),
]);

/**
 * Hours for one specific date that replace the weekly pattern for that date (in the staff member's zone).
 * Several rows per date allowed. A row with no times means "not working that day".
 */
export const dateOverride = pgTable("date_override", {
  id: uuid("id").primaryKey().defaultRandom(),
  staffId: uuid("staff_id").notNull().references(() => staff.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  startTime: time("start_time"),
  endTime: time("end_time"),
  createdAt: createdAt(),
}, (t) => [
  index("date_override_staff_date_idx").on(t.staffId, t.date),
  check(
    "date_override_times",
    sql`(${t.startTime} is null and ${t.endTime} is null) or (${t.startTime} < ${t.endTime})`,
  ),
]);

export const calendarConnection = pgTable("calendar_connection", {
  staffId: uuid("staff_id").notNull().references(() => staff.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  encryptedTokens: text("encrypted_tokens").notNull(),
  /** The Google account that was connected, shown so staff know which calendar this is. */
  accountEmail: text("account_email"),
  /** Write this person's bookings into their calendar. */
  pushBookings: boolean("push_bookings").notNull().default(true),
  /** Add the client as a guest on the event, so Google emails them an invitation and adds it to their calendar. */
  inviteClients: boolean("invite_clients").notNull().default(false),
  /** Treat events in their calendar as busy time, so clients can't book over them. */
  blockBusy: boolean("block_busy").notNull().default(true),
  /** Create a Google Meet link on events for online sessions. */
  createMeetLinks: boolean("create_meet_links").notNull().default(true),
  /** The calendar we read busy times from and write bookings to. */
  calendarId: text("calendar_id").notNull().default("primary"),
  /** Provider's incremental sync token, so each sync only fetches changes. */
  syncCursor: text("sync_cursor"),
  /** Push-notification channel; renewed by a scheduled job before it expires. */
  channelId: text("channel_id"),
  channelResourceId: text("channel_resource_id"),
  channelExpiresAt: timestamp("channel_expires_at", { withTimezone: true }),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  errorCount: integer("error_count").notNull().default(0),
  lastError: text("last_error"),
  updatedAt: updatedAt(),
}, (t) => [primaryKey({ columns: [t.staffId, t.provider] }), uniqueIndex("calendar_connection_channel_idx").on(t.channelId)]);

/** Busy times copied from a staff member's external calendar, so slot requests never wait on Google. */
export const calendarBusy = pgTable("calendar_busy", {
  id: uuid("id").primaryKey().defaultRandom(),
  staffId: uuid("staff_id").notNull().references(() => staff.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  externalId: text("external_id").notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex("calendar_busy_external_idx").on(t.staffId, t.provider, t.externalId),
  index("calendar_busy_staff_range_idx").on(t.staffId, t.startsAt),
  check("calendar_busy_start_before_end", sql`${t.startsAt} < ${t.endsAt}`),
]);

/** A staff member's own settings for how screens look, such as which columns a list shows. Key and value are the screen's business. */
export const staffPreference = pgTable("staff_preference", {
  staffId: uuid("staff_id").notNull().references(() => staff.id, { onDelete: "cascade" }),
  key: text("key").notNull(),
  value: jsonb("value").$type<unknown>().notNull(),
  updatedAt: updatedAt(),
}, (t) => [primaryKey({ columns: [t.staffId, t.key] })]);

/** Personal data about clients lives only here. */
export const client = pgTable("client", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  phoneE164: text("phone_e164").notNull().unique(),
  email: text("email"),
  whatsappOptIn: boolean("whatsapp_opt_in").notNull().default(false),
  notes: text("notes"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [check("client_phone_e164", sql`${t.phoneE164} ~ '^\\+[1-9][0-9]{6,14}$'`)]);

export const servicePackage = pgTable("package", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  serviceIds: uuid("service_ids").array().notNull().default(sql`'{}'::uuid[]`),
  sessions: integer("sessions").notNull(),
  validityDays: integer("validity_days"),
  priceDisplay: text("price_display"),
  /** What the client pays for the whole package, in paise. */
  pricePaise: integer("price_paise").notNull().default(0),
  /** How much service price one credit covers, in paise (₹1,000 by default): a ₹1,500 service takes 1.5 credits. */
  creditValuePaise: integer("credit_value_paise").notNull().default(100000),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
}, (t) => [check("package_sessions_positive", sql`${t.sessions} > 0`)]);

export const clientPackage = pgTable("client_package", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id").notNull().references(() => client.id, { onDelete: "cascade" }),
  packageId: uuid("package_id").notNull().references(() => servicePackage.id),
  /** Credits and price as sold, so later edits to the package never change what this client bought. */
  pricePaise: integer("price_paise").notNull().default(0),
  /** Credits in thousandths (1,500 = 1.5 credits), so a part-used credit stays exact. */
  creditsTotalMilli: integer("credits_total_milli").notNull().default(0),
  creditsLeftMilli: integer("credits_left_milli").notNull().default(0),
  creditValuePaise: integer("credit_value_paise").notNull().default(100000),
  /** Money still unspent from what the client paid. It falls separately from credits: a dearer tier takes its full price. */
  valueLeftPaise: integer("value_left_paise").notNull().default(0),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  paymentNote: text("payment_note"),
  createdAt: createdAt(),
}, (t) => [
  index("client_package_client_idx").on(t.clientId),
  check("client_package_credits_within_total", sql`${t.creditsLeftMilli} >= 0 and ${t.creditsLeftMilli} <= ${t.creditsTotalMilli}`),
  check("client_package_credit_value_positive", sql`${t.creditValuePaise} > 0`),
  check("client_package_value_within_price", sql`${t.valueLeftPaise} >= 0 and ${t.valueLeftPaise} <= ${t.pricePaise}`),
]);

/** Money a client has paid in advance. Each top-up is its own lot so it can expire on its own date (one year). */
export const walletLot = pgTable("wallet_lot", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id").notNull().references(() => client.id, { onDelete: "cascade" }),
  amountPaise: integer("amount_paise").notNull(),
  remainingPaise: integer("remaining_paise").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  note: text("note"),
  createdAt: createdAt(),
}, (t) => [
  index("wallet_lot_client_idx").on(t.clientId, t.expiresAt),
  check("wallet_lot_amount_positive", sql`${t.amountPaise} > 0`),
  check("wallet_lot_remaining_within_amount", sql`${t.remainingPaise} >= 0 and ${t.remainingPaise} <= ${t.amountPaise}`),
]);

/**
 * Overlap protection: migration 0001 adds a Postgres exclusion constraint so one staff
 * member can never hold two non-cancelled bookings whose times overlap.
 */
export const booking = pgTable("booking", {
  id: uuid("id").primaryKey().defaultRandom(),
  number: bigint("number", { mode: "number" }).generatedAlwaysAsIdentity().notNull().unique(),
  serviceId: uuid("service_id").notNull().references(() => service.id),
  staffId: uuid("staff_id").notNull().references(() => staff.id),
  clientId: uuid("client_id").notNull().references(() => client.id),
  clientPackageId: uuid("client_package_id").references(() => clientPackage.id),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  status: bookingStatus("status").notNull().default("upcoming"),
  /** Set by staff for now; a payment provider can update it later. */
  paymentStatus: paymentStatus("payment_status").notNull().default("pending"),
  /** Online payment: when the current attempt runs out (15 minutes), and the last moment the client may still resume (24 hours). */
  paymentDueAt: timestamp("payment_due_at", { withTimezone: true }),
  resumeUntil: timestamp("resume_until", { withTimezone: true }),
  /** The time was given back because payment wasn't completed; the booking no longer blocks the calendar. */
  slotReleased: boolean("slot_released").notNull().default(false),
  amountPaise: integer("amount_paise"),
  /** What the session cost when it was booked (that therapist's price), whatever later paid for it. Null when the price is text or unknown. */
  pricePaise: integer("price_paise"),
  /** Paid with this many package credits (thousandths) and/or this much wallet money; both zero once returned. */
  creditMilli: integer("credit_milli").notNull().default(0),
  /** The video link clients join: made by Google, or pasted by staff. */
  meetingUrl: text("meeting_url"),
  meetingSource: text("meeting_source"),
  /** Staff override for this booking only: "on" gives it a Meet link even if the service is in person, "off" takes it away. Null follows the service. */
  meetingOverride: text("meeting_override"),
  creditPaise: integer("credit_paise").notNull().default(0),
  /** Who missed a no-show appointment. Empty for older no-shows and for every other status. */
  noShowBy: noShowBy("no_show_by"),
  source: bookingSource("source").notNull(),
  manageTokenHash: text("manage_token_hash"),
  /** From the Idempotency-Key header, so a retried create never books twice. */
  idempotencyKey: text("idempotency_key").unique(),
  cancellationReason: text("cancellation_reason"),
  cancelledBy: text("cancelled_by"),
  rescheduledFromId: uuid("rescheduled_from_id"),
  formAnswers: jsonb("form_answers").$type<Record<string, string>>().notNull().default({}),
  notes: text("notes"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  index("booking_staff_status_starts_idx").on(t.staffId, t.status, t.startsAt),
  index("booking_client_idx").on(t.clientId),
  index("booking_starts_idx").on(t.startsAt),
  index("booking_status_starts_idx").on(t.status, t.startsAt),
  check("booking_start_before_end", sql`${t.startsAt} < ${t.endsAt}`),
  check("booking_no_show_by_needs_no_show", sql`${t.noShowBy} is null or ${t.status} = 'no_show'`),
]);

/**
 * Short-lived hold on a slot while a client fills in the booking form on the website, so two people
 * can't both get to the last step for the same time. Expired holds are ignored and cleaned up.
 */
export const slotHold = pgTable("slot_hold", {
  id: uuid("id").primaryKey().defaultRandom(),
  staffId: uuid("staff_id").notNull().references(() => staff.id, { onDelete: "cascade" }),
  serviceId: uuid("service_id").notNull().references(() => service.id, { onDelete: "cascade" }),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  /** Hash of the hold token returned to the website; the booking request presents the token. */
  tokenHash: text("token_hash").notNull().unique(),
  releaseAt: timestamp("release_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
}, (t) => [
  index("slot_hold_staff_release_idx").on(t.staffId, t.releaseAt),
  check("slot_hold_start_before_end", sql`${t.startsAt} < ${t.endsAt}`),
]);

/** The event we wrote to a staff member's calendar for a booking, so reschedule and cancel update the right one. */
export const bookingCalendarEvent = pgTable("booking_calendar_event", {
  bookingId: uuid("booking_id").notNull().references(() => booking.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  externalEventId: text("external_event_id").notNull(),
  createdAt: createdAt(),
}, (t) => [primaryKey({ columns: [t.bookingId, t.provider] })]);

/**
 * A package or wallet top-up the website sold and told us about, with Razorpay's own details. The unique payment id
 * makes a repeated report (a retry, a double click) credit the client only once.
 */
export const creditPurchase = pgTable("credit_purchase", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id").notNull().references(() => client.id),
  kind: text("kind").notNull(),
  clientPackageId: uuid("client_package_id").references(() => clientPackage.id),
  walletLotId: uuid("wallet_lot_id").references(() => walletLot.id),
  amountPaise: integer("amount_paise").notNull(),
  currency: text("currency").notNull().default("INR"),
  razorpayOrderId: text("razorpay_order_id"),
  razorpayPaymentId: text("razorpay_payment_id").notNull().unique(),
  method: text("method"),
  paidAt: timestamp("paid_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
}, (t) => [
  index("credit_purchase_client_idx").on(t.clientId),
  check(
    "credit_purchase_one_target",
    sql`(${t.kind} = 'package' and ${t.clientPackageId} is not null and ${t.walletLotId} is null)
      or (${t.kind} = 'wallet' and ${t.walletLotId} is not null and ${t.clientPackageId} is null)`,
  ),
]);

/**
 * What a booking was paid with: one package session, or some wallet money from one lot. Kept after a cancel
 * (with `returned_at` set) so a balance can always be explained.
 */
export const creditUse = pgTable("credit_use", {
  id: uuid("id").primaryKey().defaultRandom(),
  bookingId: uuid("booking_id").notNull().references(() => booking.id, { onDelete: "cascade" }),
  clientPackageId: uuid("client_package_id").references(() => clientPackage.id),
  walletLotId: uuid("wallet_lot_id").references(() => walletLot.id),
  creditsMilli: integer("credits_milli").notNull().default(0),
  /** How much of the booking's price this use paid. */
  coveredPaise: integer("covered_paise").notNull().default(0),
  amountPaise: integer("amount_paise").notNull().default(0),
  /** What this use was worth in rupees: the money taken, or the package price divided by its sessions. */
  valuePaise: integer("value_paise").notNull().default(0),
  returnedAt: timestamp("returned_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [
  index("credit_use_booking_idx").on(t.bookingId),
  check(
    "credit_use_one_source",
    sql`(${t.clientPackageId} is not null and ${t.walletLotId} is null and ${t.creditsMilli} > 0 and ${t.amountPaise} = 0)
      or (${t.walletLotId} is not null and ${t.clientPackageId} is null and ${t.creditsMilli} = 0 and ${t.amountPaise} > 0)`,
  ),
]);

/**
 * Calendar writes waiting to happen. One row per booking, so a quick reschedule-then-cancel collapses to the last
 * thing that matters, and a Google outage delays the write without ever touching the booking itself.
 */
export const calendarJob = pgTable("calendar_job", {
  bookingId: uuid("booking_id").primaryKey().references(() => booking.id, { onDelete: "cascade" }),
  action: text("action").notNull(),
  runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  createdAt: createdAt(),
}, (t) => [index("calendar_job_due_idx").on(t.runAt), check("calendar_job_action", sql`${t.action} in ('upsert', 'delete')`)]);

export const notification = pgTable("notification", {
  id: uuid("id").primaryKey().defaultRandom(),
  bookingId: uuid("booking_id").notNull().references(() => booking.id, { onDelete: "cascade" }),
  channel: notificationChannel("channel").notNull(),
  template: text("template").notNull(),
  status: notificationStatus("status").notNull().default("queued"),
  providerMessageId: text("provider_message_id"),
  error: text("error"),
  /** When to send. Reminders are stored ahead of time and re-planned when a booking moves or is cancelled. */
  scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull().defaultNow(),
  attempts: integer("attempts").notNull().default(0),
  /** e.g. "<bookingId>:reminder_24h:whatsapp". A second enqueue of the same message is a no-op. */
  dedupeKey: text("dedupe_key").unique(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [
  index("notification_booking_idx").on(t.bookingId),
  index("notification_due_idx").on(t.status, t.scheduledFor),
]);

/** "When X happens to a booking, send Y". Empty `serviceIds` means every service. */
export const workflow = pgTable("workflow", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  active: boolean("active").notNull().default(true),
  trigger: workflowTrigger("trigger").notNull(),
  timing: workflowTiming("timing").notNull().default("immediately"),
  offsetMin: integer("offset_min").notNull().default(0),
  channel: workflowChannel("channel").notNull(),
  /** Channel settings (subject and body, WhatsApp template, or webhook URL), validated by Zod in the service. */
  config: jsonb("config").notNull().$type<Record<string, unknown>>(),
  serviceIds: uuid("service_ids").array().notNull().default(sql`'{}'::uuid[]`),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex("workflow_name_idx").on(sql`lower(${t.name})`),
  check("workflow_offset_non_negative", sql`${t.offsetMin} >= 0`),
  check("workflow_immediate_has_no_offset", sql`${t.timing} <> 'immediately' or ${t.offsetMin} = 0`),
]);

/** One message a workflow owes a booking. Doubles as the log: the rendered message is kept here. */
export const workflowRun = pgTable("workflow_run", {
  id: uuid("id").primaryKey().defaultRandom(),
  workflowId: uuid("workflow_id").notNull().references(() => workflow.id, { onDelete: "cascade" }),
  bookingId: uuid("booking_id").notNull().references(() => booking.id, { onDelete: "cascade" }),
  status: workflowRunStatus("status").notNull().default("queued"),
  scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull().defaultNow(),
  attempts: integer("attempts").notNull().default(0),
  recipient: text("recipient"),
  message: text("message"),
  error: text("error"),
  providerMessageId: text("provider_message_id"),
  /** "<workflowId>:<bookingId>": a second enqueue for the same booking is a no-op. */
  dedupeKey: text("dedupe_key").notNull().unique(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [
  index("workflow_run_due_idx").on(t.status, t.scheduledFor),
  index("workflow_run_booking_idx").on(t.bookingId),
  index("workflow_run_workflow_idx").on(t.workflowId, t.createdAt),
]);

/**
 * A payment reported against a booking: by the firm's website (which runs Razorpay Checkout) or typed in by
 * staff. This app never talks to Razorpay; it keeps the details so staff can find the payment there.
 */
export const payment = pgTable("payment", {
  id: uuid("id").primaryKey().defaultRandom(),
  bookingId: uuid("booking_id").notNull().references(() => booking.id, { onDelete: "cascade" }),
  status: text("status").notNull(),
  amountPaise: integer("amount_paise").notNull(),
  currency: text("currency").notNull().default("INR"),
  razorpayOrderId: text("razorpay_order_id"),
  /** Unique, so the website reporting the same payment twice (a retry) is recognised and not counted twice. */
  razorpayPaymentId: text("razorpay_payment_id").unique(),
  method: text("method"),
  /** When the provider says it happened; falls back to when we were told. */
  paidAt: timestamp("paid_at", { withTimezone: true }).notNull().defaultNow(),
  errorCode: text("error_code"),
  errorDescription: text("error_description"),
  source: text("source").notNull().default("website"),
  recordedByStaffId: uuid("recorded_by_staff_id").references(() => staff.id, { onDelete: "set null" }),
  notes: text("notes"),
  /** Money was taken for a booking that had already been cancelled; refund it in Razorpay. */
  needsRefund: boolean("needs_refund").notNull().default(false),
  createdAt: createdAt(),
}, (t) => [
  index("payment_booking_idx").on(t.bookingId),
  check("payment_status", sql`${t.status} in ('paid', 'failed', 'refunded')`),
  check("payment_amount_non_negative", sql`${t.amountPaise} >= 0`),
]);

/** Credentials for the firm's website and other tools. Only a SHA-256 hash of the key is stored. */
export const apiKey = pgTable("api_key", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  keyPrefix: text("key_prefix").notNull(),
  keyHash: text("key_hash").notNull().unique(),
  scopes: text("scopes").array().notNull().default(sql`'{}'::text[]`),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorStaffId: uuid("actor_staff_id").references(() => staff.id, { onDelete: "set null" }),
  actorApiKeyId: uuid("actor_api_key_id").references(() => apiKey.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entityId: text("entity_id"),
  details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: createdAt(),
}, (t) => [index("audit_log_entity_idx").on(t.entity, t.entityId)]);
