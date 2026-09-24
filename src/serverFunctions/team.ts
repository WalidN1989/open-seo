import { createServerFn } from "@tanstack/react-start";
import { ClientLifecycleService } from "@/server/features/team/services/ClientLifecycleService";
import { ClientLoginService } from "@/server/features/team/services/ClientLoginService";
import { DemoOverviewService } from "@/server/features/team/services/DemoOverviewService";
import {
  createClientLoginSchema,
  setClientDemoDataSchema,
} from "@/types/schemas/team";
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

/**
 * What kind of person is signed in here. A client login sees a simpler app:
 * the agency's own plumbing — the MCP connection above all — is not theirs to
 * wire up, and offering it only invites a support call.
 */
export const getWorkspaceAccess = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .handler(async ({ context }) => {
    const login = await ClientLifecycleService.isClientLogin(
      context.organizationId,
      context.userId,
    );
    return {
      isClientLogin: Boolean(login),
      demoData: Boolean(login?.demoData),
    };
  });

/** The client logins in this workspace and how long each has been quiet. */
export const listClientLogins = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .handler(({ context }) =>
    ClientLoginService.listLogins(context.organizationId, context.userId),
  );

/** Turn the sample data on or off for one client login. */
export const setClientDemoData = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(setClientDemoDataSchema)
  .handler(({ context, data }) =>
    ClientLoginService.setDemoData(
      context.organizationId,
      context.userId,
      data.userId,
      data.demoData,
    ),
  );

/**
 * The sample business a client is shown while their own workspace is empty.
 * Generated on read, stored nowhere.
 */
export const getDemoOverview = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .handler(({ context }) =>
    DemoOverviewService.getOverview(context.organizationId, context.userId),
  );
