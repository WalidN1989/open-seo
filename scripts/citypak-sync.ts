import { z } from "zod";
import { CITYPAK_SYNC_PATH } from "../src/shared/citypak";

/** One non-overlapping courier worker in the existing VPS bridge process. */
export function startCitypakSync() {
  const raw = process.env.CITYPAK_SYNC_CONNECTION_IDS;
  if (!raw?.trim()) return () => {};
  const parsed = z
    .array(z.uuid())
    .min(1)
    .safeParse([...new Set(raw.split(",").map((id) => id.trim()))]);
  if (!parsed.success) {
    console.error(
      "[citypak-sync] Invalid connection configuration; courier worker stays disabled",
    );
    return () => {};
  }
  const secret = process.env.INTERNAL_CRON_SECRET;
  if (!secret) throw new Error("Citypak sync requires INTERNAL_CRON_SECRET");
  const base =
    process.env.INTERNAL_CRON_URL ??
    `http://127.0.0.1:${process.env.PORT ?? "3001"}`;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  async function tick() {
    for (const connectionId of parsed.data ?? []) {
      if (stopped) return;
      try {
        const response = await fetch(`${base}${CITYPAK_SYNC_PATH}`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-internal-cron-secret": secret!,
          },
          body: JSON.stringify({ connectionId }),
          signal: AbortSignal.timeout(900_000),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        await response.json();
        console.log("[citypak-sync] Courier pass completed");
      } catch {
        console.error(
          "[citypak-sync] Courier pass failed; retrying in one minute",
        );
      }
    }
    if (!stopped) timer = setTimeout(() => void tick(), 60_000);
  }
  console.log(
    `[citypak-sync] Enabled for ${parsed.data.length} connection(s); other background jobs unchanged`,
  );
  void tick();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
