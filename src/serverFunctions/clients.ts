import { createServerFn } from "@tanstack/react-start";
import { ClientAccountService } from "@/server/features/clients/services/ClientAccountService";
import { requireAuthenticatedContext } from "@/serverFunctions/middleware";
import {
  clientAccountIdSchema,
  createClientAccountSchema,
  revokeClientContactSchema,
  setClientAccountStatusSchema,
} from "@/types/schemas/clients";

export const getClientAccountsWorkspace = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .handler(({ context }) =>
    ClientAccountService.workspace(context.organizationId, context.userId),
  );

export const listLinkableOrganizations = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .handler(({ context }) =>
    ClientAccountService.linkableOrganizations(
      context.organizationId,
      context.userId,
    ),
  );

/**
 * Returns the new code in plaintext — the only time it is ever readable.
 * It is stored derived and salted, so this response is the one chance to
 * copy it.
 */
export const createClientAccount = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(createClientAccountSchema)
  .handler(({ data, context }) =>
    ClientAccountService.create(context.organizationId, context.userId, data),
  );

export const rotateClientAccessCode = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(clientAccountIdSchema)
  .handler(({ data, context }) =>
    ClientAccountService.rotateCode(
      context.organizationId,
      context.userId,
      data.clientAccountId,
    ),
  );

export const setClientAccountStatus = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(setClientAccountStatusSchema)
  .handler(({ data, context }) =>
    ClientAccountService.setStatus(
      context.organizationId,
      context.userId,
      data,
    ),
  );

export const revokeClientContact = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(revokeClientContactSchema)
  .handler(({ data, context }) =>
    ClientAccountService.revokeContact(
      context.organizationId,
      context.userId,
      data.contactId,
    ),
  );

export const deleteClientAccount = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(clientAccountIdSchema)
  .handler(({ data, context }) =>
    ClientAccountService.remove(
      context.organizationId,
      context.userId,
      data.clientAccountId,
    ),
  );
