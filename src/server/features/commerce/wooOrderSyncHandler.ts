import { z } from "zod";
import { authorizedByInternalSecret } from "@/server/lib/internal-secret";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";
import { WooOrderService } from "./services/WooOrderService";

/** Selected WooCommerce order connections only; never runs the global scheduler. */
export async function handleWooOrderSync(request: Request) {
  if (request.method !== "POST") return new Response(null, { status: 405 });
  if (!(await authorizedByInternalSecret(request)))
    return new Response(null, { status: 401 });
  const parsed = z
    .object({ connectionId: z.uuid() })
    .strict()
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new Response(null, { status: 400 });
  const selected =
    (await getOptionalEnvValue("WOOCOMMERCE_ORDER_CONNECTION_IDS"))
      ?.split(",")
      .map((id) => id.trim()) ?? [];
  if (!selected.includes(parsed.data.connectionId))
    return new Response(null, { status: 403 });
  const ok = await WooOrderService.sync(parsed.data.connectionId);
  return Response.json({ ok }, { status: ok ? 200 : 404 });
}
