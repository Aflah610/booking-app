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
export const bookingSource = pgEnum("booking_source", ["web", "staff"]);
export const notificationChannel = pgEnum("notification_channel", ["whatsapp", "email"]);
export const notificationStatus = pgEnum("notification_status", ["queued", "sent", "delivered", "failed"]);

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
  updatedAt: updatedAt(),
}, (t) => [check("business_single_row", sql`${t.id} = 1`)]);

export const staff = pgTable("staff", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  role: staffRole("role").notNull().default("staff"),
  timezone: text("timezone").notNull().default("Asia/Kolkata"),
  active: boolean("active").notNull().default(true),
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
  // Per-service overrides of the business defaults (null = use the business setting).
  slotIntervalMin: integer("slot_interval_min"),
  minNoticeMin: integer("min_notice_min"),
  maxNoticeDays: integer("max_notice_days"),
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
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
}, (t) => [check("package_sessions_positive", sql`${t.sessions} > 0`)]);

export const clientPackage = pgTable("client_package", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id").notNull().references(() => client.id, { onDelete: "cascade" }),
  packageId: uuid("package_id").notNull().references(() => servicePackage.id),
  sessionsLeft: integer("sessions_left").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  paymentNote: text("payment_note"),
  createdAt: createdAt(),
}, (t) => [
  index("client_package_client_idx").on(t.clientId),
  check("client_package_sessions_non_negative", sql`${t.sessionsLeft} >= 0`),
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
  source: bookingSource("source").notNull(),
  manageTokenHash: text("manage_token_hash"),
  /** From the Idempotency-Key header, so a retried create never books twice. */
  idempotencyKey: text("idempotency_key").unique(),
  cancellationReason: text("cancellation_reason"),
  cancelledBy: text("cancelled_by"),
  rescheduledFromId: uuid("rescheduled_from_id"),
  formAnswers: jsonb("form_answers").$type<Record<string, unknown>>().notNull().default({}),
  notes: text("notes"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  index("booking_staff_status_starts_idx").on(t.staffId, t.status, t.startsAt),
  index("booking_client_idx").on(t.clientId),
  index("booking_starts_idx").on(t.startsAt),
  index("booking_status_starts_idx").on(t.status, t.startsAt),
  check("booking_start_before_end", sql`${t.startsAt} < ${t.endsAt}`),
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
