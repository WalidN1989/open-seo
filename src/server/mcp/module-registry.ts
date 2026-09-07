/**
 * How a module joins the MCP surface.
 *
 * The SEO tools were registered one import and one `register()` call at a
 * time, which was fine while there was one product. With business modules
 * arriving steadily — invoicing today, quotes and retainers and time after it
 * — a module should be able to declare what it exposes in one place and be
 * picked up without editing the server.
 *
 * A surface is a declaration, not a framework: it carries the tools, the scope
 * they authorize against, and — importantly — the capabilities deliberately
 * withheld. That last field is documentation the tests read, so a gap stays a
 * decision rather than becoming an oversight.
 */

export type McpModuleScope = "organization" | "project";

export type McpModuleSurface = {
  /** Matches the business-module key where one exists. */
  key: string;
  scope: McpModuleScope;
  /** One line, for the agent contract doc. */
  summary: string;
  tools: readonly McpToolLike[];
  /**
   * Actions an agent must not be able to take, and why.
   *
   * Every entry here is a capability that does NOT exist as a tool. Writing it
   * down is what stops a later contributor adding one back as a convenience,
   * because a test asserts no tool name matches these.
   */
  withheld: readonly { action: string; because: string }[];
};

/** The shape every tool module already exports. */
export type McpToolLike = {
  name: string;
  config: Record<string, unknown>;
  handler: (...args: never[]) => unknown;
};

export function toolNames(surface: McpModuleSurface): string[] {
  return surface.tools.map((tool) => tool.name);
}
