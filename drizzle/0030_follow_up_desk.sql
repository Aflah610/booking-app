CREATE TABLE "follow_up_message" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "follow_up_read" (
	"request_id" uuid NOT NULL,
	"staff_id" uuid NOT NULL,
	"read_at" timestamp with time zone NOT NULL,
	CONSTRAINT "follow_up_read_request_id_staff_id_pk" PRIMARY KEY("request_id","staff_id")
);
--> statement-breakpoint
CREATE TABLE "follow_up_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"psychologist_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"suggested_on" date,
	"part_of_day" text,
	"status" text DEFAULT 'new' NOT NULL,
	"booking_id" uuid,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "follow_up_message" ADD CONSTRAINT "follow_up_message_request_id_follow_up_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."follow_up_request"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_up_message" ADD CONSTRAINT "follow_up_message_author_id_staff_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_up_read" ADD CONSTRAINT "follow_up_read_request_id_follow_up_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."follow_up_request"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_up_read" ADD CONSTRAINT "follow_up_read_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_up_request" ADD CONSTRAINT "follow_up_request_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_up_request" ADD CONSTRAINT "follow_up_request_psychologist_id_staff_id_fk" FOREIGN KEY ("psychologist_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_up_request" ADD CONSTRAINT "follow_up_request_created_by_staff_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_up_request" ADD CONSTRAINT "follow_up_request_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "follow_up_message_request_idx" ON "follow_up_message" USING btree ("request_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "follow_up_request_open_idx" ON "follow_up_request" USING btree ("client_id") WHERE "follow_up_request"."status" not in ('booked', 'declined');--> statement-breakpoint
CREATE INDEX "follow_up_request_psychologist_idx" ON "follow_up_request" USING btree ("psychologist_id","last_message_at");--> statement-breakpoint
CREATE INDEX "follow_up_request_status_idx" ON "follow_up_request" USING btree ("status","last_message_at");