CREATE TABLE "staff_preference" (
	"staff_id" uuid NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_preference_staff_id_key_pk" PRIMARY KEY("staff_id","key")
);
--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "price_paise" integer;--> statement-breakpoint
ALTER TABLE "staff_preference" ADD CONSTRAINT "staff_preference_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
-- Bookings made before this stored no price: use what was due, else the service's own price.
UPDATE "booking" SET "price_paise" = COALESCE("amount_paise", (SELECT "price_paise" FROM "service" WHERE "service"."id" = "booking"."service_id"));
