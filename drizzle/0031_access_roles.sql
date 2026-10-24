CREATE TABLE "role_permission" (
	"access_role" text NOT NULL,
	"permission" text NOT NULL,
	"allowed" boolean NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "role_permission_access_role_permission_pk" PRIMARY KEY("access_role","permission")
);
--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "access_role" text DEFAULT 'psychologist' NOT NULL;--> statement-breakpoint
-- Existing staff: admins and managers keep their rank; sales and coordinators by designation; everyone else treats clients.
UPDATE "staff" SET "access_role" = CASE WHEN "role" = 'admin' THEN 'admin' WHEN "role" = 'manager' THEN 'manager' WHEN "designation" = 'Sales Executive' THEN 'bde' WHEN "designation" = 'Consultation Coordinator' THEN 'ccd' ELSE 'psychologist' END;--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_access_role_check" CHECK ("access_role" in ('admin','manager','psychologist','bde','ccd'));
