CREATE TABLE "holiday" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" date NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "holiday_date_unique" UNIQUE("date")
);
--> statement-breakpoint
ALTER TABLE "business" ADD COLUMN "logo_url" text;--> statement-breakpoint
ALTER TABLE "business" ADD COLUMN "brand_color" text DEFAULT '#000000' NOT NULL;--> statement-breakpoint
ALTER TABLE "business" ADD COLUMN "welcome_text" text;--> statement-breakpoint
ALTER TABLE "service" ADD COLUMN "max_per_day" integer;--> statement-breakpoint
ALTER TABLE "service" ADD COLUMN "location" text;--> statement-breakpoint
ALTER TABLE "service" ADD COLUMN "questions" jsonb DEFAULT '[]'::jsonb NOT NULL;