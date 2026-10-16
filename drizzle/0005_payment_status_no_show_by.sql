CREATE TYPE "public"."no_show_by" AS ENUM('client', 'staff');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('pending', 'paid', 'failed');--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "payment_status" "payment_status" DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "no_show_by" "no_show_by";--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_no_show_by_needs_no_show" CHECK ("booking"."no_show_by" is null or "booking"."status" = 'no_show');