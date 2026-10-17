CREATE TABLE "credit_use" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"client_package_id" uuid,
	"wallet_lot_id" uuid,
	"sessions" integer DEFAULT 0 NOT NULL,
	"amount_paise" integer DEFAULT 0 NOT NULL,
	"value_paise" integer DEFAULT 0 NOT NULL,
	"returned_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_use_one_source" CHECK (("credit_use"."client_package_id" is not null and "credit_use"."wallet_lot_id" is null and "credit_use"."sessions" = 1 and "credit_use"."amount_paise" = 0)
      or ("credit_use"."wallet_lot_id" is not null and "credit_use"."client_package_id" is null and "credit_use"."sessions" = 0 and "credit_use"."amount_paise" > 0))
);
--> statement-breakpoint
CREATE TABLE "wallet_lot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"amount_paise" integer NOT NULL,
	"remaining_paise" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallet_lot_amount_positive" CHECK ("wallet_lot"."amount_paise" > 0),
	CONSTRAINT "wallet_lot_remaining_within_amount" CHECK ("wallet_lot"."remaining_paise" >= 0 and "wallet_lot"."remaining_paise" <= "wallet_lot"."amount_paise")
);
--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "credit_session" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "credit_paise" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "client_package" ADD COLUMN "sessions_total" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "client_package" ADD COLUMN "price_paise" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "package" ADD COLUMN "price_paise" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "staff_service" ADD COLUMN "price_paise" integer;--> statement-breakpoint
ALTER TABLE "credit_use" ADD CONSTRAINT "credit_use_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_use" ADD CONSTRAINT "credit_use_client_package_id_client_package_id_fk" FOREIGN KEY ("client_package_id") REFERENCES "public"."client_package"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_use" ADD CONSTRAINT "credit_use_wallet_lot_id_wallet_lot_id_fk" FOREIGN KEY ("wallet_lot_id") REFERENCES "public"."wallet_lot"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_lot" ADD CONSTRAINT "wallet_lot_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "credit_use_booking_idx" ON "credit_use" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "wallet_lot_client_idx" ON "wallet_lot" USING btree ("client_id","expires_at");--> statement-breakpoint
ALTER TABLE "client_package" ADD CONSTRAINT "client_package_sessions_within_total" CHECK ("client_package"."sessions_left" <= "client_package"."sessions_total");