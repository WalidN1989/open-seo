import { z } from "zod";
import { formatMoney } from "@/server/features/invoicing/invoiceTotals";
import { QuoteFlowService } from "@/server/features/quotes/services/QuoteFlowService";
import { QuoteService } from "@/server/features/quotes/services/QuoteService";
import { AppError } from "@/server/lib/errors";
import { mcpResponse } from "@/server/mcp/formatters";
import type { McpModuleSurface } from "@/server/mcp/module-registry";
import { withMcpOrganizationAuth } from "@/server/mcp/organization-auth";
import {
  looseObjectOutputSchema,
  optionalMetaOutputSchema,
} from "@/server/mcp/output-schemas";

// An agent can find what the business sells and put a quote together. It
// cannot send one, record the client's answer, or turn it into an invoice:
// those are statements about a real conversation with a real client, and
// they stay with the person who had it.

const organizationIdSchema = z
  .string()
  .min(1)
  .optional()
  .describe(
    "Workspace to act in. Optional when the account belongs to only one.",
  );

const quoteIdSchema = z.string().min(1).describe("Quote id, from list_quotes.");

const whole = (minor: number) => minor / 100;

const catalogueInput = {
  organizationId: organizationIdSchema,
  search: z
    .string()
    .max(200)
    .optional()
    .describe("Name or SKU to look for. Omit to list the catalogue."),
  itemType: z
    .enum(["product", "service"])
    .optional()
    .describe("Only products, or only services."),
} as const;

