CREATE TABLE "booking_calendar_event" (
	"booking_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"external_event_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booking_calendar_event_booking_id_provider_pk" PRIMARY KEY("booking_id","provider")
);
--> statement-breakpoint
CREATE TABLE "calendar_busy" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"external_id" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calendar_busy_start_before_end" CHECK ("calendar_busy"."starts_at" < "calendar_busy"."ends_at")
);
--> statement-breakpoint
CREATE TABLE "date_override" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_id" uuid NOT NULL,
	"date" date NOT NULL,
	"start_time" time,
	"end_time" time,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "date_override_times" CHECK (("date_override"."start_time" is null and "date_override"."end_time" is null) or ("date_override"."start_time" < "date_override"."end_time"))
);
--> statement-breakpoint
ALTER TABLE "business" ALTER COLUMN "timezone" SET DEFAULT 'Asia/Kolkata';--> statement-breakpoint
ALTER TABLE "business" ALTER COLUMN "currency" SET DEFAULT 'INR';--> statement-breakpoint
ALTER TABLE "staff" ALTER COLUMN "timezone" SET DEFAULT 'Asia/Kolkata';--> statement-breakpoint
ALTER TABLE "calendar_connection" ADD COLUMN "calendar_id" text DEFAULT 'primary' NOT NULL;--> statement-breakpoint
ALTER TABLE "calendar_connection" ADD COLUMN "channel_id" text;--> statement-breakpoint
ALTER TABLE "calendar_connection" ADD COLUMN "channel_resource_id" text;--> statement-breakpoint
ALTER TABLE "calendar_connection" ADD COLUMN "channel_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "calendar_connection" ADD COLUMN "last_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "calendar_connection" ADD COLUMN "error_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "calendar_connection" ADD COLUMN "last_error" text;--> statement-breakpoint
ALTER TABLE "booking_calendar_event" ADD CONSTRAINT "booking_calendar_event_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_busy" ADD CONSTRAINT "calendar_busy_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "date_override" ADD CONSTRAINT "date_override_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_busy_external_idx" ON "calendar_busy" USING btree ("staff_id","provider","external_id");--> statement-breakpoint
CREATE INDEX "calendar_busy_staff_range_idx" ON "calendar_busy" USING btree ("staff_id","starts_at");--> statement-breakpoint
CREATE INDEX "date_override_staff_date_idx" ON "date_override" USING btree ("staff_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_connection_channel_idx" ON "calendar_connection" USING btree ("channel_id");