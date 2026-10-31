import { createServerFn } from "@tanstack/react-start";
import { requireAuthenticatedContext } from "./middleware";
import { SmsCampaignDraftService } from "@/server/features/sms/services/SmsCampaignDraftService";
import {
  createSmsCampaignDraftSchema,
  smsCampaignConnectionSchema,
} from "@/types/schemas/sms-campaigns";

export const listSmsCampaignDrafts = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(smsCampaignConnectionSchema)
  .handler(({ context, data }) =>
    SmsCampaignDraftService.list(
      context.organizationId,
      context.userId,
      data.connectionId,
    ),
  );

export const createSmsCampaignDraft = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(createSmsCampaignDraftSchema)
  .handler(({ context, data }) =>
    SmsCampaignDraftService.create(
      context.organizationId,
      context.userId,
      data,
    ),
  );
