CREATE TABLE "email_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"provider" text NOT NULL,
	"display_name" text,
	"address" text NOT NULL,
	"pod_id" text,
	"inbox_id" text,
	"webhook_id" text,
	"credentials" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"last_error" text,
	"autopilot" boolean DEFAULT false NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"updated_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"account_id" text NOT NULL,
	"thread_id" text NOT NULL,
	"external_message_id" text,
	"direction" text NOT NULL,
	"from_address" text NOT NULL,
	"to_addresses" text DEFAULT '[]' NOT NULL,
	"subject" text,
	"text_body" text,
	"html_body" text,
	"status" text NOT NULL,
	"authored_by" text,
	"occurred_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_threads" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"account_id" text NOT NULL,
	"external_thread_id" text NOT NULL,
	"subject" text,
	"preview" text,
	"senders" text DEFAULT '[]' NOT NULL,
	"recipients" text DEFAULT '[]' NOT NULL,
	"message_count" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"last_message_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"updated_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "email_accounts" ADD CONSTRAINT "email_accounts_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_account_id_email_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."email_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_thread_id_email_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."email_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_threads" ADD CONSTRAINT "email_threads_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_threads" ADD CONSTRAINT "email_threads_account_id_email_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."email_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_accounts_org_idx" ON "email_accounts" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "email_accounts_provider_inbox_idx" ON "email_accounts" USING btree ("provider","inbox_id");--> statement-breakpoint
CREATE UNIQUE INDEX "email_messages_account_external_idx" ON "email_messages" USING btree ("account_id","external_message_id");--> statement-breakpoint
CREATE INDEX "email_messages_thread_idx" ON "email_messages" USING btree ("thread_id","occurred_at");--> statement-breakpoint
CREATE INDEX "email_messages_org_status_idx" ON "email_messages" USING btree ("organization_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "email_threads_account_external_idx" ON "email_threads" USING btree ("account_id","external_thread_id");--> statement-breakpoint
CREATE INDEX "email_threads_org_last_idx" ON "email_threads" USING btree ("organization_id","last_message_at");