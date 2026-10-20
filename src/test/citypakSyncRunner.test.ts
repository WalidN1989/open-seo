import { afterEach, expect, it, vi } from "vitest";
import { startCitypakSync } from "../../scripts/citypak-sync";
let stop: (() => void) | undefined;
afterEach(() => {
  stop?.();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it("does nothing unless courier connections are explicitly enabled", () => {
  vi.stubEnv("CITYPAK_SYNC_CONNECTION_IDS", "");
  const request = vi.fn();
  vi.stubGlobal("fetch", request);
  stop = startCitypakSync();
  expect(request).not.toHaveBeenCalled();
});
it("runs only the configured courier connection and never overlaps slow requests", async () => {
  vi.useFakeTimers();
  vi.stubEnv(
    "CITYPAK_SYNC_CONNECTION_IDS",
    "11111111-1111-4111-8111-111111111111",
  );
  vi.stubEnv("INTERNAL_CRON_SECRET", "test-secret");
  let resolve: ((response: Response) => void) | undefined;
  const request = vi.fn(
    () =>
      new Promise<Response>((done) => {
        resolve = done;
      }),
  );
  vi.stubGlobal("fetch", request);
  stop = startCitypakSync();
  expect(request.mock.calls[0]).toMatchObject([
    expect.stringContaining("/api/internal/citypak-sync"),
    {
      body: JSON.stringify({
        connectionId: "11111111-1111-4111-8111-111111111111",
      }),
    },
  ]);
  await vi.advanceTimersByTimeAsync(120_000);
  expect(request).toHaveBeenCalledTimes(1);
  resolve?.(new Response("{}"));
  await vi.advanceTimersByTimeAsync(0);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(request).toHaveBeenCalledTimes(2);
});
