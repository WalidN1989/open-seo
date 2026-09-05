CREATE TABLE "whatsapp_asked_questions" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"question" text NOT NULL,
	"normalized_question" text NOT NULL,
	"ask_count" integer DEFAULT 1 NOT NULL,
	"last_asked_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"blog_url" text,
	"status" text DEFAULT 'new' NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"updated_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_assistant_settings" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"autopilot" boolean DEFAULT true NOT NULL,
	"model" text,
	"reply_delay_seconds" integer DEFAULT 3 NOT NULL,
	"booking_link" text,
	"timezone" text,
	"business_hours_start" text,
	"business_hours_end" text,
	"escalation_keywords" text,
	"handoff_message" text,
	"persona" text,
	"business_facts" text,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"updated_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_instant_answers" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"question" text NOT NULL,
	"normalized_question" text NOT NULL,
	"answer" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"updated_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "whatsapp_asked_questions" ADD CONSTRAINT "whatsapp_asked_questions_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_assistant_settings" ADD CONSTRAINT "whatsapp_assistant_settings_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_instant_answers" ADD CONSTRAINT "whatsapp_instant_answers_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_asked_questions_org_question_idx" ON "whatsapp_asked_questions" USING btree ("organization_id","normalized_question");--> statement-breakpoint
CREATE INDEX "whatsapp_asked_questions_org_count_idx" ON "whatsapp_asked_questions" USING btree ("organization_id","ask_count");--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_instant_answers_org_question_idx" ON "whatsapp_instant_answers" USING btree ("organization_id","normalized_question");