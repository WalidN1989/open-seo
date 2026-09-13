import { createServerFn } from "@tanstack/react-start";
import { LeadDetailService } from "@/server/features/crm/services/LeadDetailService";
import { ReminderService } from "@/server/features/crm/services/ReminderService";
import {
  createReminderSchema,
  leadIdSchema,
  logLeadActivitySchema,
  reminderIdSchema,
  snoozeReminderSchema,
} from "@/types/schemas/crm";
import { requireAuthenticatedContext } from "./middleware";

export const getLeadDetail = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(leadIdSchema)
  .handler(({ context, data }) =>
    LeadDetailService.getLeadDetail(
      context.organizationId,
      context.userId,
      data.leadId,
    ),
  );

export const logLeadActivity = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(logLeadActivitySchema)
  .handler(({ context, data }) =>
    LeadDetailService.logActivity(context.organizationId, context.userId, data),
  );

export const listReminders = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .handler(({ context }) =>
    ReminderService.list(context.organizationId, context.userId),
  );

export const createReminder = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(createReminderSchema)
  .handler(({ context, data }) =>
    ReminderService.create(context.organizationId, context.userId, data),
  );

export const snoozeReminder = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(snoozeReminderSchema)
  .handler(({ context, data }) =>
    ReminderService.snooze(
      context.organizationId,
      context.userId,
      data.id,
      data.minutes,
    ),
  );

export const completeReminder = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(reminderIdSchema)
  .handler(({ context, data }) =>
    ReminderService.markDone(context.organizationId, context.userId, data.id),
  );

export const deleteReminder = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(reminderIdSchema)
  .handler(({ context, data }) =>
    ReminderService.remove(context.organizationId, context.userId, data.id),
  );
