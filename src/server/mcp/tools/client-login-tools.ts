import { z } from "zod";
import { ClientLoginService } from "@/server/features/team/services/ClientLoginService";
import { mcpResponse } from "@/server/mcp/formatters";
import { withMcpOrganizationAuth } from "@/server/mcp/organization-auth";
import {
  looseObjectOutputSchema,
  optionalMetaOutputSchema,
} from "@/server/mcp/output-schemas";

const organizationIdSchema = z
  .string()
  .min(1)
  .optional()
  .describe(
    "Workspace to act in. Optional when the account belongs to only one.",
  );

const clientLoginsInput = { organizationId: organizationIdSchema } as const;

/**
 * Who has a login here and how long they have been away, so the monitoring
 * agent can summarise the accounts nobody is using. It reports only: closing
 * an account or taking away access is a decision, and stays with a person.
 */
export const clientLoginsTool = {
  name: "list_client_logins",
  config: {
    title: "Client logins: who is using their workspace and who is not",
    description:
      "Every login created for a client of this workspace, with whether they have ever signed in, how many days they have been quiet, how many reminder emails have gone out, and whether they have been warned the workspace will close. Use it to summarise the accounts that are going unused. Only an owner or admin of the workspace can read it.",
    inputSchema: clientLoginsInput,
    outputSchema: {
      logins: z.array(looseObjectOutputSchema),
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpOrganizationAuth(
    async (_args: z.infer<z.ZodObject<typeof clientLoginsInput>>, context) => {
      const logins = await ClientLoginService.listLogins(
        context.organizationId,
        context.auth.userId,
      );
      const quiet = logins.filter((login) => (login.daysQuiet ?? 0) >= 3);
      return mcpResponse({
        text: logins.length
          ? `${logins.length} client login${logins.length === 1 ? "" : "s"}, ${quiet.length} quiet for three days or more.`
          : "No client logins in this workspace.",
        structuredContent: { logins },
      });
    },
  ),
};
