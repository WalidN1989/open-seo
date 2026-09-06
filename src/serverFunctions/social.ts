import { createServerFn } from "@tanstack/react-start";
import { SocialAccountService } from "@/server/features/social/services/SocialAccountService";
import { SocialService } from "@/server/features/social/services/SocialService";
import { requireAuthenticatedContext } from "@/serverFunctions/middleware";
import {
  approveSocialDraftSchema,
  connectSocialAccountSchema,
  sendSocialReplySchema,
  setSocialAutopilotSchema,
  setSocialConversationStatusSchema,
  socialAccountIdSchema,
  socialConversationIdSchema,
  socialMessageIdSchema,
  updateSocialAccountSchema,
} from "@/types/schemas/social";

export const getSocialWorkspace = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .handler(({ context }) =>
    SocialService.workspace(context.organizationId, context.userId),
  );

export const getSocialThread = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .validator(socialConversationIdSchema)
  .handler(({ context, data }) =>
    SocialService.thread(
      context.organizationId,
      context.userId,
      data.conversationId,
    ),
  );

export const connectSocialAccount = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(connectSocialAccountSchema)
  .handler(({ context, data }) =>
    SocialAccountService.connect(context.organizationId, context.userId, data),
  );

export const updateSocialAccount = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(updateSocialAccountSchema)
  .handler(({ context, data }) =>
    SocialAccountService.update(context.organizationId, context.userId, data),
  );

export const disconnectSocialAccount = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(socialAccountIdSchema)
  .handler(({ context, data }) =>
    SocialAccountService.disconnect(
      context.organizationId,
      context.userId,
      data.accountId,
    ),
  );

export const setSocialAutopilot = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(setSocialAutopilotSchema)
  .handler(({ context, data }) =>
    SocialAccountService.setAutopilot(
      context.organizationId,
      context.userId,
      data.accountId,
      data.autopilot,
    ),
  );

export const sendSocialReply = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(sendSocialReplySchema)
  .handler(({ context, data }) =>
    SocialService.sendReply(context.organizationId, context.userId, data),
  );

export const approveSocialDraft = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(approveSocialDraftSchema)
  .handler(({ context, data }) =>
    SocialService.approveDraft(context.organizationId, context.userId, data),
  );

export const discardSocialDraft = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(socialMessageIdSchema)
  .handler(({ context, data }) =>
    SocialService.discardDraft(
      context.organizationId,
      context.userId,
      data.messageId,
    ),
  );

export const setSocialConversationStatus = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(setSocialConversationStatusSchema)
  .handler(({ context, data }) =>
    SocialService.setConversationStatus(
      context.organizationId,
      context.userId,
      data,
    ),
  );
