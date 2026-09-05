import { createServerFn } from "@tanstack/react-start";
import { EmailService } from "@/server/features/email/services/EmailService";
import { EmailAccountService } from "@/server/features/email/services/EmailAccountService";
import { requireAuthenticatedContext } from "@/serverFunctions/middleware";
import {
  approveEmailDraftSchema,
  composeEmailSchema,
  connectAgentmailSchema,
  emailMessageIdSchema,
  emailThreadIdSchema,
  sendEmailReplySchema,
  setEmailAutopilotSchema,
  setEmailThreadStatusSchema,
} from "@/types/schemas/email";

export const getEmailWorkspace = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .handler(({ context }) =>
    EmailService.workspace(context.organizationId, context.userId),
  );

export const getEmailThread = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .validator(emailThreadIdSchema)
  .handler(({ context, data }) =>
    EmailService.thread(context.organizationId, context.userId, data.threadId),
  );

export const connectAgentmail = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(connectAgentmailSchema)
  .handler(({ context, data }) =>
    EmailAccountService.connectAgentmail(
      context.organizationId,
      context.userId,
      data,
    ),
  );

export const disconnectEmailAccount = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .handler(({ context }) =>
    EmailAccountService.disconnect(context.organizationId, context.userId),
  );

export const setEmailAutopilot = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(setEmailAutopilotSchema)
  .handler(({ context, data }) =>
    EmailAccountService.setAutopilot(
      context.organizationId,
      context.userId,
      data.autopilot,
    ),
  );

export const sendEmailReply = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(sendEmailReplySchema)
  .handler(({ context, data }) =>
    EmailService.sendReply(context.organizationId, context.userId, data),
  );

export const composeEmail = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(composeEmailSchema)
  .handler(({ context, data }) =>
    EmailService.compose(context.organizationId, context.userId, data),
  );

export const approveEmailDraft = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(approveEmailDraftSchema)
  .handler(({ context, data }) =>
    EmailService.approveDraft(context.organizationId, context.userId, data),
  );

export const discardEmailDraft = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(emailMessageIdSchema)
  .handler(({ context, data }) =>
    EmailService.discardDraft(
      context.organizationId,
      context.userId,
      data.messageId,
    ),
  );

export const setEmailThreadStatus = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(setEmailThreadStatusSchema)
  .handler(({ context, data }) =>
    EmailService.setThreadStatus(context.organizationId, context.userId, data),
  );
