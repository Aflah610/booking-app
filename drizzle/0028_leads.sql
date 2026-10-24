CREATE TABLE "lead" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"source" text NOT NULL,
	"ad_id" text,
	"ad_headline" text,
	"ad_url" text,
	"assigned_to" uuid,
	"status" text DEFAULT 'new' NOT NULL,
	"follow_up_on" date,
	"notes" text,
	"last_message_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lead" ADD CONSTRAINT "lead_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead" ADD CONSTRAINT "lead_assigned_to_staff_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lead_open_client_idx" ON "lead" USING btree ("client_id") WHERE "lead"."status" not in ('converted', 'lost');--> statement-breakpoint
CREATE INDEX "lead_assignee_idx" ON "lead" USING btree ("assigned_to","created_at");