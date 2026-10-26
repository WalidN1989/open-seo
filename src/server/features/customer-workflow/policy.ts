import { getOptionalEnvValue } from "@/server/lib/runtime-env";
/** An explicit, private single-workspace rollout. Unset means disabled everywhere. */
export async function isSouthsideWorkflow(organizationId: string) {
  const selected = await getOptionalEnvValue(
    "SOUTHSIDE_WORKFLOW_ORGANIZATION_ID",
  );
  return Boolean(selected && organizationId === selected);
}
