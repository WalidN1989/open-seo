import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync, readdirSync, mkdtempSync, rmSync } from "node:fs";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type * as ServiceModule from "./AiVisibilityService";
import type * as RepoModule from "../repositories/AiVisibilityRepository";
import type { runBatch } from "@/db/runBatch";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  get: vi.fn(),
  provider: vi.fn(),
  competitors: vi.fn(),
}));
vi.mock("cloudflare:workers", () => ({
  env: {
    DATABASE_PROVIDER: "d1",
    AI_VISIBILITY_WORKFLOW: { create: mocks.create, get: mocks.get },
  },
}));
vi.mock("@/server/lib/runtime-env", () => ({
  isHostedServerAuthMode: async () => false,
}));
vi.mock("@/server/lib/dataforseo", () => ({
  createDataforseoClient: () => ({
    aiSearch: { visibilityLive: mocks.provider },
  }),
}));
vi.mock("@/server/features/projects/repositories/ProjectRepository", () => ({
  ProjectRepository: {
    getProjectById: async (id: string) => ({
      id,
      name: "Acme",
      domain: "acme.com",
      locationCode: 2840,
      languageCode: "en",
    }),
  },
}));
vi.mock(
  "@/server/features/project-context/repositories/ProjectContextRepository",
  () => ({ ProjectContextRepository: { listCompetitors: mocks.competitors } }),
);
const testDirectory = mkdtempSync(join(tmpdir(), "ai-visibility-test-"));
let client: Client;
let service: typeof ServiceModule.AiVisibilityService;
let repo: typeof RepoModule.AiVisibilityRepository;
const customer = {
  userId: "user",
  userEmail: "user@example.com",
  organizationId: "org",
  projectId: "p1",
};
const captured = {
  answerMarkdown: "Acme is recommended.",
  answerText: "Acme is recommended.",
  collectedAt: null,
  citations: [
    {
      url: "https://acme.com/guide",
      domain: "acme.com",
      title: "Guide",
      position: 1,
    },
  ],
};

