import { z } from "zod";

export const clientAccountStatusSchema = z.enum(["active", "paused"]);

export const createClientAccountSchema = z.object({
  clientOrganizationId: z.string().min(1),
  displayName: z.string().min(1).max(200),
});

export const clientAccountIdSchema = z.object({
  clientAccountId: z.string().min(1),
});

export const setClientAccountStatusSchema = z.object({
  clientAccountId: z.string().min(1),
  status: clientAccountStatusSchema,
});

export const revokeClientContactSchema = z.object({
  contactId: z.string().min(1),
});
