ALTER TABLE `voice_phone_calls` ADD `book_link_message_id` text REFERENCES whatsapp_messages(id) ON DELETE SET NULL;
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
