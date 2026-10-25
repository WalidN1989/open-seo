import { createServerFn } from "@tanstack/react-start";
import { CaseService } from "@/server/features/voice-cases/services/CaseService";
import { listCasesSchema } from "@/types/schemas/voiceCases";
import { requireAuthenticatedContext } from "./middleware";

export const listVoiceCases = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .validator(listCasesSchema)
  .handler(({ context, data }) =>
    CaseService.list(context.organizationId, context.userId, data),
  );
