-- A booking whose payment ran out gives its time back (slot_released), so it must stop counting towards the
-- "no two live bookings overlap" guard. Postgres can't alter an exclusion constraint, so replace it.
ALTER TABLE "booking" DROP CONSTRAINT "booking_no_overlap";
--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_no_overlap"
  EXCLUDE USING gist ("staff_id" WITH =, tstzrange("starts_at", "ends_at", '[)') WITH &&)
  WHERE ("status" <> 'cancelled' AND NOT "slot_released");
--> statement-breakpoint
-- Services priced as plain rupees ("₹1,500", "₹499.50") get their online amount in paise. Text like "From ₹500"
-- or "Free" stays null: nothing is charged online until someone enters a plain price.
UPDATE "service"
SET "price_paise" = round(replace(replace("price_display", '₹', ''), ',', '')::numeric * 100)::int
WHERE "price_display" ~ '^₹[0-9,]+(\.[0-9]{1,2})?$';
