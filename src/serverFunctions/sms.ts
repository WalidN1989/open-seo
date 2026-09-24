import { createServerFn } from "@tanstack/react-start";
import { SmsService } from "@/server/features/sms/services/SmsService";
import { sendSmsSchema, smsConversationIdSchema } from "@/types/schemas/sms";
import { requireAuthenticatedContext } from "./middleware";

export const getSmsWorkspace = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .handler(({ context }) =>
    SmsService.workspace(context.organizationId, context.userId),
  );

export const getSmsThread = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(smsConversationIdSchema)
  .handler(({ context, data }) =>
    SmsService.thread(
      context.organizationId,
      context.userId,
      data.conversationId,
    ),
  );

export const sendSms = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(sendSmsSchema)
  .handler(({ context, data }) =>
    SmsService.send(context.organizationId, context.userId, data),
  );
