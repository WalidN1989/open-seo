import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { describe, expect, it } from "vitest";
import { NEVER_BY_VOICE, toVoiceTools } from "./voiceToolShape";

const CATALOGUE = [
  {
    name: "research_keywords",
    config: {
      title: "Keyword research",
      description: "Ideas and search demand for a seed keyword.",
      inputSchema: {
        projectId: z.string(),
        keyword: z.string(),
        limit: z.number().optional(),
      },
    },
  },
  {
    name: "list_leads",
    config: {
      title: "Leads",
      description: "Open leads in the workspace.",
      inputSchema: { organizationId: z.string().optional() },
    },
  },
  {
    name: "send_email",
    config: {
      title: "Send email",
      description: "Sends an email.",
      inputSchema: {},
    },
  },
  {
    name: "long_one",
    config: { title: "T", description: "x".repeat(900), inputSchema: {} },
  },
];
const MODULE_OF = new Map([
  ["list_leads", "leads"],
  ["send_email", "email"],
]);

describe("toVoiceTools", () => {
  const tools = toVoiceTools(CATALOGUE, new Set(["leads", "email"]), MODULE_OF);
  const names = tools.map((tool) => tool.name);

  it("never offers a tool that speaks to a customer", () => {
    expect(names).not.toContain("send_email");
  });

  it("leaves out modules this workspace has not switched on", () => {
    const bare = toVoiceTools(CATALOGUE, new Set(), MODULE_OF).map(
      (t) => t.name,
    );
    expect(bare).not.toContain("list_leads");
    // Tools belonging to no business module are always there.
    expect(bare).toContain("research_keywords");
  });

  it("never asks the model which workspace or project to use", () => {
    for (const tool of tools) {
      const properties = Object.keys(tool.input_schema.properties);
      expect(properties).not.toContain("organizationId");
      expect(properties).not.toContain("projectId");
      expect(tool.input_schema.required ?? []).not.toContain("projectId");
    }
  });

  it("keeps the tool's own arguments, with their types", () => {
    const research = tools.find((tool) => tool.name === "research_keywords");
    expect(Object.keys(research?.input_schema.properties ?? {})).toEqual([
      "keyword",
      "limit",
    ]);
    expect(research?.input_schema.required).toEqual(["keyword"]);
  });

  it("describes each tool briefly enough to travel with a spoken turn", () => {
    for (const tool of tools) {
      expect(tool.description.length).toBeLessThanOrEqual(180);
      expect(tool.description.length).toBeGreaterThan(0);
    }
  });
});

describe("the tools withheld from voice", () => {
  it("names tools that really exist, so a rename cannot quietly allow one", () => {
    const tools = readdirSync(join(process.cwd(), "src/server/mcp/tools"))
      .filter((file) => file.endsWith(".ts") && !file.includes(".test."))
      .map((file) =>
        readFileSync(join(process.cwd(), "src/server/mcp/tools", file), "utf8"),
      )
      .join("\n");
    for (const name of NEVER_BY_VOICE) {
      expect(tools).toContain(`name: "${name}"`);
    }
  });
});
