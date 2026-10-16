CREATE TABLE "calendar_job" (
	"booking_id" uuid PRIMARY KEY NOT NULL,
	"action" text NOT NULL,
	"run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calendar_job_action" CHECK ("calendar_job"."action" in ('upsert', 'delete'))
);
--> statement-breakpoint
ALTER TABLE "calendar_connection" ADD COLUMN "account_email" text;--> statement-breakpoint
ALTER TABLE "calendar_connection" ADD COLUMN "push_bookings" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "calendar_connection" ADD COLUMN "block_busy" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "calendar_job" ADD CONSTRAINT "calendar_job_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "calendar_job_due_idx" ON "calendar_job" USING btree ("run_at");