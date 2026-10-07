import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { MCP_ACCESS_SCOPES } from "@/lib/oauth-resource";
import { ApiKeyScopeService } from "@/server/auth/services/ApiKeyScopeService";
import { requireAuthenticatedContext } from "@/serverFunctions/middleware";

const schema = z.object({
  keyId: z.string().min(1),
  scopes: z.array(z.enum(MCP_ACCESS_SCOPES)).max(MCP_ACCESS_SCOPES.length),
});

export const updateApiKeyMcpScopes = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(schema)
  .handler(async ({ context, data }) => {
    const key = await ApiKeyScopeService.updateMcpScopes(
      context.userId,
      data.keyId,
      data.scopes,
    );
    return { id: key.id, scopes: data.scopes };
  });
