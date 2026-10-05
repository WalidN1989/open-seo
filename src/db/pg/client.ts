/* oxlint-disable typescript/no-unsafe-return, typescript/no-unsafe-type-assertion -- The proxy resolves the request-scoped Postgres client from AsyncLocalStorage. */
import { AsyncLocalStorage } from "node:async_hooks";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import {
  getDatabaseProvider,
  getPostgresConnectionString,
  getPostgresPoolSize,
} from "@/db/provider";
import { withQueryRetries } from "./retry";
import * as schema from "./schema";

// Postgres on Cloudflare Workers requires a PER-REQUEST client: the runtime
// forbids using a socket created by one request from a different request
// ("Cannot perform I/O on behalf of a different request"), and Hyperdrive does
// not lift that — its docs are explicit that the client must be created inside
// the handler, never in global scope. So we keep the active client in
// AsyncLocalStorage, seeded by `withPgClient` at each entrypoint. In D1 mode
// (the default) none of this runs.
type Sql = ReturnType<typeof postgres>;

function createPgDb(sql: Sql) {
  return drizzle(sql, { schema });
}

const pgClientStore = new AsyncLocalStorage<{
  db: ReturnType<typeof createPgDb> | undefined;
  background: Set<Promise<unknown>>;
}>();

export const pgDb = new Proxy(
  {},
  {
    get(_target, prop, receiver) {
      const store = pgClientStore.getStore();
      if (!store?.db) {
        throw new Error(
          "Postgres database accessed outside a request scope. Entrypoints " +
            "(fetch, scheduled, workflow run) must wrap DB usage in withPgClient().",
        );
      }
      return Reflect.get(store.db, prop, receiver);
    },
  },
) as ReturnType<typeof createPgDb>;

/**
 * Run `fn` with a request-scoped Postgres client in scope.
 *
 * - D1 mode (default): a no-op — just runs `fn` (no Postgres client created).
 * - Postgres mode: creates a fresh per-request client and makes it the active
 *   `pgDb` for the duration of `fn`.
 *
 * Wrap every entrypoint that touches the DB: the `fetch` handler, the
 * `scheduled` cron, and each WorkflowEntrypoint `run`.
 *
 * Behind Hyperdrive we use a single connection, per its guidance — it pools
 * the origin connections at the edge, so a client-side pool only adds
 * stale-connection risk. Connecting directly to Postgres there is no such
 * pool, so `getPostgresPoolSize` allows several concurrent queries. Pools
 * must be ended explicitly: a long-lived self-hosted isolate does not reclaim
 * postgres.js pools at the end of each HTTP request.
 */
export function capturePgScope() {
  const scope = pgClientStore.getStore();
  return <T>(fn: () => T): T => (scope ? pgClientStore.run(scope, fn) : fn());
}

export function trackPgBackgroundTask(promise: Promise<unknown>): void {
  const background = pgClientStore.getStore()?.background;
  if (!background) return;
  background.add(promise);
  void promise.then(
    () => background.delete(promise),
    () => background.delete(promise),
  );
}

export async function withPgClient<T>(
  fn: () => Promise<T>,
  lifetime?: {
    finished: Promise<void>;
    waitUntil: (task: Promise<unknown>) => void;
  },
): Promise<T> {
  if (getDatabaseProvider() !== "postgres") {
    return fn();
  }
  // Reentrant: nested scopes (e.g. a DO hook calling helpers that defensively
  // scope themselves) reuse the ambient client instead of opening another
  // connection. Workflow steps are unaffected — ALS never crosses step.do, so
  // each step's own wrap still creates its client.
  if (pgClientStore.getStore()?.db) {
    return fn();
  }
  const sql = withQueryRetries(
    postgres(getPostgresConnectionString(), {
      max: getPostgresPoolSize(),
      fetch_types: false,
      // Bound connect stalls (seconds) so the per-query retry in
      // withQueryRetries gets its turn within the request's lifetime instead
      // of hanging on postgres.js's 30s default during a failover.
      connect_timeout: 10,
    }),
  );
  const background = new Set<Promise<unknown>>();
  const scope: {
    db: ReturnType<typeof createPgDb> | undefined;
    background: Set<Promise<unknown>>;
  } = { db: createPgDb(sql), background };
  try {
    return await pgClientStore.run(scope, fn);
  } finally {
    const cleanup = async () => {
      try {
        await lifetime?.finished;
        // Background work can register further work while it runs.
        while (background.size) await Promise.allSettled(background);
      } finally {
        try {
          await sql.end({ timeout: 5 });
        } finally {
          // Closed workerd socket frames can retain their AsyncLocalStorage
          // store. Release the completed request's schema/client graph even
          // when that native context outlives the request.
          scope.db = undefined;
          background.clear();
        }
      }
    };
    if (lifetime) lifetime.waitUntil(cleanup());
    else await cleanup();
  }
}
