import { symmetricDecrypt, symmetricEncrypt } from "better-auth/crypto";
import {
  getOptionalEnvValue,
  getRequiredEnvValue,
} from "@/server/lib/runtime-env";

/**
 * Per-connection credentials, encrypted at rest.
 *
 * The original design read every provider secret from a deployment
 * environment variable prefixed by a per-tenant reference. That works for a
 * single self-hosted install and fails for everyone else: a tenant cannot
 * connect their own store without access to the deployment and a redeploy.
 * Credentials are stored here instead, encrypted with the same key that
 * already protects OAuth tokens at rest, and the environment reference stays
 * as a fallback for self-hosters who prefer it.
 */

/** Same key material as the encrypted-OAuth-token path; already mandatory. */
async function encryptionKey(): Promise<string> {
  return getRequiredEnvValue("BETTER_AUTH_SECRET");
}

export async function encryptCredentials(
  values: Readonly<Record<string, string>>,
): Promise<string | null> {
  const entries = Object.entries(values).filter(
    ([, value]) => value.trim().length > 0,
  );
  if (entries.length === 0) return null;
  return symmetricEncrypt({
    key: await encryptionKey(),
    data: JSON.stringify(Object.fromEntries(entries)),
  });
}

export async function decryptCredentials(
  ciphertext: string | null | undefined,
): Promise<Record<string, string>> {
  if (!ciphertext) return {};
  let plaintext: string;
  try {
    plaintext = await symmetricDecrypt({
      key: await encryptionKey(),
      data: ciphertext,
    });
  } catch {
    // A rotated or mismatched BETTER_AUTH_SECRET cannot be recovered from.
    // Report it as missing credentials so the connection reads "needs
    // reconnecting" rather than crashing every request that touches it.
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(plaintext);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return {};
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string") result[key] = value;
    }
    return result;
  } catch {
    return {};
  }
}

/**
 * Merge an edit over what is stored. A blank secret means "keep the one you
 * have" — the browser is never sent the current value, so an untouched field
 * arrives empty and must not wipe a working credential.
 */
export async function mergeCredentials(
  existingCipher: string | null | undefined,
  incoming: Readonly<Record<string, string>>,
): Promise<string | null> {
  const existing = await decryptCredentials(existingCipher);
  const merged = { ...existing };
  for (const [key, value] of Object.entries(incoming)) {
    const trimmed = value.trim();
    if (trimmed.length > 0) merged[key] = trimmed;
  }
  return encryptCredentials(merged);
}

/** Which credentials exist, for the UI. Never the values themselves. */
export async function credentialKeysSet(
  ciphertext: string | null | undefined,
): Promise<string[]> {
  return Object.keys(await decryptCredentials(ciphertext)).toSorted();
}

type CredentialSource = {
  credentials?: string | null;
  credentialReference?: string | null;
};

/** `MY_REF` + `CONSUMER_KEY` -> `MY_REF_CONSUMER_KEY`. */
export function environmentName(reference: string, suffix: string): string {
  const prefix = reference
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, "_");
  return `${prefix}_${suffix}`;
}

/**
 * The one place a provider credential is read. Stored credentials win, so a
 * tenant who typed their keys into the UI is never silently overridden by a
 * deployment variable; the environment reference remains for self-hosters who
 * set nothing in the UI.
 */
export async function resolveConnectionCredential(
  connection: CredentialSource,
  suffix: string,
): Promise<string> {
  const stored = await decryptCredentials(connection.credentials);
  const value = stored[suffix];
  if (value && value.trim().length > 0) return value;

  const reference = connection.credentialReference?.trim();
  if (reference) {
    const fromEnvironment = await getOptionalEnvValue(
      environmentName(reference, suffix),
    );
    if (fromEnvironment && fromEnvironment.length > 0) return fromEnvironment;
  }

  throw new Error(
    `This connection is missing its ${suffix.toLowerCase().replace(/_/g, " ")}. Open the integration and enter it.`,
  );
}

/**
 * Drop the encrypted blob from a row on its way out of the server, keeping
 * which credential keys are set so the UI can show "leave blank to keep".
 */
export async function stripCredentials<
  T extends { credentials?: string | null },
>(
  row: T | undefined,
): Promise<
  (Omit<T, "credentials"> & { credentialKeysSet: string[] }) | undefined
> {
  // A `.returning()` that matched nothing yields undefined — a row deleted
  // between the read and the write. Pass that through rather than throwing a
  // destructuring error that names the wrong problem.
  if (!row) return undefined;
  const { credentials, ...rest } = row;
  return { ...rest, credentialKeysSet: await credentialKeysSet(credentials) };
}
