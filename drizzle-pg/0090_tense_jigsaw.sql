CREATE TABLE "voice_book_link_settings" (
	"connection_id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"sender_id" text,
	"content_sid" text,
	"enabled" boolean DEFAULT false NOT NULL,
	"started_at" text
);
--> statement-breakpoint
ALTER TABLE "voice_phone_calls" ADD COLUMN "book_link_status" text;--> statement-breakpoint
ALTER TABLE "voice_book_link_settings" ADD CONSTRAINT "voice_book_link_settings_connection_id_integration_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."integration_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_book_link_settings" ADD CONSTRAINT "voice_book_link_settings_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_book_link_settings" ADD CONSTRAINT "voice_book_link_settings_sender_id_whatsapp_connections_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."whatsapp_connections"("id") ON DELETE set null ON UPDATE no action;