beforeAll(async () => {
  client = createClient({ url: `file:${join(testDirectory, "test.db")}` });
  const testDb = drizzle(client);
  vi.doMock("@/db", () => ({ db: testDb }));
  vi.doMock("@/db/runBatch", () => ({
    runBatch: async (build: Parameters<typeof runBatch>[0]) =>
      testDb.transaction(async (tx) => {
        const statements = build(
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- libsql has the D1 query builder surface
          tx as unknown as Parameters<Parameters<typeof runBatch>[0]>[0],
        );
        for (const statement of statements) await statement;
      }),
  }));
  const migration = readdirSync("drizzle").find(
    (f) => f.startsWith("0097_") && f.endsWith(".sql"),
  );
  if (!migration) throw new Error("Missing AI Visibility migration");
  await client.executeMultiple(
    "PRAGMA foreign_keys = ON; CREATE TABLE projects (id text PRIMARY KEY); INSERT INTO projects VALUES ('p1'), ('p2');" +
      readFileSync(`drizzle/${migration}`, "utf8").replaceAll(
        "--> statement-breakpoint",
        "",
      ),
  );
  ({ AiVisibilityService: service } = await import("./AiVisibilityService"));
  ({ AiVisibilityRepository: repo } =
    await import("../repositories/AiVisibilityRepository"));
});
afterAll(() => {
  client.close();
  rmSync(testDirectory, { recursive: true, force: true });
});
beforeEach(async () => {
  await client.executeMultiple(
    "DELETE FROM ai_visibility_runs; DELETE FROM ai_visibility_prompts; DELETE FROM ai_visibility_settings;",
  );
  mocks.create.mockResolvedValue({ id: "workflow" });
  mocks.get.mockRejectedValue(new Error("not found"));
  mocks.competitors.mockResolvedValue([{ name: null, domain: "rival.com" }]);
  mocks.provider.mockResolvedValue(captured);
  await service.saveSettings({
    projectId: "p1",
    brandName: "Acme",
    domain: "acme.com",
    engines: ["chatgpt", "gemini"],
  });
  await service.addPrompt("p1", "Which tools are best?");
});
async function start(id = crypto.randomUUID()) {
  const prepared = await service.plan("p1");
  await service.start("p1", id, prepared.approval, customer);
  return id;
}
describe("manual AI Visibility", () => {
  it("previews without provider calls or starting a workflow", async () => {
    expect(await service.plan("p1")).toMatchObject({
      checks: 2,
      costUsd: 0.008,
      brands: [
        { name: "Acme", isOwn: true },
        { name: "rival.com", isOwn: false },
      ],
    });
    expect(mocks.provider).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("requires a new confirmation when the saved configuration changes", async () => {
    const plan = await service.plan("p1");
    await service.addPrompt("p1", "Another question?");
    await expect(
      service.start("p1", crypto.randomUUID(), plan.approval, customer),
    ).rejects.toThrow("changed");
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("starts only one workflow for repeat submissions of the same run", async () => {
    const id = await start();
    const plan = await service.plan("p1");
    await service.start("p1", id, plan.approval, customer);
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        id,
        // oxlint-disable-next-line typescript/no-unsafe-assignment -- Vitest asymmetric matcher
        params: expect.objectContaining({ projectId: "p1", customer }),
      }),
    );
    await expect(start()).rejects.toThrow("already running");
  });
  it("does not expose another project's saved runs", async () => {
    const id = await start();
    expect(await repo.getDetails("p2", id)).toBeNull();
    expect((await service.state("p2", id)).details).toBeNull();
    expect(await repo.listRuns("p2")).toEqual([]);
  });
  it("collects each observation once and keeps historical brand and prompt snapshots", async () => {
    const id = await start();
    const details = await repo.getDetails("p1", id);
    const observation = details?.answers[0];
    if (!observation) throw new Error("Missing observation");
    await repo.archivePrompt("p1", observation.promptId);
    await service.saveSettings({
      projectId: "p1",
      brandName: "Changed",
      domain: "changed.com",
      engines: ["chatgpt"],
    });
    await service.collect("p1", id, observation.id, customer);
    await service.collect("p1", id, observation.id, customer);
    expect(mocks.provider).toHaveBeenCalledTimes(1);
    const saved = await repo.getDetails("p1", id);
    expect(saved?.brands[0].name).toBe("Acme");
    expect(saved?.answers[0]).toMatchObject({
      prompt: "Which tools are best?",
      status: "completed",
      answer: captured.answerMarkdown,
      citations: [expect.objectContaining({ domain: "acme.com" })],
      // oxlint-disable-next-line typescript/no-unsafe-assignment -- Vitest asymmetric matcher
      mentions: expect.arrayContaining([
        expect.objectContaining({ mentioned: true, cited: true }),
      ]),
    });
  });
  it("cannot archive another project's prompt", async () => {
    const [prompt] = await repo.listPrompts("p1");
    await repo.archivePrompt("p2", prompt.id);
    expect(await repo.listPrompts("p1")).toHaveLength(1);
  });
  it("marks an interrupted paid request as failed without recharging it", async () => {
    const id = await start();
    const details = await repo.getDetails("p1", id);
    const observation = details?.answers[0];
    if (!observation) throw new Error("Missing observation");
    mocks.provider.mockRejectedValueOnce(new Error("timeout"));
    await expect(
      service.collect("p1", id, observation.id, customer),
    ).rejects.toThrow("timeout");
    await service.collect("p1", id, observation.id, customer);
    await repo.finishRun("p1", id);
    expect(mocks.provider).toHaveBeenCalledTimes(1);
    expect(
      (await repo.getDetails("p1", id))?.answers.every(
        (a) => a.status === "failed",
      ),
    ).toBe(true);
  });
  it("keeps successful answers when another engine fails", async () => {
    const id = await start();
    const details = await repo.getDetails("p1", id);
    if (!details) throw new Error("Missing run");
    await service.collect("p1", id, details.answers[0].id, customer);
    await repo.failObservation(details.answers[1].id, "Provider unavailable");
    await repo.finishRun("p1", id);
    expect((await repo.getDetails("p1", id))?.run.status).toBe("partial");
    expect(await repo.getActiveRun("p1")).toBeNull();
  });
  it("retains the active lock when creation times out and workflow status is unavailable", async () => {
    mocks.create.mockRejectedValueOnce(new Error("timeout"));
    const status = vi
      .fn()
      .mockRejectedValue(new Error("status API unavailable"));
    mocks.get.mockResolvedValue({ status });
    const id = await start();
    expect((await repo.getRun("p1", id))?.status).toBe("queued");
    await expect(start()).rejects.toThrow("already running");
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.provider).not.toHaveBeenCalled();
  });
  it("releases an interrupted run only after a confirmed terminal workflow status", async () => {
    const id = await start();
    mocks.get.mockResolvedValueOnce({
      status: async () => ({ status: "errored" }),
    });
    const state = await service.state("p1", id);
    expect(state.details?.run.status).toBe("failed");
    expect(await repo.getActiveRun("p1")).toBeNull();
  });
  it("checks that an ambiguous workflow creation actually exists before accepting it", async () => {
    mocks.create.mockRejectedValueOnce(new Error("timeout"));
    const status = vi.fn().mockResolvedValue({ status: "running" });
    mocks.get.mockResolvedValueOnce({ status });
    const id = await start();
    expect(status).toHaveBeenCalledTimes(1);
    expect((await repo.getRun("p1", id))?.status).toBe("queued");
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });
  it("enforces the active-run constraint in the migration itself", async () => {
    await start();
    await expect(
      repo.createRun(
        {
          id: crypto.randomUUID(),
          projectId: "p1",
          status: "queued",
          locationCode: 2840,
          languageCode: "en",
          estimatedCostUsd: 0.004,
          createdAt: new Date().toISOString(),
        },
        [],
        [],
      ),
    ).rejects.toThrow();
    expect(await repo.listRuns("p1")).toHaveLength(1);
  });
});
