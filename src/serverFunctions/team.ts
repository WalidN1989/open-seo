import { createServerFn } from "@tanstack/react-start";
import { ClientLoginService } from "@/server/features/team/services/ClientLoginService";
import { createClientLoginSchema } from "@/types/schemas/team";
import { requireAuthenticatedContext } from "./middleware";

/**
 * Creates a login for this workspace and returns the password once, for the
 * owner to hand over. Only an owner or admin of the workspace may call it.
 */
export const createClientLogin = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(createClientLoginSchema)
  .handler(({ context, data }) =>
    ClientLoginService.createLogin(
      context.organizationId,
      context.userId,
      data,
    ),
  );
