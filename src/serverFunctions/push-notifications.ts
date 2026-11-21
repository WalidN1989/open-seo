import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuthenticatedContext } from "@/serverFunctions/middleware";
import { PushNotificationService as Service } from "@/server/features/notifications/services/PushNotificationService";

const subscriptionSchema = z.object({
  endpoint: z
    .string()
    .url()
    .max(4_096)
    .refine((value) => new URL(value).protocol === "https:", {
      message: "Push subscription endpoint must use HTTPS",
    }),
  p256dh: z.string().min(1).max(1_024),
  auth: z.string().min(1).max(1_024),
  userAgent: z.string().max(1_000).optional(),
});

export const getPushNotificationStatus = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .handler(({ context }) =>
    Service.status(context.organizationId, context.userId),
  );

export const savePushSubscription = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(subscriptionSchema)
  .handler(({ context, data }) =>
    Service.subscribe(context.organizationId, context.userId, data),
  );

export const setPushNotificationPreference = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(z.object({ enabled: z.boolean() }))
  .handler(({ context, data }) =>
    Service.setPreference(context.organizationId, context.userId, data.enabled),
  );
