import { afterEach, describe, expect, it, vi } from "vitest";
import { prioritize, routeQuestion } from "./jev";
import { z } from "zod";
const config = vi.hoisted(() => ({ key: "test-key" }));
vi.mock("@/server/lib/runtime-env", () => ({
  getOptionalEnvValue: () => Promise.resolve(config.key || undefined),
}));
afterEach(() => {
  vi.unstubAllGlobals();
  config.key = "test-key";
});
describe("bounded Jev decisions", () => {
  it("returns uncertainty rather than executing unsupported or low-confidence decisions", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          answers: {
            intent: { type: "choice", choice: "projects", confidence: 0.4 },
            ambiguity: { type: "noul", noul: 0 },
          },
        }),
      ),
    );
    expect((await routeQuestion("projects?")).status).toBe("uncertain");
  });
  it("validates provider output and never falls back to another model", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      Response.json({
        answers: {
          intent: {
            type: "choice",
            choice: "delete_everything",
            confidence: 1,
          },
        },
      }),
    );
    vi.stubGlobal("fetch", fetcher);
    expect((await routeQuestion("projects?")).status).toBe("unable_to_check");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("sends only the approved anonymous priority metadata", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      Response.json({
        answers: { item_0: { type: "score", score: 2.8, confidence: 0.95 } },
      }),
    );
    vi.stubGlobal("fetch", fetcher);
    const result = await prioritize(
      [
        {
          id: "private-id",
          title: "customer@example.com",
          detail: "sensitive message",
          kind: "email",
          timestamp: "2026-09-27T00:00:00Z",
          projectId: "private-project",
          projectName: "Private business",
          path: "/secret",
        },
      ],
      Date.parse("2026-09-27T01:00:00Z"),
    );
    expect(result.ids).toEqual(["private-id"]);
    const call = z
      .tuple([z.string(), z.object({ body: z.string() })])
      .parse(fetcher.mock.calls[0]);
    const body = call[1].body;
    expect(body).not.toMatch(/private|customer|sensitive|secret/i);
    const parsed = z
      .object({ state: z.object({ items: z.array(z.unknown()) }) })
      .parse(JSON.parse(body));
    expect(parsed.state.items).toEqual([
      { slot: 0, category: "email", ageHours: 1, failed: false },
    ]);
  });
  it("does not call the provider without a key", async () => {
    config.key = "";
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    expect((await routeQuestion("projects?")).status).toBe("not_configured");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
