ALTER TABLE "business" ADD COLUMN "whatsapp_msg_waba_id" text;--> statement-breakpoint
ALTER TABLE "business" ADD COLUMN "whatsapp_msg_phone_number_id" text;--> statement-breakpoint
ALTER TABLE "business" ADD COLUMN "whatsapp_msg_connected_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "business" ADD CONSTRAINT "whatsapp_distinct_numbers" CHECK ("business"."whatsapp_phone_number_id" IS NULL OR "business"."whatsapp_msg_phone_number_id" IS NULL OR "business"."whatsapp_phone_number_id" <> "business"."whatsapp_msg_phone_number_id");