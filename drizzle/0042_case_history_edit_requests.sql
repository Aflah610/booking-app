CREATE TABLE "case_edit_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_history_id" uuid NOT NULL,
	"requester_id" uuid NOT NULL,
	"step" integer NOT NULL,
	"reason" text NOT NULL,
	"revision" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"reviewer_id" uuid,
	"decision_reason" text,
	"reviewed_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"used_at" timestamp with time zone,
	"previous_values" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "case_edit_request_step" CHECK ("case_edit_request"."step" between 2 and 6),
	CONSTRAINT "case_edit_request_status" CHECK ("case_edit_request"."status" in ('pending','approved','rejected','used','expired'))
);
--> statement-breakpoint
ALTER TABLE "case_history" ADD COLUMN "intake_revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "case_edit_request" ADD CONSTRAINT "case_edit_request_case_history_id_case_history_id_fk" FOREIGN KEY ("case_history_id") REFERENCES "public"."case_history"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_edit_request" ADD CONSTRAINT "case_edit_request_requester_id_staff_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_edit_request" ADD CONSTRAINT "case_edit_request_reviewer_id_staff_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "case_edit_request_open_idx" ON "case_edit_request" USING btree ("case_history_id","requester_id") WHERE "case_edit_request"."status" in ('pending','approved');--> statement-breakpoint
CREATE INDEX "case_edit_request_status_idx" ON "case_edit_request" USING btree ("status","created_at");