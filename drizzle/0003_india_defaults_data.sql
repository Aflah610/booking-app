-- The firm is in India. Phase 1 created the business row and early staff with UTC and USD defaults;
-- move anything still on those defaults to India time and rupees. Hours were always entered with
-- Indian wall-clock times in mind, so they now line up with what staff meant.
UPDATE "business" SET "timezone" = 'Asia/Kolkata' WHERE "timezone" = 'UTC';
--> statement-breakpoint
UPDATE "business" SET "currency" = 'INR' WHERE "currency" = 'USD';
--> statement-breakpoint
UPDATE "staff" SET "timezone" = 'Asia/Kolkata' WHERE "timezone" = 'UTC';
