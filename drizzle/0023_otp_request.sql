CREATE TABLE "otp_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_no" integer GENERATED ALWAYS AS IDENTITY (sequence name "otp_request_request_no_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"reference" text NOT NULL,
	"phone_e164" text NOT NULL,
	"country_code" text,
	"code_hash" text NOT NULL,
	"status" text DEFAULT 'created' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"sent_at" timestamp with time zone,
	"verified_at" timestamp with time zone,
	"provider_message_id" text,
	"failure_reason" text,
	"api_key_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "otp_request_request_no_unique" UNIQUE("request_no"),
	CONSTRAINT "otp_request_reference_unique" UNIQUE("reference"),
	CONSTRAINT "otp_request_status" CHECK ("otp_request"."status" in ('created','verified','not_verified','replaced','send_failed'))
);
--> statement-breakpoint
ALTER TABLE "otp_request" ADD CONSTRAINT "otp_request_api_key_id_api_key_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_key"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "otp_request_phone_idx" ON "otp_request" USING btree ("phone_e164","created_at");--> statement-breakpoint
CREATE INDEX "otp_request_created_idx" ON "otp_request" USING btree ("created_at");