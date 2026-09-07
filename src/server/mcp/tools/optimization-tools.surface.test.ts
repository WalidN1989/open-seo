import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The safety argument for this module is that an agent *cannot* approve or
 * publish, because no such tool exists — not because a permission check says
 * no. A check can be misconfigured; an absent capability cannot.
 *
 * These assertions read the source rather than importing it, because importing
 * the tools pulls in the database provider and the worker runtime. The point
 * here is the shape of the surface, which the text answers directly.
 */
const toolsSource = readFileSync(
  join(process.cwd(), "src/server/mcp/tools/optimization-tools.ts"),
  "utf8",
);
const serverSource = readFileSync(
  join(process.cwd(), "src/server/mcp/server.ts"),
  "utf8",
);

function declaredToolNames(source: string) {
  return [...source.matchAll(/^\s*name: "([a-z_]+)",$/gm)].map(
    (match) => match[1]!,
  );
}

describe("the optimization MCP surface", () => {
  it("exposes exactly the tools an agent needs to propose work", () => {
    expect(declaredToolNames(toolsSource).toSorted()).toEqual([
      "append_optimization_comment",
      "attach_optimization_brief",
      "attach_optimization_draft",
      "create_optimization_opportunity",
      "get_optimization_feedback",
      "list_optimization_opportunities",
    ]);
  });

  it("offers no way for an agent to approve, publish, or delete", () => {
    for (const name of declaredToolNames(toolsSource)) {
      expect(name).not.toMatch(/approve|publish|delete|reject/);
    }
  });

  it("never reaches the service methods that approve or publish", () => {
    // approve() and beginPublish() take a user id or gate on it; a tool calling
    // either would mean an agent could decide its own work is finished.
    expect(toolsSource).not.toMatch(/OptimizationService\.approve/);
    expect(toolsSource).not.toMatch(/OptimizationService\.beginPublish/);
    expect(toolsSource).not.toMatch(/OptimizationService\.reject/);
    expect(toolsSource).not.toMatch(/OptimizationService\.submitForReview/);
  });

  it("registers every optimization tool it declares, and no others", () => {
    const registered = [
      ...serverSource.matchAll(/register\((\w*[Oo]ptimization\w*)\)/g),
    ].map((match) => match[1]!);
    expect(registered.toSorted()).toEqual([
      "appendOptimizationCommentTool",
      "attachOptimizationBriefTool",
      "attachOptimizationDraftTool",
      "createOptimizationOpportunityTool",
      "getOptimizationFeedbackTool",
      "listOptimizationOpportunitiesTool",
    ]);
  });
});
