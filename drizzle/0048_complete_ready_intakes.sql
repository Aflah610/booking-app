-- Psychologists pressed Save on the last intake step, so intakes with complaints and a primary diagnosis stayed "Intake pending".
-- Those are complete by the app's own rule (completeIntake needs exactly these two); mark them so, by whoever last saved them.
UPDATE "case_history"
SET "status" = 'in_treatment', "intake_completed_at" = "updated_at", "intake_completed_by" = "updated_by"
WHERE "status" = 'intake_pending' AND "intake_completed_at" IS NULL
  AND coalesce(trim("presenting_complaints"), '') <> '' AND coalesce(trim("diagnosis_label"), '') <> '';
