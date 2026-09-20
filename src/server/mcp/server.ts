import {
  type CallToolResult,
  McpServer,
  type ToolAnnotations,
} from "@modelcontextprotocol/server";
import type { z } from "zod";
import { ALL_MCP_TOOLS } from "@/server/mcp/catalogue";
import {
  createMcpToolContext,
  type McpProps,
  type ToolContext,
} from "@/server/mcp/context";
import { objectSchema } from "@/server/mcp/output-schemas";
import { instrumentMcpToolHandler } from "@/server/mcp/instrumentation";

/**
 * Modules declare their MCP surface; the server registers whatever they
 * declare. Adding a module means adding it here, not threading imports and
 * register() calls through this file one tool at a time.
 */

type ToolSchema = z.ZodType | z.ZodRawShape;

// Tools declare inputSchema as either a raw Zod shape (most tools) or a full
// z.object (the GA4 tools); both normalize to one object schema at
// registration.
type ToolArgs<Input extends ToolSchema> = Input extends z.ZodType
  ? z.infer<Input>
  : Input extends z.ZodRawShape
    ? z.infer<z.ZodObject<Input>>
    : never;

type OpenSeoToolDefinition<Input extends ToolSchema> = {
  name: string;
  config: {
    title?: string;
    description?: string;
    inputSchema: Input;
    outputSchema?: ToolSchema;
    annotations?: ToolAnnotations;
  };
  handler: (
    args: ToolArgs<Input>,
    context: ToolContext,
  ) => CallToolResult | Promise<CallToolResult>;
};

function registerOpenSeoTool<Input extends ToolSchema>(
  server: McpServer,
  tool: OpenSeoToolDefinition<Input>,
  authProps: McpProps,
) {
  const outputSchema = objectSchema(tool.config.outputSchema);
  const handler = instrumentMcpToolHandler(
    tool.name,
    outputSchema,
    tool.handler,
  );

  server.registerTool(
    tool.name,
    {
      ...tool.config,
      inputSchema: objectSchema(tool.config.inputSchema),
      outputSchema,
    },
    (args, context) => {
      return handler(
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- args were validated against the tool's own inputSchema just above
        args as ToolArgs<Input>,
        createMcpToolContext(context, authProps),
      );
    },
  );
}

export function createOpenSeoMcpServer(authProps: McpProps) {
  const server = new McpServer(
    {
      name: "Digital Urgency MCP",
      title: "Digital Urgency",
      version: "0.0.12",
      description:
        "SEO research tools for AI agents: keyword research and metrics, SERP and local SERP results, domain and backlink analysis, rank tracking, and Google Search Console performance.",
      websiteUrl: "https://openseo.so",
      icons: [
        {
          src: "https://openseo.so/android-chrome-512x512.png",
          mimeType: "image/png",
          sizes: ["512x512"],
        },
      ],
    },
    {
      instructions:
        "Digital Urgency research tools use credits. Proceed with normal focused research, but ask the user for confirmation before planned batches over 2,000 credits.",
    },
  );

  const register = <Input extends ToolSchema>(
    tool: OpenSeoToolDefinition<Input>,
  ) => registerOpenSeoTool(server, tool, authProps);

  // Every tool comes from the shared catalogue, so the MCP surface and the
  // voice agent's toolset are one list.
  for (const tool of ALL_MCP_TOOLS) {
    // The catalogue holds tools with different input schemas; TypeScript has
    // no existential type to name "a tool of some schema", so each is
    // narrowed back here. The surface tests pin which tools can appear.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    register(tool as Parameters<typeof register>[0]);
  }

  return server;
}