const searchCatalogueTool = {
  name: "search_quote_catalogue",
  config: {
    title: "Search products and services to quote",
    description:
      "Lists the workspace's active products and services with their sale prices, in whole currency units. Use the returned id as productId on draft_quote lines so the quote uses the catalogue price and wording.",
    inputSchema: catalogueInput,
    outputSchema: {
      items: z.array(looseObjectOutputSchema),
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpOrganizationAuth(
    async (args: z.infer<z.ZodObject<typeof catalogueInput>>, context) => {
      const items = await QuoteFlowService.searchCatalogue(
        context.organizationId,
        context.auth.userId,
        { search: args.search, itemType: args.itemType },
      );
      const shaped = items.map((item) => ({
        ...item,
        salePrice: whole(item.salePriceMinor),
      }));
      return mcpResponse({
        text: shaped.length
          ? shaped
              .map(
                (item) =>
                  `${item.name} (${item.itemType}, ${item.sku}) — ${item.salePrice} · id ${item.id}`,
              )
              .join("\n")
          : "Nothing in the catalogue matches.",
        structuredContent: { items: shaped },
      });
    },
  ),
};

const listInput = {
  organizationId: organizationIdSchema,
  leadId: z
    .string()
    .min(1)
    .optional()
    .describe("Only quotes for this CRM lead."),
} as const;

const listQuotesTool = {
  name: "list_quotes",
  config: {
    title: "List quotes",
    description:
      "Lists quotes, newest first, with number, status (draft, sent, accepted, declined, expired), client, total and valid-until date.",
    inputSchema: listInput,
    outputSchema: {
      quotes: z.array(looseObjectOutputSchema),
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpOrganizationAuth(
    async (args: z.infer<z.ZodObject<typeof listInput>>, context) => {
      const quotes = args.leadId
        ? (
            await QuoteFlowService.listForLead(
              context.organizationId,
              context.auth.userId,
              args.leadId,
            )
          ).quotes
        : (
            await QuoteService.workspace(
              context.organizationId,
              context.auth.userId,
            )
          ).quotes;
      return mcpResponse({
        text: quotes.length
          ? quotes
              .map(
                (quote) =>
                  `${quote.number} · ${quote.status} · ${quote.clientName} · ${formatMoney(quote.totalMinor, quote.currency)} · valid until ${quote.validUntil} · id ${quote.id}`,
              )
              .join("\n")
          : "No quotes yet.",
        structuredContent: { quotes },
      });
    },
  ),
};

const getInput = {
  organizationId: organizationIdSchema,
  quoteId: quoteIdSchema,
} as const;

const getQuoteTool = {
  name: "get_quote",
  config: {
    title: "Get a quote",
    description:
      "Returns one quote with its lines. Amounts are given in minor units and in whole units.",
    inputSchema: getInput,
    outputSchema: {
      quote: looseObjectOutputSchema,
      lines: z.array(looseObjectOutputSchema),
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpOrganizationAuth(
    async (args: z.infer<z.ZodObject<typeof getInput>>, context) => {
      const detail = await QuoteService.detail(
        context.organizationId,
        context.auth.userId,
        args.quoteId,
      );
      const { quote } = detail;
      const lines = detail.lines.map((line) => ({
        ...line,
        quantity: line.quantityMilli / 1000,
        unitPrice: whole(line.unitPriceMinor),
        amount: whole(line.amountMinor),
      }));
      return mcpResponse({
        text: `${quote.number} (${quote.status}) for ${quote.clientName}: ${formatMoney(quote.totalMinor, quote.currency)}, valid until ${quote.validUntil}.\n${lines
          .map(
            (line) =>
              `- ${line.quantity} × ${line.description} @ ${line.unitPrice}`,
          )
          .join("\n")}`,
        structuredContent: {
          quote: { ...quote, total: whole(quote.totalMinor) },
          lines,
        },
      });
    },
  ),
};

const lineSchema = z.object({
  productId: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Catalogue id from search_quote_catalogue. Fills description and price when those are omitted.",
    ),
  description: z.string().min(1).max(300).optional(),
  detail: z.string().max(1000).optional(),
  quantity: z.number().min(0.001).max(1000).default(1),
  unitPrice: z
    .number()
    .min(0)
    .optional()
    .describe("Whole currency units. Defaults to the catalogue price."),
});

const draftInput = {
  organizationId: organizationIdSchema,
  quoteId: z
    .string()
    .min(1)
    .optional()
    .describe("Pass to revise an existing draft; omit to create one."),
  leadId: z
    .string()
    .min(1)
    .optional()
    .describe(
      "CRM lead the quote is for. Client name, email and title default from it.",
    ),
  title: z.string().max(200).optional(),
  clientName: z.string().min(1).max(200).optional(),
  clientEmail: z.string().max(200).optional(),
  clientAddressLines: z.string().max(600).optional(),
  validUntil: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe("Defaults to the workspace's quote validity period."),
  notes: z.string().max(2000).optional(),
  lines: z.array(lineSchema).min(1).max(50),
} as const;

type DraftArgs = z.infer<z.ZodObject<typeof draftInput>>;

async function resolveLines(
  organizationId: string,
  userId: string,
  lines: DraftArgs["lines"],
) {
  const ids = lines.flatMap((line) => (line.productId ? [line.productId] : []));
  const catalogue = ids.length
    ? await QuoteFlowService.catalogueItems(organizationId, userId, ids)
    : [];
  return lines.map((line) => {
    const product = line.productId
      ? catalogue.find((item) => item.id === line.productId)
      : undefined;
    if (line.productId && !product) {
      throw new AppError(
        "NOT_FOUND",
        `Product ${line.productId} is not in this workspace's catalogue.`,
      );
    }
    const description = line.description ?? product?.name;
    if (!description) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Each line needs a description or a productId.",
      );
    }
    return {
      productId: product?.id ?? null,
      description,
      detail: line.detail ?? product?.description?.slice(0, 1000) ?? null,
      quantityMilli: Math.round(line.quantity * 1000),
      unitPriceMinor:
        line.unitPrice === undefined
          ? (product?.salePriceMinor ?? 0)
          : Math.round(line.unitPrice * 100),
    };
  });
}

const draftQuoteTool = {
  name: "draft_quote",
  config: {
    title: "Create or revise a quote draft",
    description:
      "Writes a DRAFT quote a person then reviews and sends. With leadId, the client details come from the CRM lead and the quote shows on that lead. Lines can reference catalogue items by productId. There is no tool to send a quote, record the client's answer, or convert it to an invoice.",
    inputSchema: draftInput,
    outputSchema: {
      quote: looseObjectOutputSchema,
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpOrganizationAuth(async (args: DraftArgs, context) => {
    const { organizationId } = context;
    const userId = context.auth.userId;
    const prefill = args.leadId
      ? await QuoteFlowService.prefillFromLead(
          organizationId,
          userId,
          args.leadId,
        )
      : null;
    const workspace = await QuoteService.workspace(organizationId, userId);
    const clientName = args.clientName ?? prefill?.clientName;
    if (!clientName) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Give a clientName, or a leadId to take it from.",
      );
    }
    const issueDate = new Date().toISOString().slice(0, 10);
    const quote = await QuoteService.save(organizationId, userId, {
      quoteId: args.quoteId ?? null,
      leadId: args.leadId ?? null,
      title: args.title ?? prefill?.title ?? null,
      clientName,
      clientEmail: args.clientEmail ?? prefill?.clientEmail ?? null,
      clientAddressLines: args.clientAddressLines ?? null,
      currency: prefill?.currency ?? workspace.settings.defaultCurrency,
      issueDate,
      validUntil:
        args.validUntil ??
        prefill?.validUntil ??
        new Date(Date.now() + workspace.settings.quoteValidityDays * 86_400_000)
          .toISOString()
          .slice(0, 10),
      notes: args.notes ?? null,
      lines: await resolveLines(organizationId, userId, args.lines),
    });
    return mcpResponse({
      text: `Draft ${quote.number} for ${quote.clientName} — ${formatMoney(quote.totalMinor, quote.currency)}. A person still has to review and send it.`,
      structuredContent: { quote },
    });
  }),
};

const documentInput = {
  organizationId: organizationIdSchema,
  quoteId: quoteIdSchema,
} as const;

const getQuoteDocumentTool = {
  name: "get_quote_document",
  config: {
    title: "Get a shareable link to a quote",
    description:
      "Returns a signed, time-limited URL to the quote as the client sees it, printable to PDF from the browser. The link needs no login and expires.",
    inputSchema: documentInput,
    outputSchema: {
      number: z.string(),
      url: z.string(),
      expiresAt: z.string(),
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpOrganizationAuth(
    async (args: z.infer<z.ZodObject<typeof documentInput>>, context) => {
      const link = await QuoteFlowService.documentLink(
        context.organizationId,
        context.auth.userId,
        args.quoteId,
      );
      const url = `${context.baseUrl}${link.path}`;
      return mcpResponse({
        text: `${link.number}: ${url}\nValid until ${link.expiresAt}.`,
        structuredContent: {
          number: link.number,
          url,
          expiresAt: link.expiresAt,
        },
      });
    },
  ),
};

export const quoteSurface: McpModuleSurface = {
  key: "quotes",
  scope: "organization",
  summary:
    "Find products and services, and prepare quote drafts for leads. Sending, the client's answer and invoicing stay with a person.",
  tools: [
    searchCatalogueTool,
    listQuotesTool,
    getQuoteTool,
    draftQuoteTool,
    getQuoteDocumentTool,
  ],
  withheld: [
    {
      action: "mark a quote sent, or email it",
      because:
        "It asserts the client has it, and it locks the quote against edits.",
    },
    {
      action: "record a quote as accepted or declined",
      because:
        "Only the person who spoke to the client knows their answer, and acceptance commits the business to the price.",
    },
    {
      action: "convert a quote into an invoice",
      because: "Raising an invoice asks for money; a person decides that.",
    },
    {
      action: "delete a quote or change quote numbering and terms",
      because: "Numbers have to stay accounted for, and terms are legal text.",
    },
  ],
};
