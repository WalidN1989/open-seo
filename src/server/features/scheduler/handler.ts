import { isCronTier } from "@/shared/internal-cron";
import { authorizedByInternalSecret } from "@/server/lib/internal-secret";
import { runCronTier } from "./registry";
import { registerBusinessCronJobs } from "./jobs";

export async function handleInternalCronRequest(
  request: Request,
  env: Env,
): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  if (!(await authorizedByInternalSecret(request))) {
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
