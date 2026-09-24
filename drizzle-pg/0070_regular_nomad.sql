CREATE TABLE "client_logins" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_by_user_id" text,
	"demo_data" boolean DEFAULT false NOT NULL,
	"welcome_status" text,
	"welcome_sent_at" text,
	"nudge_stage" integer DEFAULT 0 NOT NULL,
	"last_nudge_at" text,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "client_logins" ADD CONSTRAINT "client_logins_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "client_logins_user_idx" ON "client_logins" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "client_logins_stage_idx" ON "client_logins" USING btree ("nudge_stage");