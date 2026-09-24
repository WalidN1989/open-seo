import { createFileRoute } from "@tanstack/react-router";
import { whatsappWebhookResponse } from "@/server/features/communications/providers/whatsapp";
import { SmsWebhookService } from "@/server/features/sms/services/SmsWebhookService";

/**
 * Twilio's "a message comes in" and status-callback URL for one SMS number.
 * Any plain-text body would be texted back to the customer, so success is
 * answered with empty TwiML.
 */
export const Route = createFileRoute("/api/sms/twilio/$connectionId")({
  server: {
    handlers: {
      POST: async ({ params, request }) => {
        const result = await SmsWebhookService.processTwilioSms(
          params.connectionId,
          request.url,
          request.headers,
          await request.text(),
        );
        return whatsappWebhookResponse(result);
      },
    },
  },
});
