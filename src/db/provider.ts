import { env } from "cloudflare:workers";

type DatabaseProvider = "d1" | "postgres";

export function getDatabaseProvider(): DatabaseProvider {
  const provider = Reflect.get(env, "DATABASE_PROVIDER");

  if (provider === "postgres") {
    return "postgres";
  }

  if (provider === "d1" || provider === undefined || provider === "") {
    return "d1";
  }

  throw new Error(
    `Unsupported DATABASE_PROVIDER "${String(provider)}". Expected "d1" or "postgres".`,
  );
}

function hyperdriveConnectionString() {
  const hyperdrive = Reflect.get(env, "HYPERDRIVE") as
    | { connectionString?: string }
    | undefined;
  return hyperdrive?.connectionString?.trim() || null;
}

/**
 * How many connections one request's client may open.
 *
 * Behind Hyperdrive the edge already pools the origin connections, so a
 * second pool here only adds stale-connection risk — one is right. Connecting
 * straight to Postgres, as a Node self-host does, this client is the only
 * pool there is, and a workspace read fires a dozen queries at once: held to
 * one connection they queue up, each paying its own network round trip.
 */
export function getPostgresPoolSize(): number {
  return hyperdriveConnectionString() ? 1 : 8;
}

export function getPostgresConnectionString() {
  const hyperdriveUrl = hyperdriveConnectionString();
  if (hyperdriveUrl) {
    return hyperdriveUrl;
  }

  // Node-based self-hosts (for example Railway's Docker runtime) do not have a
  // Hyperdrive binding. Allow them to connect directly to managed Postgres.
  const directUrl = Reflect.get(env, "POSTGRES_DATABASE_URL");
  if (typeof directUrl === "string" && directUrl.trim()) {
    return directUrl.trim();
  }

  throw new Error(
    "DATABASE_PROVIDER=postgres requires a HYPERDRIVE binding or POSTGRES_DATABASE_URL.",
  );
}
