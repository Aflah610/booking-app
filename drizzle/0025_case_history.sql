CREATE TABLE "case_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"status" text DEFAULT 'intake_pending' NOT NULL,
	"presenting_complaints" text,
	"onset" text,
	"duration" text,
	"severity" text,
	"history_present" text,
	"past_psychiatric" text,
	"medical_history" text,
	"medication" text,
	"family_history" text,
	"personal_history" text,
	"substance_use" text,
	"premorbid_personality" text,
	"mse_appearance" text,
	"mse_cooperation" text,
	"mse_rapport" text,
	"mse_speech" text,
	"mse_mood" text,
	"mse_affect" text,
	"mse_thought" text,
	"mse_perception" text,
	"mse_cognition" text,
	"mse_insight" text,
	"mse_judgement" text,
	"risk_suicide" text,
	"risk_self_harm" text,
	"risk_others" text,
	"diagnosis_code" text,
	"diagnosis_label" text,
	"diagnosis_secondary" text,
	"diagnosis_specifiers" text,
	"formulation" text,
	"goals_short" text,
	"goals_long" text,
	"approach" text,
	"frequency" text,
	"plan_notes" text,
	"intake_completed_at" timestamp with time zone,
	"intake_completed_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "case_history_client_id_unique" UNIQUE("client_id"),
	CONSTRAINT "case_history_status" CHECK ("case_history"."status" in ('intake_pending', 'in_treatment', 'concluded')),
	CONSTRAINT "case_history_onset" CHECK ("case_history"."onset" in ('sudden', 'gradual', 'unknown')),
	CONSTRAINT "case_history_severity" CHECK ("case_history"."severity" in ('mild', 'moderate', 'severe')),
	CONSTRAINT "case_history_cooperation" CHECK ("case_history"."mse_cooperation" in ('cooperative', 'partially', 'uncooperative')),
	CONSTRAINT "case_history_rapport" CHECK ("case_history"."mse_rapport" in ('good', 'fair', 'poor')),
	CONSTRAINT "case_history_affect" CHECK ("case_history"."mse_affect" in ('euthymic', 'anxious', 'depressed', 'irritable', 'elevated', 'blunted', 'labile')),
	CONSTRAINT "case_history_insight" CHECK ("case_history"."mse_insight" in ('good', 'partial', 'poor', 'absent')),
	CONSTRAINT "case_history_judgement" CHECK ("case_history"."mse_judgement" in ('good', 'fair', 'poor')),
	CONSTRAINT "case_history_risk_suicide" CHECK ("case_history"."risk_suicide" in ('none', 'low', 'moderate', 'high')),
	CONSTRAINT "case_history_risk_self_harm" CHECK ("case_history"."risk_self_harm" in ('none', 'low', 'moderate', 'high')),
	CONSTRAINT "case_history_risk_others" CHECK ("case_history"."risk_others" in ('none', 'low', 'moderate', 'high'))
);
--> statement-breakpoint
CREATE TABLE "session_note" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_history_id" uuid NOT NULL,
	"booking_id" uuid,
	"number" integer NOT NULL,
	"session_at" timestamp with time zone NOT NULL,
	"author_id" uuid NOT NULL,
	"summary" text NOT NULL,
	"risk" text,
	"response" text,
	"progress" text,
	"next_plan" text,
	"homework" text,
	"follow_up_on" date,
	"signed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_note_booking_id_unique" UNIQUE("booking_id"),
	CONSTRAINT "session_note_risk" CHECK ("session_note"."risk" in ('none', 'low', 'moderate', 'high')),
	CONSTRAINT "session_note_response" CHECK ("session_note"."response" in ('engaged', 'partially_engaged', 'resistant')),
	CONSTRAINT "session_note_progress" CHECK ("session_note"."progress" in ('improved', 'same', 'worse'))
);
--> statement-breakpoint
CREATE TABLE "session_note_addendum" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"note_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "clinical_admin" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "case_history" ADD CONSTRAINT "case_history_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_history" ADD CONSTRAINT "case_history_intake_completed_by_staff_id_fk" FOREIGN KEY ("intake_completed_by") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_history" ADD CONSTRAINT "case_history_updated_by_staff_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_note" ADD CONSTRAINT "session_note_case_history_id_case_history_id_fk" FOREIGN KEY ("case_history_id") REFERENCES "public"."case_history"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_note" ADD CONSTRAINT "session_note_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_note" ADD CONSTRAINT "session_note_author_id_staff_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_note_addendum" ADD CONSTRAINT "session_note_addendum_note_id_session_note_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."session_note"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_note_addendum" ADD CONSTRAINT "session_note_addendum_author_id_staff_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "session_note_number_idx" ON "session_note" USING btree ("case_history_id","number");--> statement-breakpoint
CREATE INDEX "session_note_addendum_note_idx" ON "session_note_addendum" USING btree ("note_id");