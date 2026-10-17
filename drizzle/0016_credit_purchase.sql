CREATE TABLE "credit_purchase" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"client_package_id" uuid,
	"wallet_lot_id" uuid,
	"amount_paise" integer NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"razorpay_order_id" text,
	"razorpay_payment_id" text NOT NULL,
	"method" text,
	"paid_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_purchase_razorpay_payment_id_unique" UNIQUE("razorpay_payment_id"),
	CONSTRAINT "credit_purchase_one_target" CHECK (("credit_purchase"."kind" = 'package' and "credit_purchase"."client_package_id" is not null and "credit_purchase"."wallet_lot_id" is null)
      or ("credit_purchase"."kind" = 'wallet' and "credit_purchase"."wallet_lot_id" is not null and "credit_purchase"."client_package_id" is null))
);
--> statement-breakpoint
ALTER TABLE "credit_purchase" ADD CONSTRAINT "credit_purchase_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_purchase" ADD CONSTRAINT "credit_purchase_client_package_id_client_package_id_fk" FOREIGN KEY ("client_package_id") REFERENCES "public"."client_package"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_purchase" ADD CONSTRAINT "credit_purchase_wallet_lot_id_wallet_lot_id_fk" FOREIGN KEY ("wallet_lot_id") REFERENCES "public"."wallet_lot"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "credit_purchase_client_idx" ON "credit_purchase" USING btree ("client_id");