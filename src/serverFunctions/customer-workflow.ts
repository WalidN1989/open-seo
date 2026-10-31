import { isSouthsideWorkflow } from "@/server/features/customer-workflow/policy";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuthenticatedContext } from "./middleware";
import { CommunicationReportService } from "@/server/features/customer-workflow/services/CommunicationReportService";
import { CustomerActionService } from "@/server/features/customer-workflow/services/CustomerActionService";
export const getCommunicationsReport = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .validator(z.object({ days: z.number().int().min(1).max(365).default(7) }))
  .handler(({ context, data }) =>
    CommunicationReportService.read(
      context.organizationId,
      context.userId,
      data.days,
    ),
  );
export const approveCustomerAction = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(z.object({ requestId: z.string().min(1), approved: z.boolean() }))
  .handler(({ context, data }) =>
    CustomerActionService.approve(
      context.organizationId,
      context.userId,
      data.requestId,
      data.approved,
    ),
  );
export const executeCustomerAction = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(z.object({ requestId: z.string().min(1) }))
  .handler(({ context, data }) =>
    CustomerActionService.execute(
      context.organizationId,
      context.userId,
      data.requestId,
    ),
  );

export const getCustomerWorkflowAvailability = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .handler(async ({ context }) => ({
    enabled: await isSouthsideWorkflow(context.organizationId),
  }));
