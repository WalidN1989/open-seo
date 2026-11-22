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
import type * as RepositoryModule from "./ReportTemplateRepository";
let client: Client;
let repository: typeof RepositoryModule.ReportTemplateRepository;
vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));
beforeAll(async () => {
  client = createClient({ url: "file::memory:" });
  vi.doMock("@/db", () => ({ db: drizzle(client) }));
  await client.executeMultiple(`CREATE TABLE report_templates (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL, name TEXT NOT NULL,
    description TEXT NOT NULL, instructions TEXT NOT NULL,
    created_by TEXT NOT NULL, created_by_user_id TEXT NOT NULL,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    UNIQUE(project_id, name));`);
  ({ ReportTemplateRepository: repository } =
    await import("./ReportTemplateRepository"));
});
afterAll(() => {
  client.close();
});
beforeEach(async () => {
  await client.execute("DELETE FROM report_templates");
  await repository.insertTemplate({
    id: "template_1",
    projectId: "project_1",
    name: "Monthly review",
    description: "For the owner",
    instructions: "One action with evidence",
    createdBy: "Codex",
    createdByUserId: "user_1",
  });
});
describe("report template project isolation", () => {
  it("filters lists and refuses foreign reads, writes and deletion", async () => {
    expect(await repository.listTemplates("project_2")).toEqual([]);
    expect(await repository.getTemplate("project_2", "template_1")).toBeNull();
    await repository.updateTemplate({
      projectId: "project_2",
      templateId: "template_1",
      name: "Foreign",
      description: "Foreign",
      instructions: "Foreign",
    });
    expect(await repository.deleteTemplate("project_2", "template_1")).toBe(
      false,
    );
    expect(
      await repository.getTemplate("project_1", "template_1"),
    ).toMatchObject({
      name: "Monthly review",
      instructions: "One action with evidence",
    });
  });
  it("preserves original attribution through edits and permits independent project templates", async () => {
    await repository.updateTemplate({
      projectId: "project_1",
      templateId: "template_1",
      name: "Monthly review",
      description: "Updated",
      instructions: "Updated briefing",
    });
    expect(
      await repository.getTemplate("project_1", "template_1"),
    ).toMatchObject({
      createdBy: "Codex",
      createdByUserId: "user_1",
      instructions: "Updated briefing",
    });
    await repository.insertTemplate({
      id: "template_2",
      projectId: "project_2",
      name: "Monthly review",
      description: "Other owner",
      instructions: "Different briefing",
      createdBy: "API",
      createdByUserId: "user_2",
    });
    expect(await repository.listTemplates("project_2")).toHaveLength(1);
  });
});
