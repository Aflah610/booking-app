ALTER TABLE "client" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "client" ADD COLUMN "deleted_by" uuid;