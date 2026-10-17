ALTER TABLE "client_package" ADD COLUMN "value_left_paise" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- What each existing package has left is its price in proportion to its credits left.
UPDATE "client_package" SET "value_left_paise" = CASE WHEN "credits_total_milli" = 0 THEN 0 ELSE round("price_paise"::numeric * "credits_left_milli" / "credits_total_milli")::integer END;
--> statement-breakpoint
ALTER TABLE "client_package" ADD CONSTRAINT "client_package_value_within_price" CHECK ("client_package"."value_left_paise" >= 0 and "client_package"."value_left_paise" <= "client_package"."price_paise");