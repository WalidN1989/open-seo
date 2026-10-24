import { ShipmentMessagesService } from "./services/ShipmentMessagesService";
import { z } from "zod";
import { authorizedByInternalSecret } from "@/server/lib/internal-secret";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";
import { CitypakRepository } from "./repositories/CitypakRepository";
import { OrderOperationsService } from "./services/OrderOperationsService";
import { OrderShipmentService } from "./services/OrderShipmentService";

/** Selected courier work and explicitly enabled shipment messages; no global scheduler. */
export async function handleCitypakSync(request: Request) {
  if (request.method !== "POST") return new Response(null, { status: 405 });
  if (!(await authorizedByInternalSecret(request)))
    return new Response(null, { status: 401 });
  const parsed = z
    .object({ connectionId: z.uuid() })
    .strict()
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new Response(null, { status: 400 });
  const configured = await getOptionalEnvValue("CITYPAK_SYNC_CONNECTION_IDS");
  if (
    !configured
      ?.split(",")
      .map((id) => id.trim())
      .includes(parsed.data.connectionId)
  )
    return new Response(null, { status: 403 });
  if (!(await CitypakRepository.connection(parsed.data.connectionId)))
    return new Response(null, { status: 404 });
  await OrderOperationsService.runDue(parsed.data.connectionId);
  await OrderShipmentService.runDueTracking(parsed.data.connectionId);
  await ShipmentMessagesService.runDue(parsed.data.connectionId);
  return Response.json({ ok: true });
}
