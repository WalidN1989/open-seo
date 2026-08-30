import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { CrmService } from "@/server/features/crm/services/CrmService";
import { requireAuthenticatedContext } from "@/serverFunctions/middleware";
import {
  createActivitySchema,
  createCompanySchema,
  createContactSchema,
  createInquirySchema,
  createLeadSchema,
  createMeetingSchema,
  promoteInquirySchema,
  updateLeadSchema,
  importHunterDomainSchema,
} from "@/types/schemas/crm";

export const getLeadsWorkspace = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .handler(({ context }) =>
    CrmService.getLeadsWorkspace(context.organizationId, context.userId),
  );
export const importHunterDomainLeads = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(importHunterDomainSchema)
  .handler(({ context, data }) =>
    CrmService.importHunterDomain(context.organizationId, context.userId, data),
  );

export const createCrmLead = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(createLeadSchema)
  .handler(({ context, data }) =>
    CrmService.createLead(context.organizationId, context.userId, data),
  );

export const updateCrmLead = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(updateLeadSchema)
  .handler(({ context, data }) =>
    CrmService.updateLead(context.organizationId, context.userId, data),
  );

export const getCrmWorkspace = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .handler(({ context }) =>
    CrmService.getCrmWorkspace(context.organizationId, context.userId),
  );

export const createCrmContact = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(createContactSchema)
  .handler(({ context, data }) =>
    CrmService.createContact(context.organizationId, context.userId, data),
  );

export const createCrmCompany = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(createCompanySchema)
  .handler(({ context, data }) =>
    CrmService.createCompany(context.organizationId, context.userId, data),
  );
export const createCrmInquiry = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(createInquirySchema)
  .handler(({ context, data }) =>
    CrmService.createInquiry(context.organizationId, context.userId, data),
  );

export const createCrmMeeting = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(createMeetingSchema)
  .handler(({ context, data }) =>
    CrmService.createMeeting(context.organizationId, context.userId, data),
  );

export const promoteCrmInquiry = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(promoteInquirySchema)
  .handler(({ context, data }) =>
    CrmService.promoteInquiry(context.organizationId, context.userId, data),
  );

export const getCrmLeadActivities = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(z.object({ leadId: z.string().min(1) }))
  .handler(({ context, data }) =>
    CrmService.listActivities(
      context.organizationId,
      context.userId,
      data.leadId,
    ),
  );

export const createCrmActivity = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(createActivitySchema)
  .handler(({ context, data }) =>
    CrmService.createActivity(context.organizationId, context.userId, data),
  );
