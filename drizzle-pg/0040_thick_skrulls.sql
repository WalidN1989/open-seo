CREATE TABLE "whatsapp_contact_attributes" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"contact_id" text NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	"updated_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_contact_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"contact_id" text NOT NULL,
	"marketing_opt_in" boolean DEFAULT false NOT NULL,
	"utility_opt_in" boolean DEFAULT false NOT NULL,
	"use_whatsapp_name" boolean DEFAULT true NOT NULL,
	"updated_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_contact_tag_assignments" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"contact_id" text NOT NULL,
	"tag_id" text NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_internal_notes" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"author_member_id" text,
	"body" text NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_tags" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "whatsapp_contact_attributes" ADD CONSTRAINT "whatsapp_contact_attributes_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_contact_attributes" ADD CONSTRAINT "whatsapp_contact_attributes_contact_id_crm_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."crm_contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_contact_profiles" ADD CONSTRAINT "whatsapp_contact_profiles_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_contact_profiles" ADD CONSTRAINT "whatsapp_contact_profiles_contact_id_crm_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."crm_contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_contact_tag_assignments" ADD CONSTRAINT "whatsapp_contact_tag_assignments_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_contact_tag_assignments" ADD CONSTRAINT "whatsapp_contact_tag_assignments_contact_id_crm_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."crm_contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_contact_tag_assignments" ADD CONSTRAINT "whatsapp_contact_tag_assignments_tag_id_whatsapp_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."whatsapp_tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_internal_notes" ADD CONSTRAINT "whatsapp_internal_notes_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_internal_notes" ADD CONSTRAINT "whatsapp_internal_notes_conversation_id_whatsapp_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."whatsapp_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_internal_notes" ADD CONSTRAINT "whatsapp_internal_notes_author_member_id_member_id_fk" FOREIGN KEY ("author_member_id") REFERENCES "public"."member"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_tags" ADD CONSTRAINT "whatsapp_tags_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_contact_attributes_contact_key_idx" ON "whatsapp_contact_attributes" USING btree ("contact_id","key");--> statement-breakpoint
CREATE INDEX "whatsapp_contact_attributes_org_idx" ON "whatsapp_contact_attributes" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_contact_profiles_org_contact_idx" ON "whatsapp_contact_profiles" USING btree ("organization_id","contact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_contact_tags_contact_tag_idx" ON "whatsapp_contact_tag_assignments" USING btree ("contact_id","tag_id");--> statement-breakpoint
CREATE INDEX "whatsapp_contact_tags_org_idx" ON "whatsapp_contact_tag_assignments" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "whatsapp_internal_notes_conversation_idx" ON "whatsapp_internal_notes" USING btree ("organization_id","conversation_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_tags_org_name_idx" ON "whatsapp_tags" USING btree ("organization_id","name");