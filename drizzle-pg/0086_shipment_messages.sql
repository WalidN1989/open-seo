ALTER TABLE "commerce_order_sync" ADD COLUMN "shipment_messages_started_at" text;--> statement-breakpoint
ALTER TABLE "commerce_order_sync" ADD COLUMN "shipment_sender_id" text;--> statement-breakpoint
ALTER TABLE "commerce_order_sync" ADD COLUMN "waybill_template_id" text;--> statement-breakpoint
ALTER TABLE "commerce_order_sync" ADD COLUMN "delivery_estimate_template_id" text;--> statement-breakpoint
ALTER TABLE "commerce_order_sync" ADD CONSTRAINT "commerce_order_sync_shipment_sender_id_whatsapp_connections_id_fk" FOREIGN KEY ("shipment_sender_id") REFERENCES "public"."whatsapp_connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commerce_order_sync" ADD CONSTRAINT "commerce_order_sync_waybill_template_id_whatsapp_templates_id_fk" FOREIGN KEY ("waybill_template_id") REFERENCES "public"."whatsapp_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commerce_order_sync" ADD CONSTRAINT "commerce_order_sync_delivery_estimate_template_id_whatsapp_templates_id_fk" FOREIGN KEY ("delivery_estimate_template_id") REFERENCES "public"."whatsapp_templates"("id") ON DELETE set null ON UPDATE no action;