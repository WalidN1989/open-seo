import { createServerFn } from "@tanstack/react-start";
import { PhoneCallService } from "@/server/features/voice-calls/services/PhoneCallService";
import { requireAuthenticatedContext } from "./middleware";

/** Calls answered by the business's hosted voice agent, newest first. */
export const listPhoneCalls = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .handler(({ context }) =>
    PhoneCallService.listCalls(context.organizationId, context.userId),
  );
