import { createServerFn } from "@tanstack/react-start";
import {
  requireAuthenticatedContext,
  requireSignedReportToken,
} from "./middleware";
import { ClientReportService } from "@/server/features/reports/services/ClientReportService";
import {
  clientReportIdSchema,
  clientReportTokenSchema,
  generateClientReportSchema,
} from "@/types/schemas/reports";

export const listReportableProjects = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .handler(({ context }) =>
    ClientReportService.projects(context.organizationId, context.userId),
  );

export const getReportBranding = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .handler(({ context }) =>
    ClientReportService.branding(context.organizationId, context.userId),
  );

export const listClientReports = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .handler(({ context }) =>
    ClientReportService.list(context.organizationId, context.userId),
  );

export const generateClientReport = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(generateClientReportSchema)
  .handler(({ context, data }) =>
    ClientReportService.generate(context.organizationId, context.userId, data),
  );

export const getClientReport = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(clientReportIdSchema)
  .handler(({ context, data }) =>
    ClientReportService.get(
      context.organizationId,
      context.userId,
      data.reportId,
    ),
  );

export const deleteClientReport = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(clientReportIdSchema)
  .handler(({ context, data }) =>
    ClientReportService.remove(
      context.organizationId,
      context.userId,
      data.reportId,
    ),
  );

export const createClientReportLink = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(clientReportIdSchema)
  .handler(({ context, data }) =>
    ClientReportService.documentLink(
      context.organizationId,
      context.userId,
      data.reportId,
    ),
  );

/** The report as its recipient sees it. The signed token is the credential. */
export const getClientReportDocument = createServerFn({ method: "POST" })
  .middleware(requireSignedReportToken)
  .validator(clientReportTokenSchema)
  .handler(({ context }) =>
    ClientReportService.readForDocument(
      context.organizationId,
      context.reportId,
    ),
  );
