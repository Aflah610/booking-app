CREATE TABLE "follow_up" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_history_id" uuid NOT NULL,
	"suggested_on" date NOT NULL,
	"part_of_day" text,
	"note" text,
	"sent_by" uuid NOT NULL,
	"whatsapp" text NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "follow_up_part_of_day" CHECK ("follow_up"."part_of_day" in ('morning', 'afternoon', 'evening')),
	CONSTRAINT "follow_up_whatsapp" CHECK ("follow_up"."whatsapp" in ('sent', 'not_set_up', 'no_contact', 'failed', 'not_chosen')),
	CONSTRAINT "follow_up_email" CHECK ("follow_up"."email" in ('sent', 'not_set_up', 'no_contact', 'failed', 'not_chosen'))
);
--> statement-breakpoint
ALTER TABLE "follow_up" ADD CONSTRAINT "follow_up_case_history_id_case_history_id_fk" FOREIGN KEY ("case_history_id") REFERENCES "public"."case_history"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_up" ADD CONSTRAINT "follow_up_sent_by_staff_id_fk" FOREIGN KEY ("sent_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "follow_up_case_idx" ON "follow_up" USING btree ("case_history_id","created_at");