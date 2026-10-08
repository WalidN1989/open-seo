import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkflowEvent, WorkflowStep } from "cloudflare:workers";
import { AiVisibilityWorkflow } from "./AiVisibilityWorkflow";
const mocks = vi.hoisted(() => ({
  startRun: vi.fn(),
  getDetails: vi.fn(),
  failObservation: vi.fn(),
  finishRun: vi.fn(),
  collect: vi.fn(),
  pgStep:
    vi.fn<
      (
        _step: unknown,
        name: string,
        config: unknown,
        fn: () => Promise<unknown>,
      ) => Promise<unknown>
    >(),
}));
vi.mock("cloudflare:workers", () => ({ WorkflowEntrypoint: vi.fn() }));
vi.mock(
  "@/server/features/ai-visibility/repositories/AiVisibilityRepository",
  () => ({ AiVisibilityRepository: mocks }),
);
vi.mock("@/server/features/ai-visibility/services/AiVisibilityService", () => ({
  AiVisibilityService: { collect: mocks.collect },
}));
vi.mock("./pgStep", () => ({ pgStep: mocks.pgStep }));
const payload = {
  projectId: "project",
  runId: "run",
  customer: {
    userId: "user",
    userEmail: "user@example.com",
    organizationId: "org",
    projectId: "project",
  },
};
beforeEach(() => {
  mocks.getDetails.mockResolvedValue({ answers: [{ id: "a" }, { id: "b" }] });
  mocks.pgStep.mockImplementation(
    (
      _step: unknown,
      _name: string,
      _config: unknown,
      fn: () => Promise<unknown>,
    ) => fn(),
  );
  mocks.collect.mockResolvedValue(undefined);
  mocks.failObservation.mockResolvedValue(undefined);
});
async function run() {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- mocked Worker base does not inspect constructor context
  const workflow = new AiVisibilityWorkflow({} as ExecutionContext, {} as Env);
  const event: WorkflowEvent<typeof payload> = {
    payload,
    timestamp: new Date(),
    instanceId: "run",
  };
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- pgStep is mocked, no real step implementation is used
  return workflow.run(event, {} as WorkflowStep);
}
describe("manual AI Visibility workflow", () => {
  it("disables paid-step retries and finishes all answers", async () => {
    await run();
    expect(mocks.collect).toHaveBeenCalledTimes(2);
    const paidSteps = mocks.pgStep.mock.calls.filter((c) =>
      String(c[1]).startsWith("collect-"),
    );
    expect(paidSteps.map((c) => c[2])).toEqual([
      { retries: { limit: 0, delay: "1 second" }, timeout: "3 minutes" },
      { retries: { limit: 0, delay: "1 second" }, timeout: "3 minutes" },
    ]);
    expect(mocks.finishRun).toHaveBeenCalledWith("project", "run");
  });
  it("continues after a provider failure and preserves successful results", async () => {
    mocks.collect.mockRejectedValueOnce(new Error("timeout"));
    await run();
    expect(mocks.failObservation).toHaveBeenCalledWith(
      "a",
      expect.stringContaining("No automatic retry"),
    );
    expect(mocks.collect).toHaveBeenCalledTimes(2);
    expect(mocks.finishRun).toHaveBeenCalledTimes(1);
  });
});
