-- The CRM stages: Follow up is no longer a stage (the follow-up date stays). Those leads are Contacted.
UPDATE "lead" SET "status" = 'contacted' WHERE "status" = 'follow_up';--> statement-breakpoint
DROP INDEX "lead_open_client_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "lead_open_client_idx" ON "lead" USING btree ("client_id") WHERE "lead"."status" not in ('converted', 'lost', 'junk');