import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { BusinessModuleService } from "@/server/features/business-modules/services/BusinessModuleService";
import {
  businessModuleKeySchema,
  businessModulePermissionSchema,
} from "@/shared/business-modules";
import { requireAuthenticatedContext } from "@/serverFunctions/middleware";

export const getBusinessModuleAccess = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .handler(async ({ context }) =>
    BusinessModuleService.getAccess(context.organizationId, context.userId),
  );

export const setBusinessModuleEntitlement = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(
    z.object({ moduleKey: businessModuleKeySchema, enabled: z.boolean() }),
  )
  .handler(async ({ context, data }) =>
    BusinessModuleService.setEntitlement(
      context.organizationId,
      context.userId,
      data.moduleKey,
      data.enabled,
    ),
  );

export const requireBusinessModuleAccess = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(z.object({ moduleKey: businessModuleKeySchema }))
  .handler(async ({ context, data }) =>
    BusinessModuleService.requireAccess(
      context.organizationId,
      context.userId,
      data.moduleKey,
    ),
  );

export const getBusinessModuleStaffAccess = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .handler(async ({ context }) =>
    BusinessModuleService.getStaffAccess(
      context.organizationId,
      context.userId,
    ),
  );

export const getBusinessModuleAuditTrail = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .handler(async ({ context }) =>
    BusinessModuleService.getAuditTrail(context.organizationId, context.userId),
  );

export const setBusinessModuleStaffPermission = createServerFn({
  method: "POST",
})
  .middleware(requireAuthenticatedContext)
  .validator(
    z.object({
      memberId: z.string().min(1),
      moduleKey: businessModuleKeySchema,
      permission: businessModulePermissionSchema.nullable(),
    }),
  )
  .handler(async ({ context, data }) =>
    BusinessModuleService.setStaffPermission(
      context.organizationId,
      context.userId,
      data.memberId,
      data.moduleKey,
      data.permission,
    ),
  );
