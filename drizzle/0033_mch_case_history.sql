ALTER TABLE "case_history" DROP CONSTRAINT "case_history_risk_suicide";--> statement-breakpoint
ALTER TABLE "case_history" DROP CONSTRAINT "case_history_risk_self_harm";--> statement-breakpoint
ALTER TABLE "case_history" DROP CONSTRAINT "case_history_risk_others";--> statement-breakpoint
ALTER TABLE "session_note" DROP CONSTRAINT "session_note_risk";--> statement-breakpoint
ALTER TABLE "case_history" ADD COLUMN "educational_history" text;--> statement-breakpoint
ALTER TABLE "case_history" ADD COLUMN "occupational_history" text;--> statement-breakpoint
ALTER TABLE "case_history" ADD COLUMN "relationship_history" text;--> statement-breakpoint
ALTER TABLE "case_history" ADD COLUMN "social_history" text;--> statement-breakpoint
ALTER TABLE "case_history" ADD COLUMN "mse_behaviour" text;--> statement-breakpoint
ALTER TABLE "case_history" ADD COLUMN "mse_eye_contact" text;--> statement-breakpoint
ALTER TABLE "case_history" ADD COLUMN "mse_mood_affect" text;--> statement-breakpoint
ALTER TABLE "case_history" ADD COLUMN "mse_thought_process" text;--> statement-breakpoint
ALTER TABLE "case_history" ADD COLUMN "mse_thought_content" text;--> statement-breakpoint
ALTER TABLE "case_history" ADD COLUMN "mse_insight_judgement" text;--> statement-breakpoint
ALTER TABLE "case_history" ADD COLUMN "clinical_observation" text;--> statement-breakpoint
ALTER TABLE "case_history" ADD COLUMN "risk_notes" text;--> statement-breakpoint
ALTER TABLE "case_history" ADD COLUMN "therapist_notes" text;--> statement-breakpoint
ALTER TABLE "case_history" ADD COLUMN "remarks" text;--> statement-breakpoint
ALTER TABLE "case_history" ADD COLUMN "mch_id" integer;--> statement-breakpoint
ALTER TABLE "client" ADD COLUMN "mch_code" text;--> statement-breakpoint
ALTER TABLE "client" ADD COLUMN "mch_id" integer;--> statement-breakpoint
ALTER TABLE "session_note" ADD COLUMN "duration_text" text;--> statement-breakpoint
ALTER TABLE "session_note" ADD COLUMN "clinical_observation" text;--> statement-breakpoint
ALTER TABLE "session_note" ADD COLUMN "progress_notes" text;--> statement-breakpoint
ALTER TABLE "session_note" ADD COLUMN "therapist_signature" text;--> statement-breakpoint
ALTER TABLE "session_note" ADD COLUMN "mch_id" integer;--> statement-breakpoint
ALTER TABLE "case_history" ADD CONSTRAINT "case_history_mch_id_unique" UNIQUE("mch_id");--> statement-breakpoint
ALTER TABLE "client" ADD CONSTRAINT "client_mch_id_unique" UNIQUE("mch_id");--> statement-breakpoint
ALTER TABLE "session_note" ADD CONSTRAINT "session_note_mch_id_unique" UNIQUE("mch_id");--> statement-breakpoint
ALTER TABLE "case_history" ADD CONSTRAINT "case_history_risk_suicide" CHECK ("case_history"."risk_suicide" in ('none', 'low', 'moderate', 'high', 'severe'));--> statement-breakpoint
ALTER TABLE "case_history" ADD CONSTRAINT "case_history_risk_self_harm" CHECK ("case_history"."risk_self_harm" in ('none', 'low', 'moderate', 'high', 'severe'));--> statement-breakpoint
ALTER TABLE "case_history" ADD CONSTRAINT "case_history_risk_others" CHECK ("case_history"."risk_others" in ('none', 'low', 'moderate', 'high', 'severe'));--> statement-breakpoint
ALTER TABLE "session_note" ADD CONSTRAINT "session_note_risk" CHECK ("session_note"."risk" in ('none', 'low', 'moderate', 'high', 'severe'));