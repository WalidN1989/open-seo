ALTER TABLE "voice_phone_calls" ADD COLUMN "book_link_message_id" text;--> statement-breakpoint
ALTER TABLE "voice_phone_calls" ADD CONSTRAINT "voice_phone_calls_book_link_message_id_whatsapp_messages_id_fk" FOREIGN KEY ("book_link_message_id") REFERENCES "public"."whatsapp_messages"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
-- Link only pre-release test messages already claimed for the same call/workspace.
-- This attaches existing records; it never schedules or sends a message.
UPDATE voice_phone_calls SET book_link_message_id = (
 SELECT id FROM whatsapp_messages WHERE organization_id = voice_phone_calls.organization_id
 AND id = 'voice-book-link:' || voice_phone_calls.id
) WHERE book_link_message_id IS NULL AND EXISTS (
 SELECT 1 FROM whatsapp_messages WHERE organization_id = voice_phone_calls.organization_id
 AND id = 'voice-book-link:' || voice_phone_calls.id
);
