-- Aflah (17 Nov 2026): Fathima Sidhyc has left. Take her off the psychologist lists and free times: no services, no hours.
-- Her bookings stay as they are (she takes her last one, BK-00061), and her staff record stays current until then.
DELETE FROM "staff_service" WHERE "staff_id" IN (SELECT "id" FROM "staff" WHERE "name" = 'Fathima Sidhyc');
--> statement-breakpoint
DELETE FROM "working_hours" WHERE "staff_id" IN (SELECT "id" FROM "staff" WHERE "name" = 'Fathima Sidhyc');
--> statement-breakpoint
DELETE FROM "date_override" WHERE "staff_id" IN (SELECT "id" FROM "staff" WHERE "name" = 'Fathima Sidhyc');
--> statement-breakpoint
-- New psychologists Ashlin and Emtesan Dilna offer Individual therapy, so they appear in the booking lists.
INSERT INTO "staff_service" ("staff_id", "service_id")
SELECT s."id", v."id" FROM "staff" s CROSS JOIN "service" v
WHERE s."name" IN ('Ashlin', 'Emtesan Dilna') AND lower(trim(v."name")) = 'individual therapy'
ON CONFLICT DO NOTHING;
