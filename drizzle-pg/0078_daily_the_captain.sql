CREATE TABLE "commerce_loyalty_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"contact_id" text NOT NULL,
	"order_id" text,
	"source_id" text NOT NULL,
	"kind" text NOT NULL,
	"points" integer NOT NULL,
	"note" text,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commerce_order_effects" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"order_id" text NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"message_id" text,
	"invoice_id" text,
	"external_id" text,
	"error" text,
	"claimed_at" text,
	"completed_at" text,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commerce_shipment_events" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"shipment_id" text NOT NULL,
	"status" text NOT NULL,
	"reason" text,
	"event_at" text NOT NULL,
	"source" text NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "commerce_order_shipments" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "commerce_order_shipments" ADD COLUMN "last_event_at" text;--> statement-breakpoint
ALTER TABLE "commerce_order_shipments" ADD COLUMN "reason" text;--> statement-breakpoint
ALTER TABLE "commerce_order_shipments" ADD COLUMN "created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL;--> statement-breakpoint
ALTER TABLE "commerce_order_sync" ADD COLUMN "confirmation_started_at" text;--> statement-breakpoint
ALTER TABLE "commerce_order_sync" ADD COLUMN "operations_started_at" text;--> statement-breakpoint
ALTER TABLE "commerce_order_sync" ADD COLUMN "confirmation_sender_id" text;--> statement-breakpoint
ALTER TABLE "commerce_order_sync" ADD COLUMN "confirmation_template_id" text;--> statement-breakpoint
ALTER TABLE "commerce_order_sync" ADD COLUMN "pickup_template_id" text;--> statement-breakpoint
ALTER TABLE "commerce_order_sync" ADD COLUMN "cancellation_template_id" text;--> statement-breakpoint
ALTER TABLE "commerce_order_sync" ADD COLUMN "invoice_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "commerce_order_sync" ADD COLUMN "loyalty_minor_per_point" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "commerce_order_sync" ADD COLUMN "sender_name" text;--> statement-breakpoint
ALTER TABLE "commerce_order_sync" ADD COLUMN "sender_phone" text;--> statement-breakpoint
ALTER TABLE "commerce_order_sync" ADD COLUMN "sender_address_1" text;--> statement-breakpoint
ALTER TABLE "commerce_order_sync" ADD COLUMN "sender_address_2" text;--> statement-breakpoint
ALTER TABLE "commerce_order_sync" ADD COLUMN "sender_address_3" text;--> statement-breakpoint
ALTER TABLE "commerce_order_sync" ADD COLUMN "sender_city" text;--> statement-breakpoint
ALTER TABLE "commerce_order_sync" ADD COLUMN "parcel_weight_grams" integer DEFAULT 500 NOT NULL;--> statement-breakpoint
ALTER TABLE "commerce_loyalty_entries" ADD CONSTRAINT "commerce_loyalty_entries_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commerce_loyalty_entries" ADD CONSTRAINT "commerce_loyalty_entries_contact_id_crm_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."crm_contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commerce_loyalty_entries" ADD CONSTRAINT "commerce_loyalty_entries_order_id_commerce_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."commerce_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commerce_order_effects" ADD CONSTRAINT "commerce_order_effects_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commerce_order_effects" ADD CONSTRAINT "commerce_order_effects_order_id_commerce_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."commerce_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commerce_order_effects" ADD CONSTRAINT "commerce_order_effects_message_id_whatsapp_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."whatsapp_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commerce_order_effects" ADD CONSTRAINT "commerce_order_effects_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commerce_shipment_events" ADD CONSTRAINT "commerce_shipment_events_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commerce_shipment_events" ADD CONSTRAINT "commerce_shipment_events_shipment_id_commerce_order_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."commerce_order_shipments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "commerce_loyalty_entries_source_idx" ON "commerce_loyalty_entries" USING btree ("organization_id","source_id","kind");--> statement-breakpoint
CREATE INDEX "commerce_loyalty_entries_contact_idx" ON "commerce_loyalty_entries" USING btree ("organization_id","contact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "commerce_order_effects_once_idx" ON "commerce_order_effects" USING btree ("organization_id","order_id","kind");--> statement-breakpoint
CREATE INDEX "commerce_order_effects_due_idx" ON "commerce_order_effects" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "commerce_shipment_events_identity_idx" ON "commerce_shipment_events" USING btree ("organization_id","shipment_id","status","event_at");--> statement-breakpoint
ALTER TABLE "commerce_order_sync" ADD CONSTRAINT "commerce_order_sync_confirmation_sender_id_whatsapp_connections_id_fk" FOREIGN KEY ("confirmation_sender_id") REFERENCES "public"."whatsapp_connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commerce_order_sync" ADD CONSTRAINT "commerce_order_sync_confirmation_template_id_whatsapp_templates_id_fk" FOREIGN KEY ("confirmation_template_id") REFERENCES "public"."whatsapp_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commerce_order_sync" ADD CONSTRAINT "commerce_order_sync_pickup_template_id_whatsapp_templates_id_fk" FOREIGN KEY ("pickup_template_id") REFERENCES "public"."whatsapp_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commerce_order_sync" ADD CONSTRAINT "commerce_order_sync_cancellation_template_id_whatsapp_templates_id_fk" FOREIGN KEY ("cancellation_template_id") REFERENCES "public"."whatsapp_templates"("id") ON DELETE set null ON UPDATE no action;