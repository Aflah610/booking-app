ALTER TABLE "booking_calendar_event" ADD COLUMN "calendar_staff_id" uuid;--> statement-breakpoint
ALTER TABLE "business" ADD COLUMN "meet_staff_id" uuid;--> statement-breakpoint
ALTER TABLE "booking_calendar_event" ADD CONSTRAINT "booking_calendar_event_calendar_staff_id_staff_id_fk" FOREIGN KEY ("calendar_staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;