ALTER TYPE "public"."payment_status" ADD VALUE 'not_required';--> statement-breakpoint
ALTER TYPE "public"."workflow_trigger" ADD VALUE 'payment_success';--> statement-breakpoint
ALTER TYPE "public"."workflow_trigger" ADD VALUE 'payment_failed';--> statement-breakpoint
CREATE TABLE "payment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"status" text NOT NULL,
	"amount_paise" integer NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"razorpay_order_id" text,
	"razorpay_payment_id" text,
	"method" text,
	"paid_at" timestamp with time zone DEFAULT now() NOT NULL,
	"error_code" text,
	"error_description" text,
	"source" text DEFAULT 'website' NOT NULL,
	"recorded_by_staff_id" uuid,
	"notes" text,
	"needs_refund" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_razorpay_payment_id_unique" UNIQUE("razorpay_payment_id"),
	CONSTRAINT "payment_status" CHECK ("payment"."status" in ('paid', 'failed', 'refunded')),
	CONSTRAINT "payment_amount_non_negative" CHECK ("payment"."amount_paise" >= 0)
);
--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "payment_due_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "resume_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "slot_released" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "amount_paise" integer;--> statement-breakpoint
ALTER TABLE "business" ADD COLUMN "resume_url" text;--> statement-breakpoint
ALTER TABLE "business" ADD COLUMN "online_payment" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "service" ADD COLUMN "price_paise" integer;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_recorded_by_staff_id_staff_id_fk" FOREIGN KEY ("recorded_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_booking_idx" ON "payment" USING btree ("booking_id");