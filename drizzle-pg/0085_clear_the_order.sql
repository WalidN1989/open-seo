ALTER TABLE "whatsapp_order_requests" ADD COLUMN "expected_arrival" text;--> statement-breakpoint
ALTER TABLE "whatsapp_order_requests" ADD COLUMN "notified_at" text;--> statement-breakpoint
ALTER TABLE "whatsapp_order_requests" ADD COLUMN "notification_state" text;--> statement-breakpoint
ALTER TABLE "whatsapp_order_requests" ADD COLUMN "notification_message_id" text;--> statement-breakpoint
ALTER TABLE "whatsapp_order_requests" ADD CONSTRAINT "whatsapp_order_requests_notification_message_id_whatsapp_messages_id_fk" FOREIGN KEY ("notification_message_id") REFERENCES "public"."whatsapp_messages"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
UPDATE commerce_orders SET customer_phone = (SELECT coalesce(nullif(c.external_conversation_id, ''), nullif(p.whatsapp_phone, ''), nullif(p.phone, '')) FROM whatsapp_order_requests r
LEFT JOIN whatsapp_conversations c ON c.id = r.conversation_id AND c.organization_id = r.organization_id
LEFT JOIN crm_contacts p ON p.id = coalesce(r.contact_id, c.contact_id) AND p.organization_id = r.organization_id
WHERE r.id = commerce_orders.external_id AND r.organization_id = commerce_orders.organization_id)
WHERE external_source = 'whatsapp_order_request' AND (customer_phone IS NULL OR customer_phone = '')
AND EXISTS (SELECT 1 FROM whatsapp_order_requests r
LEFT JOIN whatsapp_conversations c ON c.id = r.conversation_id AND c.organization_id = r.organization_id
LEFT JOIN crm_contacts p ON p.id = coalesce(r.contact_id, c.contact_id) AND p.organization_id = r.organization_id
WHERE r.id = commerce_orders.external_id AND r.organization_id = commerce_orders.organization_id);

--> statement-breakpoint
UPDATE commerce_orders SET customer_name = (SELECT nullif(trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '') FROM whatsapp_order_requests r
LEFT JOIN whatsapp_conversations c ON c.id = r.conversation_id AND c.organization_id = r.organization_id
LEFT JOIN crm_contacts p ON p.id = coalesce(r.contact_id, c.contact_id) AND p.organization_id = r.organization_id
WHERE r.id = commerce_orders.external_id AND r.organization_id = commerce_orders.organization_id)
WHERE external_source = 'whatsapp_order_request' AND (customer_name IS NULL OR customer_name = '')
AND EXISTS (SELECT 1 FROM whatsapp_order_requests r
LEFT JOIN whatsapp_conversations c ON c.id = r.conversation_id AND c.organization_id = r.organization_id
LEFT JOIN crm_contacts p ON p.id = coalesce(r.contact_id, c.contact_id) AND p.organization_id = r.organization_id
WHERE r.id = commerce_orders.external_id AND r.organization_id = commerce_orders.organization_id);

--> statement-breakpoint
UPDATE commerce_orders SET contact_id = (SELECT p.id FROM whatsapp_order_requests r
LEFT JOIN whatsapp_conversations c ON c.id = r.conversation_id AND c.organization_id = r.organization_id
LEFT JOIN crm_contacts p ON p.id = coalesce(r.contact_id, c.contact_id) AND p.organization_id = r.organization_id
WHERE r.id = commerce_orders.external_id AND r.organization_id = commerce_orders.organization_id)
WHERE external_source = 'whatsapp_order_request' AND (contact_id IS NULL OR contact_id = '')
AND EXISTS (SELECT 1 FROM whatsapp_order_requests r
LEFT JOIN whatsapp_conversations c ON c.id = r.conversation_id AND c.organization_id = r.organization_id
LEFT JOIN crm_contacts p ON p.id = coalesce(r.contact_id, c.contact_id) AND p.organization_id = r.organization_id
WHERE r.id = commerce_orders.external_id AND r.organization_id = commerce_orders.organization_id);
