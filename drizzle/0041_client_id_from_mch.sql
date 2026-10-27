-- Client IDs follow MCH's series (ML-CL-00042): clients copied from MCH take their MCH number, any others are
-- numbered after the highest one, and new clients continue from there. Moved out of the way first so no two
-- clients ever hold the same number mid-way.
UPDATE "client" SET "number" = "number" + 100000000;--> statement-breakpoint
UPDATE "client" SET "number" = substring("mch_code" from '^ML-CL-([0-9]+)$')::int WHERE "mch_code" ~ '^ML-CL-[0-9]+$';--> statement-breakpoint
WITH "top" AS (SELECT coalesce(max("number"), 0) AS "n" FROM "client" WHERE "number" < 100000000),
     "rest" AS (SELECT "id", row_number() OVER (ORDER BY "created_at", "id") AS "rn" FROM "client" WHERE "number" >= 100000000)
UPDATE "client" SET "number" = "top"."n" + "rest"."rn" FROM "top", "rest" WHERE "client"."id" = "rest"."id";--> statement-breakpoint
SELECT setval(pg_get_serial_sequence('client', 'number'), (SELECT coalesce(max("number"), 0) + 1 FROM "client"), false);
