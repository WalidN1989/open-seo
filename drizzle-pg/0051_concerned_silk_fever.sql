CREATE TABLE "client_access_events" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"client_account_id" text,
	"channel" text DEFAULT 'whatsapp' NOT NULL,
	"identifier" text NOT NULL,
	"kind" text NOT NULL,
	"detail" text,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"client_organization_id" text NOT NULL,
	"display_name" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"code_hash" text,
	"code_salt" text,
	"code_hint" text,
	"code_issued_at" text,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"updated_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_contacts" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"client_account_id" text NOT NULL,
	"channel" text DEFAULT 'whatsapp' NOT NULL,
	"identifier" text NOT NULL,
	"display_name" text,
	"verified_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"revoked_at" text,
	"last_seen_at" text,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "client_access_events" ADD CONSTRAINT "client_access_events_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_access_events" ADD CONSTRAINT "client_access_events_client_account_id_client_accounts_id_fk" FOREIGN KEY ("client_account_id") REFERENCES "public"."client_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_accounts" ADD CONSTRAINT "client_accounts_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_accounts" ADD CONSTRAINT "client_accounts_client_organization_id_organization_id_fk" FOREIGN KEY ("client_organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_contacts" ADD CONSTRAINT "client_contacts_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_contacts" ADD CONSTRAINT "client_contacts_client_account_id_client_accounts_id_fk" FOREIGN KEY ("client_account_id") REFERENCES "public"."client_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "client_access_events_org_created_idx" ON "client_access_events" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "client_access_events_identifier_idx" ON "client_access_events" USING btree ("identifier","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "client_accounts_org_client_idx" ON "client_accounts" USING btree ("organization_id","client_organization_id");--> statement-breakpoint
CREATE INDEX "client_accounts_org_status_idx" ON "client_accounts" USING btree ("organization_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "client_contacts_channel_identifier_idx" ON "client_contacts" USING btree ("channel","identifier");--> statement-breakpoint
CREATE INDEX "client_contacts_account_idx" ON "client_contacts" USING btree ("client_account_id");