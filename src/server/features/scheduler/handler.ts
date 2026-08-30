import { isCronTier } from "@/shared/internal-cron";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";
import { runCronTier } from "./registry";
import { registerBusinessCronJobs } from "./jobs";

// Guarded by a shared secret and compared in constant time. Without the secret
// set the endpoint refuses everything: an open cron trigger would let anyone
// on the internet drive every tenant's background work.
// Resolved through runtime-env rather than the generated Env type: this is a
// deployment secret, not a declared Worker binding.
async function authorized(request: Request): Promise<boolean> {
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

export async function handleInternalCronRequest(
  request: Request,
  env: Env,
): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  if (!(await authorized(request))) {
    return new Response("Unauthorized", { status: 401 });
  }

  const tier = new URL(request.url).searchParams.get("tier") ?? "";
  if (!isCronTier(tier)) {
    return Response.json({ error: "Unknown tier" }, { status: 400 });
  }

  registerBusinessCronJobs();
  const results = await runCronTier(tier, env);
  // Always 200 on an authorized tick: a job failing is data for the caller,
  // not a transport error, and the ticker must keep ticking either way.
  return Response.json({ tier, results });
}
