import { getOptionalEnvValue } from "@/server/lib/runtime-env";

/**
 * The shared secret the container's helper processes (cron ticker, mailbox
 * bridge) present on every call into the worker. Compared in constant time.
 * Without the secret set nothing answers: an open internal endpoint would
 * let anyone on the internet drive every tenant's background work.
 *
 * Resolved through runtime-env rather than the generated Env type: this is a
 * deployment secret, not a declared Worker binding.
 */
export async function authorizedByInternalSecret(
  request: Request,
): Promise<boolean> {
  const expected = await getOptionalEnvValue("INTERNAL_CRON_SECRET");
  if (!expected) return false;
  const provided = request.headers.get("x-internal-cron-secret");
  if (!provided || provided.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i += 1) {
    mismatch |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
  }
  return mismatch === 0;
}
