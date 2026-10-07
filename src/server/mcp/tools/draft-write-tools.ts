import { z } from "zod";
import { EmailDraftService } from "@/server/features/email/services/EmailDraftService";
import { CommunicationDraftService } from "@/server/features/communications/services/CommunicationDraftService";
import { setMcpWriteAudit } from "@/server/mcp/context";
import { mcpResponse } from "@/server/mcp/formatters";
import type { McpModuleSurface } from "@/server/mcp/module-registry";
import { withMcpOrganizationAuth } from "@/server/mcp/organization-auth";
import {
  looseObjectOutputSchema,
  optionalMetaOutputSchema,
} from "@/server/mcp/output-schemas";

const organizationId = z.string().min(1).optional();
const updateInput = {
  organizationId,
  draftMessageId: z.string().min(1),
  text: z.string().min(1).max(20_000).optional(),
  cc: z.array(z.string().email()).max(10).optional(),
  bcc: z.array(z.string().email()).max(10).optional(),
} as const;
const updateEmailDraftTool = {
  name: "update_email_draft",
  config: {
    title: "Update email draft",
    description:
      "Edits a saved email draft; it remains unsent and awaiting human approval.",
    inputSchema: updateInput,
    outputSchema: {
      draft: looseObjectOutputSchema,
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpOrganizationAuth(
    async (args: z.infer<z.ZodObject<typeof updateInput>>, context) => {
      const { organizationId: _org, draftMessageId, ...patch } = args;
      const result = await EmailDraftService.updateDraft(
        context.organizationId,
        context.auth.userId,
        draftMessageId,
        patch,
      );
      setMcpWriteAudit(context, {
        targetType: "email_draft",
        targetId: draftMessageId,
        before: result.before,
        after: result.after,
      });
      return mcpResponse({
        text: "Email draft updated; nothing was sent.",
        structuredContent: { draft: result.after },
      });
    },
  ),
};
const deleteInput = {
  organizationId,
  draftMessageId: z.string().min(1),
} as const;
const deleteEmailDraftTool = {
  name: "delete_email_draft",
  config: {
    title: "Delete email draft",
    description:
      "Soft-deletes an unsent email draft; no email is sent and no row is hard-deleted.",
    inputSchema: deleteInput,
    outputSchema: {
      draft: looseObjectOutputSchema,
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: true,
    },
  },
  handler: withMcpOrganizationAuth(
    async (args: z.infer<z.ZodObject<typeof deleteInput>>, context) => {
      const result = await EmailDraftService.softDeleteDraft(
        context.organizationId,
        context.auth.userId,
        args.draftMessageId,
      );
      setMcpWriteAudit(context, {
        targetType: "email_draft",
        targetId: args.draftMessageId,
        before: result.before,
        after: result.after,
      });
      return mcpResponse({
        text: "Email draft soft-deleted; nothing was sent.",
        structuredContent: { draft: result.after },
      });
    },
  ),
};

function messageDraftTool(channel: "whatsapp" | "sms") {
  const name = `draft_${channel}_reply`;
  const input = {
    organizationId,
    conversationId:
      channel === "whatsapp"
        ? z.string().min(1).describe("Existing WhatsApp conversation id.")
        : z.string().min(1).optional(),
    recipient: z.string().min(3).max(80),
    body: z.string().min(1).max(4000),
  } as const;
  return {
    name,
    config: {
      title: `Draft ${channel} reply`,
      description: `Saves a ${channel} draft awaiting approval in the app. It never sends.`,
      inputSchema: input,
      outputSchema: {
        draft: looseObjectOutputSchema,
        ...optionalMetaOutputSchema,
      },
      annotations: {
        readOnlyHint: false,
        openWorldHint: false,
        destructiveHint: false,
      },
    },
    handler: withMcpOrganizationAuth(
      async (args: z.infer<z.ZodObject<typeof input>>, context) => {
        const draft = await CommunicationDraftService.save(
          context.organizationId,
          context.auth.userId,
          {
            channel,
            conversationId: args.conversationId,
            recipient: args.recipient,
            body: args.body,
          },
        );
        setMcpWriteAudit(context, {
          targetType: `${channel}_draft`,
          targetId: draft.id,
          before: null,
          after: draft,
        });
        return mcpResponse({
          text: `${channel} draft saved for approval; nothing was sent.`,
          structuredContent: { draft },
        });
      },
    ),
  };
}
export const draftWriteSurface: McpModuleSurface = {
  access: {
    readScope: "business:read",
    writeScope: "business:write",
    legacyCompatible: false,
  },
  key: "message-drafts",
  scope: "organization",
  summary:
    "Edit and soft-delete email drafts and create WhatsApp/SMS drafts without sending.",
  tools: [
    updateEmailDraftTool,
    deleteEmailDraftTool,
    messageDraftTool("whatsapp"),
    messageDraftTool("sms"),
  ],
  withheld: [
    {
      action: "approve or send drafts",
      because: "Real sends keep the existing human-approval flow.",
    },
  ],
};
