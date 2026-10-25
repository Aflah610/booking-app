ALTER TABLE "lead" ADD COLUMN "lost_reason" text;--> statement-breakpoint
ALTER TABLE "lead" ADD COLUMN "deal_booking_id" uuid;--> statement-breakpoint
ALTER TABLE "lead" ADD COLUMN "deal_amount_paise" integer;--> statement-breakpoint
ALTER TABLE "lead" ADD COLUMN "deal_note" text;--> statement-breakpoint
ALTER TABLE "lead" ADD CONSTRAINT "lead_deal_booking_id_booking_id_fk" FOREIGN KEY ("deal_booking_id") REFERENCES "public"."booking"("id") ON DELETE set null ON UPDATE no action;