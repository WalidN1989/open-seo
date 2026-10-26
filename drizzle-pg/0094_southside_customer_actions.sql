CREATE TABLE "customer_action_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'needs_approval' NOT NULL,
	"lead_id" text,
	"quote_id" text,
	"email_thread_id" text,
	"whatsapp_conversation_id" text,
	"sms_conversation_id" text,
	"request_json" text NOT NULL,
	"requested_by_user_id" text NOT NULL,
	"approved_by_user_id" text,
	"approved_at" text,
	"expires_at" text NOT NULL,
	"result_json" text,
	"error" text,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customer_action_requests" ADD CONSTRAINT "customer_action_requests_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_action_requests" ADD CONSTRAINT "customer_action_requests_lead_id_crm_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."crm_leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_action_requests" ADD CONSTRAINT "customer_action_requests_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_action_requests" ADD CONSTRAINT "customer_action_requests_email_thread_id_email_threads_id_fk" FOREIGN KEY ("email_thread_id") REFERENCES "public"."email_threads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_action_requests" ADD CONSTRAINT "customer_action_requests_whatsapp_conversation_id_whatsapp_conversations_id_fk" FOREIGN KEY ("whatsapp_conversation_id") REFERENCES "public"."whatsapp_conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_action_requests" ADD CONSTRAINT "customer_action_requests_sms_conversation_id_sms_conversations_id_fk" FOREIGN KEY ("sms_conversation_id") REFERENCES "public"."sms_conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customer_actions_org_status_idx" ON "customer_action_requests" USING btree ("organization_id","status","created_at");