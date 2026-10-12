import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { makeToolContext } from "./tool-test-support";
const mocks = vi.hoisted(() => ({
  memberships: vi.fn(),
  list: vi.fn(),
  detail: vi.fn(),
}));
vi.mock("@/server/auth/repositories/AuthRepository", () => ({
  AuthRepository: { listOrganizationIdsForUser: mocks.memberships },
}));
vi.mock("@/server/features/voice-calls/services/CallReadService", () => ({
  CallReadService: { list: mocks.list, detail: mocks.detail },
}));
import { listCallsTool, getCallTool, callSurface } from "./call-tools";
describe("read-only call MCP tools", () => {
  beforeEach(() => {
    mocks.memberships.mockResolvedValue(["org-1", "org-2"]);
    mocks.list.mockResolvedValue([]);
    mocks.detail.mockResolvedValue({
      startedAt: "2026-01-01T00:00:00Z",
      summary: "Enquiry",
      transcript: [{ role: "user", message: "Fence please" }],
    });
  });
  it("uses explicit workspace membership rather than token default", async () => {
    await listCallsTool.handler(
      { organizationId: "org-2", sinceHours: 48, limit: 3 },
      makeToolContext({ organizationId: "other" }),
    );
    expect(mocks.list).toHaveBeenCalledWith(
      "org-2",
      "user_123",
      "https://open-seo.test",
      { organizationId: "org-2", sinceHours: 48, limit: 3 },
    );
  });
  it("refuses a foreign workspace before reading calls", async () => {
    await expect(
      getCallTool.handler(
        { organizationId: "outside", callId: "call" },
        makeToolContext(),
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.detail).not.toHaveBeenCalled();
  });
  it("requires a workspace when membership is ambiguous", async () => {
    await expect(
      listCallsTool.handler({ limit: 20 }, makeToolContext()),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(mocks.list).not.toHaveBeenCalled();
  });
  it("supports callId alone for a single workspace", async () => {
    mocks.memberships.mockResolvedValue(["org-1"]);
    const result = await getCallTool.handler(
      { callId: "call" },
      makeToolContext(),
    );
    expect(mocks.detail).toHaveBeenCalledWith(
      "org-1",
      "user_123",
      "call",
      "https://open-seo.test",
    );
    expect(
      result.content[0].type === "text" && result.content[0].text,
    ).toContain("Fence please");
    expect(result.content[0]).toMatchObject({
      type: "text",
    });
  });
  it("validates paging and time-window bounds", () => {
    const schema = z.object(listCallsTool.config.inputSchema);
    expect(schema.parse({})).toEqual({ limit: 20 });
    for (const args of [
      { limit: 0 },
      { limit: 51 },
      { limit: 1.5 },
      { sinceHours: 0 },
      { sinceHours: 8761 },
    ])
      expect(schema.safeParse(args).success).toBe(false);
  });
  it("exposes only read operations", () => {
    expect(callSurface.tools.map((tool) => tool.name)).toEqual([
      "list_calls",
      "get_call",
    ]);
    for (const tool of [listCallsTool, getCallTool])
      expect(tool.config.annotations.readOnlyHint).toBe(true);
  });
});
