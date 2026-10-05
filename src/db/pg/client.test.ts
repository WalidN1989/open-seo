import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  end: vi.fn(() => Promise.resolve()),
  create: vi.fn(),
  provider: vi.fn(() => "postgres"),
  waitUntil: vi.fn(),
}));
vi.mock("cloudflare:workers", () => ({ waitUntil: mocks.waitUntil }));
vi.mock("@/db/provider", () => ({
  getDatabaseProvider: mocks.provider,
  getPostgresConnectionString: () => "postgres://test:test@localhost/test",
  getPostgresPoolSize: () => 1,
}));
vi.mock("postgres", () => ({ default: mocks.create }));
vi.mock("./retry", () => ({ withQueryRetries: (sql: unknown) => sql }));
vi.mock("drizzle-orm/postgres-js", () => ({
  drizzle: () => ({ marker: "scoped" }),
}));
import { capturePgScope, pgDb, withPgClient } from "./client";
import { withPgFetchClient } from "../fetch";
import { waitUntil } from "../background";

function context() {
  const pending: Promise<unknown>[] = [];
  const ctx: ExecutionContext = {
    waitUntil: (task) => {
      pending.push(task);
    },
    passThroughOnException() {},
    props: {},
  };
  return { ctx, pending, drain: () => Promise.all(pending) };
}

beforeEach(() => {
  mocks.provider.mockReturnValue("postgres");
  mocks.create.mockReturnValue({ end: mocks.end });
});

describe("Postgres request lifetime", () => {
  it("releases the database even if an async context retains the completed store", async () => {
    const readMarker = (): unknown => {
      const value: unknown = Reflect.get(pgDb, "marker");
      return value;
    };
    const retainedScope = await withPgClient(async () => {
      const captured = capturePgScope();
      expect(captured(readMarker)).toBe("scoped");
      return captured;
    });
    expect(() => retainedScope(readMarker)).toThrow("outside a request scope");
  });

  it("closes the pool when a response stream fails", async () => {
    const c = context();
    const response = await withPgFetchClient(
      async () =>
        new Response(
          new ReadableStream({
            pull(controller) {
              controller.error(new Error("stream failed"));
            },
          }),
        ),
      c.ctx,
    );
    await expect(response.text()).rejects.toThrow("stream failed");
    await c.drain();
    expect(mocks.end).toHaveBeenCalledTimes(1);
  });

  it("ends every pool after success, failure, and nested scopes", async () => {
    expect(await withPgClient(() => withPgClient(async () => 42))).toBe(42);
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.end).toHaveBeenCalledTimes(1);
    await expect(
      withPgClient(async () => {
        throw new Error("failed");
      }),
    ).rejects.toThrow("failed");
    expect(mocks.end).toHaveBeenCalledTimes(2);
  });

  it("does not create pools in D1 mode", async () => {
    mocks.provider.mockReturnValue("d1");
    await withPgClient(async () => 42);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("keeps the pool for streamed responses, then closes it", async () => {
    const c = context();
    const response = await withPgFetchClient(
      async () => new Response("hello"),
      c.ctx,
    );
    expect(mocks.end).not.toHaveBeenCalled();
    expect(await response.text()).toBe("hello");
    await c.drain();
    expect(mocks.end).toHaveBeenCalledTimes(1);
  });

  it("closes on canceled response and thrown fetch", async () => {
    const c = context();
    const response = await withPgFetchClient(
      async () => new Response(new ReadableStream()),
      c.ctx,
    );
    await response.body?.cancel();
    await c.drain();
    expect(mocks.end).toHaveBeenCalledTimes(1);
    const failed = context();
    await expect(
      withPgFetchClient(async () => {
        throw new Error("fetch failed");
      }, failed.ctx),
    ).rejects.toThrow("fetch failed");
    await failed.drain();
    expect(mocks.end).toHaveBeenCalledTimes(2);
  });

  it("waits for global and context background work before disposing", async () => {
    const c = context();
    let finish: (() => void) | undefined;
    const background = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const response = await withPgFetchClient(async (ctx) => {
      waitUntil(background);
      ctx.waitUntil(background);
      return new Response(null, { status: 204 });
    }, c.ctx);
    expect(response.status).toBe(204);
    expect(mocks.end).not.toHaveBeenCalled();
    finish?.();
    await c.drain();
    expect(mocks.end).toHaveBeenCalledTimes(1);
  });

  it("retains the database scope when a response is pulled later", async () => {
    const c = context();
    const response = await withPgFetchClient(
      async () =>
        new Response(
          new ReadableStream({
            pull(controller) {
              expect(Reflect.get(pgDb, "marker")).toBe("scoped");
              controller.close();
            },
          }),
        ),
      c.ctx,
    );
    await response.text();
    await c.drain();
    expect(mocks.end).toHaveBeenCalledTimes(1);
  });

  it("does not accumulate pools across 1000 requests", async () => {
    for (let i = 0; i < 1000; i++) {
      const c = context();
      const response = await withPgFetchClient(
        async () => new Response("ok"),
        c.ctx,
      );
      await response.text();
      await c.drain();
    }
    expect(mocks.create).toHaveBeenCalledTimes(1000);
    expect(mocks.end).toHaveBeenCalledTimes(1000);
  });
});
