ALTER TABLE "lead" ADD COLUMN "assigned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "leads_online" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "leads_online_changed_at" timestamp with time zone;--> statement-breakpoint
UPDATE "lead" SET "assigned_at" = "created_at" WHERE "assigned_to" IS NOT NULL;
