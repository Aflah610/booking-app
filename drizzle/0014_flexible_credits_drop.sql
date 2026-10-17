ALTER TABLE "client_package" DROP CONSTRAINT "client_package_sessions_non_negative";--> statement-breakpoint
ALTER TABLE "client_package" DROP CONSTRAINT "client_package_sessions_within_total";--> statement-breakpoint
ALTER TABLE "credit_use" DROP CONSTRAINT "credit_use_one_source";--> statement-breakpoint
ALTER TABLE "booking" DROP COLUMN "credit_session";--> statement-breakpoint
ALTER TABLE "client_package" DROP COLUMN "sessions_left";--> statement-breakpoint
ALTER TABLE "client_package" DROP COLUMN "sessions_total";--> statement-breakpoint
ALTER TABLE "credit_use" DROP COLUMN "sessions";--> statement-breakpoint
ALTER TABLE "client_package" ADD CONSTRAINT "client_package_credits_within_total" CHECK ("client_package"."credits_left_milli" >= 0 and "client_package"."credits_left_milli" <= "client_package"."credits_total_milli");--> statement-breakpoint
ALTER TABLE "client_package" ADD CONSTRAINT "client_package_credit_value_positive" CHECK ("client_package"."credit_value_paise" > 0);--> statement-breakpoint
ALTER TABLE "credit_use" ADD CONSTRAINT "credit_use_one_source" CHECK (("credit_use"."client_package_id" is not null and "credit_use"."wallet_lot_id" is null and "credit_use"."credits_milli" > 0 and "credit_use"."amount_paise" = 0)
      or ("credit_use"."wallet_lot_id" is not null and "credit_use"."client_package_id" is null and "credit_use"."credits_milli" = 0 and "credit_use"."amount_paise" > 0));