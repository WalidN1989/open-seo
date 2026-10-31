import { afterEach, expect, it, vi } from "vitest";
import { startWooOrderSync } from "../../scripts/woo-order-sync";
const id = "11111111-1111-4111-8111-111111111111";
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it("does no background work without an explicit connection allowlist", async () => {
  vi.stubEnv("WOOCOMMERCE_ORDER_CONNECTION_IDS", "");
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  const stop = startWooOrderSync();
  await Promise.resolve();
  stop();
  expect(fetcher).not.toHaveBeenCalled();
});
it("runs a bounded selected worker once a minute without overlapping slow passes", async () => {
  vi.useFakeTimers();
  vi.stubEnv("WOOCOMMERCE_ORDER_CONNECTION_IDS", `${id},${id}`);
  vi.stubEnv("INTERNAL_CRON_SECRET", "synthetic-secret");
  let finish: ((value: Response) => void) | undefined;
  const fetcher = vi.fn(
    () =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
  );
  vi.stubGlobal("fetch", fetcher);
  const stop = startWooOrderSync();
  expect(fetcher).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(120_000);
  expect(fetcher).toHaveBeenCalledTimes(1);
  finish?.(Response.json({ ok: true }));
  await vi.advanceTimersByTimeAsync(60_001);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(fetcher.mock.calls[0]).toMatchObject([
    expect.stringContaining("/api/internal/woocommerce-orders"),
    { method: "POST", body: JSON.stringify({ connectionId: id }) },
  ]);
  stop();
  finish?.(Response.json({ ok: true }));
  await vi.advanceTimersByTimeAsync(120_000);
  expect(fetcher).toHaveBeenCalledTimes(2);
});
