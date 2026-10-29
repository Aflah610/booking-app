ALTER TABLE "booking" ADD COLUMN "is_follow_up" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "follow_up_source" text;