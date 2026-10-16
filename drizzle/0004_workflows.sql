CREATE TYPE "public"."workflow_channel" AS ENUM('email', 'whatsapp', 'webhook');--> statement-breakpoint
CREATE TYPE "public"."workflow_run_status" AS ENUM('queued', 'sent', 'failed', 'skipped', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."workflow_timing" AS ENUM('immediately', 'before', 'after');--> statement-breakpoint
CREATE TYPE "public"."workflow_trigger" AS ENUM('booked', 'rescheduled', 'cancelled', 'completed', 'no_show', 'appointment_start', 'appointment_end');--> statement-breakpoint
CREATE TABLE "workflow" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"trigger" "workflow_trigger" NOT NULL,
	"timing" "workflow_timing" DEFAULT 'immediately' NOT NULL,
	"offset_min" integer DEFAULT 0 NOT NULL,
	"channel" "workflow_channel" NOT NULL,
	"config" jsonb NOT NULL,
	"service_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workflow_offset_non_negative" CHECK ("workflow"."offset_min" >= 0),
	CONSTRAINT "workflow_immediate_has_no_offset" CHECK ("workflow"."timing" <> 'immediately' or "workflow"."offset_min" = 0)
);
--> statement-breakpoint
CREATE TABLE "workflow_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_id" uuid NOT NULL,
	"booking_id" uuid NOT NULL,
	"status" "workflow_run_status" DEFAULT 'queued' NOT NULL,
	"scheduled_for" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"recipient" text,
	"message" text,
	"error" text,
	"provider_message_id" text,
	"dedupe_key" text NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workflow_run_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
ALTER TABLE "workflow_run" ADD CONSTRAINT "workflow_run_workflow_id_workflow_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflow"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_run" ADD CONSTRAINT "workflow_run_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_name_idx" ON "workflow" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "workflow_run_due_idx" ON "workflow_run" USING btree ("status","scheduled_for");--> statement-breakpoint
CREATE INDEX "workflow_run_booking_idx" ON "workflow_run" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "workflow_run_workflow_idx" ON "workflow_run" USING btree ("workflow_id","created_at");