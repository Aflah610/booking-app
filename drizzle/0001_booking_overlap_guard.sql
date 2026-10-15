-- One staff member can never hold two live (non-cancelled) bookings whose times overlap.
-- Enforced by Postgres itself, so two simultaneous requests can't both win.
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_no_overlap"
  EXCLUDE USING gist ("staff_id" WITH =, tstzrange("starts_at", "ends_at", '[)') WITH &&)
  WHERE ("status" <> 'cancelled');
--> statement-breakpoint
INSERT INTO "business" ("id") VALUES (1) ON CONFLICT DO NOTHING;
