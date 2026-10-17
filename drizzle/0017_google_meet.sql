ALTER TABLE "booking" ADD COLUMN "meeting_url" text;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "meeting_source" text;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "meeting_override" text;--> statement-breakpoint
ALTER TABLE "business" ADD COLUMN "meet_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "calendar_connection" ADD COLUMN "create_meet_links" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "service" ADD COLUMN "meeting_type" text DEFAULT 'in_person' NOT NULL;