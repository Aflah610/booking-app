ALTER TABLE "booking" ADD COLUMN "credit_milli" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "client_package" ADD COLUMN "credits_total_milli" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "client_package" ADD COLUMN "credits_left_milli" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "client_package" ADD COLUMN "credit_value_paise" integer DEFAULT 100000 NOT NULL;--> statement-breakpoint
ALTER TABLE "credit_use" ADD COLUMN "credits_milli" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "credit_use" ADD COLUMN "covered_paise" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "package" ADD COLUMN "credit_value_paise" integer DEFAULT 100000 NOT NULL;--> statement-breakpoint
-- Whole sessions become credits in thousandths: 3 sessions left = 3,000. A session was worth ₹1,000 of service price.
UPDATE "client_package" SET "credits_total_milli" = "sessions_total" * 1000, "credits_left_milli" = "sessions_left" * 1000;--> statement-breakpoint
UPDATE "credit_use" SET "credits_milli" = "sessions" * 1000, "covered_paise" = CASE WHEN "wallet_lot_id" IS NOT NULL THEN "amount_paise" ELSE "value_paise" END;--> statement-breakpoint
UPDATE "booking" SET "credit_milli" = 1000 WHERE "credit_session";
