import { ApiKeyRepository } from "@/server/auth/repositories/ApiKeyRepository";
import { AppError } from "@/server/lib/errors";
import { z } from "zod";

const permissionsSchema = z.record(z.string(), z.unknown());

function parsePermissions(value: string | null) {
  if (!value) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    const result = permissionsSchema.safeParse(parsed);
    return result.success ? result.data : {};
  } catch {
    return {};
  }
}

async function updateMcpScopes(
  userId: string,
  keyId: string,
  scopes: string[],
) {
  const key = await ApiKeyRepository.getForUser(userId, keyId);
  if (!key) throw new AppError("NOT_FOUND", "API key not found.");
  const updated = await ApiKeyRepository.updatePermissions(userId, keyId, {
    ...parsePermissions(key.permissions),
    mcpScopes: [...new Set(scopes)],
    // The first explicit scope decision ends legacy compatibility, even when
    // the user intentionally clears every granular toggle.
    mcpLegacyBusinessAccess: false,
  });
  if (!updated) throw new AppError("NOT_FOUND", "API key not found.");
  return updated;
}

export const ApiKeyScopeService = { updateMcpScopes };
