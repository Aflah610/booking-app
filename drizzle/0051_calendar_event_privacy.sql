-- Client phone and email were in each calendar event's description, which everyone in the Meet call can read.
-- New events carry only the client's name; this rewrites the events of sessions still to come, without emailing guests.
ALTER TABLE "calendar_job" DROP CONSTRAINT "calendar_job_action";
--> statement-breakpoint
ALTER TABLE "calendar_job" ADD CONSTRAINT "calendar_job_action" CHECK ("action" in ('upsert', 'delete', 'refresh'));
--> statement-breakpoint
INSERT INTO "calendar_job" ("booking_id", "action", "run_at")
SELECT e."booking_id", 'refresh', now()
FROM "booking_calendar_event" e
JOIN "booking" b ON b."id" = e."booking_id"
WHERE b."status" = 'upcoming' AND b."ends_at" > now() AND NOT b."slot_released"
ON CONFLICT ("booking_id") DO NOTHING;
