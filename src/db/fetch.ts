import {
  withPgClient,
  trackPgBackgroundTask,
  capturePgScope,
} from "./pg/client";

/** Keep the pool alive until the response stream and registered work finish. */
export function withPgFetchClient(
  fetch: (ctx: ExecutionContext) => Promise<Response>,
  ctx: ExecutionContext,
): Promise<Response> {
  let finish: () => void;
  const finished = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const scopedContext = new Proxy(ctx, {
    get(target, key) {
      if (key === "waitUntil")
        return (task: Promise<unknown>) => {
          trackPgBackgroundTask(task);
          target.waitUntil(task);
        };
      const value: unknown = Reflect.get(target, key);
      const resolved: unknown =
        typeof value === "function" ? value.bind(target) : value;
      return resolved;
    },
  });
  return withPgClient(
    async () => {
      try {
        const response = await fetch(scopedContext);
        if (!response.body || response.status === 101) {
          finish();
          return response;
        }
        const reader = response.body.getReader();
        const runInScope = capturePgScope();
        const body = new ReadableStream<Uint8Array>({
          pull(controller) {
            return runInScope(async () => {
              try {
                const result = await reader.read();
                if (result.done) {
                  controller.close();
                  reader.releaseLock();
                  finish();
                } else controller.enqueue(result.value);
              } catch (error) {
                controller.error(error);
                reader.releaseLock();
                finish();
              }
            });
          },
          async cancel(reason) {
            try {
              await reader.cancel(reason);
            } finally {
              reader.releaseLock();
              finish();
            }
          },
        });
        return new Response(body, response);
      } catch (error) {
        finish();
        throw error;
      }
    },
    { finished, waitUntil: (task) => ctx.waitUntil(task) },
  );
}
