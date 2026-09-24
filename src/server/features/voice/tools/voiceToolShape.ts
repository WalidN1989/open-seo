import { z } from "zod";
import type { VoiceTool } from "@/server/features/communications/providers/voice-ai";

/**
 * Turning the app's own tools into the list the voice model is given.
 *
 * Kept apart from the catalogue it is normally fed, so what is offered — and
 * what is withheld — can be checked without starting the whole application.
 */

type Catalogued = {
  name: string;
  config: Record<string, unknown>;
};

/**
 * Kept out of the voice agent's hands: anything that speaks to a customer in
 * the business's name. Drafting is offered, sending is not — a misheard word
 * must not become an email, a text or a WhatsApp message to a real person.
 */
export const NEVER_BY_VOICE = new Set([
  "send_email",
  "reply_to_email_thread",
  "send_sms",
  "send_whatsapp_reply",
  "send_whatsapp_template",
  "send_client_report",
  "create_project",
]);

function describe(config: Record<string, unknown>) {
  const title = config.title;
  const description = config.description;
  return (
    [
      typeof title === "string" ? title : "",
      typeof description === "string" ? description : "",
    ]
      .filter(Boolean)
      .join(" — ")
      // Short: ninety tools travel with every spoken turn, and a paragraph
      // each would cost more time than the answer.
      .slice(0, 180)
  );
}

/** The tool's own zod shape, as the JSON Schema the model is given. */
function inputSchema(config: Record<string, unknown>) {
  const shape = config.inputSchema;
  if (!shape || typeof shape !== "object") {
    return { type: "object" as const, properties: {} };
  }
  // A tool's declared shape, as the schema the model reads. The catalogue is
  // deliberately loosely typed, so the shape arrives as a plain object.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const schema = z.toJSONSchema(z.object(shape as z.ZodRawShape), {
    io: "input",
    unrepresentable: "any",
  });
  const properties =
    schema.properties && typeof schema.properties === "object"
      ? schema.properties
      : {};
  // The workspace and project are filled in from the conversation, so the
  // model is never asked for them and cannot name someone else's.
  const { organizationId, projectId, ...rest } = properties;
  void organizationId;
  void projectId;
  const required = Array.isArray(schema.required)
    ? schema.required.filter(
        (name) => name !== "organizationId" && name !== "projectId",
      )
    : undefined;
  return {
    type: "object" as const,
    properties: rest,
    ...(required?.length ? { required } : {}),
  };
}

/**
 * Everything the voice agent may call, as the model sees it.
 *
 * A module the business has not switched on is left out entirely rather than
 * offered and then refused, so the agent never promises something this
 * workspace cannot do.
 */
export function toVoiceTools(
  tools: readonly Catalogued[],
  enabledModules: ReadonlySet<string>,
  moduleOf: ReadonlyMap<string, string>,
): VoiceTool[] {
  return tools
    .filter((tool) => {
      if (NEVER_BY_VOICE.has(tool.name)) return false;
      const module = moduleOf.get(tool.name);
      return !module || enabledModules.has(module);
    })
    .map((tool) => ({
      name: tool.name,
      description: describe(tool.config),
      input_schema: inputSchema(tool.config),
    }));
}
