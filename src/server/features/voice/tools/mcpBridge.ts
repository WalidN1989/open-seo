import type { VoiceTool } from "@/server/features/communications/providers/voice-ai";
import { ALL_MCP_TOOLS, MODULE_SURFACES } from "@/server/mcp/catalogue";
import { NEVER_BY_VOICE, toVoiceTools } from "./voiceToolShape";
import { withCacheOnly } from "@/server/lib/dataforseo/cacheOnly";
import { isAffirmative } from "./voiceTools";

/**
 * The whole app, offered to the voice agent.
 *
 * Every module already declares what an agent may do with it — keyword
 * research, domain overviews, backlinks, competitors, audits, optimizations,
 * CRM, invoicing, quotes, reports, analytics. The MCP server registers that
 * list; this hands the same list to the voice agent, so the two cannot drift
 * and nothing had to be written twice.
 *
 * Two things are added on the way through:
 *
 * - **The workspace is not the model's to choose.** The organization and the
 *   project come from the conversation, not from arguments the model fills
 *   in, so it cannot reach another client's data by naming an id.
 * - **Spending needs a yes.** Fresh research costs money. A tool call runs
 *   with paid provider calls refused, and anything that needed one comes back
 *   asking the person first. Once they agree out loud, the same call runs for
 *   real.
 */

type McpTool = {
  name: string;
  config: Record<string, unknown>;
  handler: (...args: never[]) => unknown;
};

/** Which business module a tool belongs to, for the ones that belong to any. */
const MODULE_OF = new Map<string, string>(
  MODULE_SURFACES.flatMap((surface) =>
    surface.tools.map((tool) => [tool.name, surface.key] as const),
  ),
);

/** Everything the voice agent may call in this workspace. */
export function voiceMcpTools(
  enabledModules: ReadonlySet<string>,
): VoiceTool[] {
  return toVoiceTools(ALL_MCP_TOOLS, enabledModules, MODULE_OF);
}

function textOf(result: unknown): string {
  const content: unknown =
    result && typeof result === "object"
      ? Reflect.get(result, "content")
      : null;
  if (Array.isArray(content)) {
    const text = (content as unknown[])
      .map((block: unknown): unknown =>
        block && typeof block === "object" ? Reflect.get(block, "text") : null,
      )
      .filter((value): value is string => typeof value === "string")
      .join("\n")
      .trim();
    if (text) return text;
  }
  return typeof result === "string" ? result : JSON.stringify(result ?? {});
}

/** Is this the app refusing because the answer would have to be bought? */
function needsPaying(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("No saved result") ||
    message.includes("NOT_FOUND") ||
    message.includes("INSUFFICIENT_CREDITS")
  );
}

type McpCallContext = {
  organizationId: string;
  userId: string;
  userEmail: string;
  projectId: string | null;
  baseUrl: string;
  /** The last thing the person said — the guard on spending. */
  lastUserTurn: string;
};

/**
 * Runs one of the app's own tools on the person's behalf and returns what the
 * agent should say about it.
 */
export async function runMcpTool(
  call: { name: string; input: unknown },
  context: McpCallContext,
): Promise<string | null> {
  const tool = ALL_MCP_TOOLS.find((item) => item.name === call.name) as
    | McpTool
    | undefined;
  if (!tool || NEVER_BY_VOICE.has(call.name)) return null;

  const given: Record<string, unknown> = {};
  if (call.input && typeof call.input === "object") {
    for (const key of Object.keys(call.input)) {
      given[key] = Reflect.get(call.input, key);
    }
  }
  const shape = tool.config.inputSchema;
  const declares = (key: string) =>
    Boolean(shape && typeof shape === "object" && key in shape);
  const args = {
    ...given,
    ...(declares("organizationId")
      ? { organizationId: context.organizationId }
      : {}),
    ...(declares("projectId") && context.projectId
      ? { projectId: context.projectId }
      : {}),
  };
  if (declares("projectId") && !context.projectId) {
    return "No project has been chosen yet. Ask which project they mean, then call this again.";
  }

  const toolContext = {
    auth: {
      userId: context.userId,
      userEmail: context.userEmail,
      organizationId: context.organizationId,
      scopes: ["mcp"],
      clientId: null,
      baseUrl: context.baseUrl,
    },
  };
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the tool validates its own arguments; the catalogue is deliberately loosely typed
  const run = () => tool.handler(...([args, toolContext] as never[]));
  const agreed = isAffirmative(context.lastUserTurn);
  try {
    const result = agreed
      ? await run()
      : await withCacheOnly(async () => run());
    return textOf(result);
  } catch (error) {
    if (!agreed && needsPaying(error)) {
      return "Not done: fresh data for this costs credits. Tell them roughly what it is for, ask if they want it, and call this again once they say yes.";
    }
    return error instanceof Error
      ? `That did not work: ${error.message}`
      : "That did not work.";
  }
}
