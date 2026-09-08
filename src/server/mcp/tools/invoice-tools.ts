import { z } from "zod";
import { InvoiceService } from "@/server/features/invoicing/services/InvoiceService";
import { formatMoney } from "@/server/features/invoicing/invoiceTotals";
import { mcpResponse } from "@/server/mcp/formatters";
import {
  looseObjectOutputSchema,
  optionalMetaOutputSchema,
} from "@/server/mcp/output-schemas";
import { withMcpOrganizationAuth } from "@/server/mcp/organization-auth";
import type { McpModuleSurface } from "@/server/mcp/module-registry";

// Nothing here marks an invoice paid, sent, or void, and nothing edits the
// issuer profile. Those are claims about money and about the outside world;
// they stay with the person whose bank account it is. As with approving
// content, the guarantee is that the capability is absent, not that a check
// refuses it.

const organizationIdSchema = z
  .string()
  .min(1)
  .optional()
  .describe(
    "Workspace to act in. Optional when the account belongs to only one.",
  );

const invoiceIdSchema = z
  .string()
  .min(1)
  .describe("Invoice id, from list_invoices.");

const lineSchema = z.object({
  description: z
    .string()
    .min(1)
    .max(300)
    .describe("What is being charged for."),
  detail: z
    .string()
    .max(1000)
    .optional()
    .describe("A sentence of specifics, shown under the description."),
  quantity: z.number().min(-1000).max(1000).default(1),
  unitPrice: z
    .number()
    .describe("In whole currency units — 200 means two hundred dollars."),
});

const listInput = {
  organizationId: organizationIdSchema,
  status: z
    .enum(["draft", "sent", "paid", "void"])
    .optional()
    .describe("Filter by status."),
} as const;

export const listInvoicesTool = {
  name: "list_invoices",
  config: {
    title: "List invoices",
    description:
      "Lists invoices in a workspace with their status, client, dates and totals. Uses no credits — reads Digital Urgency's own database. Invoice rows here are the record; this server is not a view onto Xero or QuickBooks.",
    inputSchema: listInput,
    outputSchema: {
      invoices: z.array(looseObjectOutputSchema),
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
      const workspace = await InvoiceService.workspace(
        context.organizationId,
        context.auth.userId,
      );
      const invoices = args.status
        ? workspace.invoices.filter((row) => row.status === args.status)
        : workspace.invoices;
      const text = invoices.length
        ? invoices
            .map(
              (row) =>
                `- [${row.status}] ${row.number} · ${row.clientName} · ${formatMoney(row.totalMinor, row.currency)} ${row.currency} · due ${row.dueDate} (id ${row.id})`,
            )
            .join("\n")
        : "No invoices yet.";
      return mcpResponse({
        text,
        structuredContent: { invoices },
      });
    },
  ),
};

const getInput = {
  organizationId: organizationIdSchema,
  invoiceId: invoiceIdSchema,
} as const;

export const getInvoiceTool = {
  name: "get_invoice",
  config: {
    title: "Read one invoice",
    description:
      "Returns one invoice with its line items and the issuer details frozen onto it. Bank details are not included.",
    inputSchema: getInput,
    outputSchema: {
      invoice: looseObjectOutputSchema,
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
      const detail = await InvoiceService.detail(
        context.organizationId,
        context.auth.userId,
        args.invoiceId,
      );
      // Payment instructions are for the client on the document, not for an
      // agent reading the record.
      const {
        bankDetails: _bank,
        paymentInstructions: _pay,
        ...issuer
      } = detail.issuer;
      // Whole units alongside the stored minor units: an agent reading
      // "totalMinor: 20000" has to know the convention, and one that does not
      // will quote two hundred dollars as twenty thousand.
      const lines = detail.lines.map((line) => ({
        ...line,
        quantity: line.quantityMilli / 1000,
        unitPrice: line.unitPriceMinor / 100,
        amount: line.amountMinor / 100,
      }));
      const invoice = {
        ...detail.invoice,
        heading: detail.heading,
        subtotal: detail.invoice.subtotalMinor / 100,
        tax: detail.invoice.taxMinor / 100,
        total: detail.invoice.totalMinor / 100,
        issuer,
        // The link itself comes from get_invoice_document, so an ordinary read
        // does not hand out a URL to a page carrying payment details.
        documentAvailable: true,
      };
      return mcpResponse({
        text: `${detail.heading} ${detail.invoice.number} for ${detail.invoice.clientName} — ${formatMoney(detail.invoice.totalMinor, detail.invoice.currency)} ${detail.invoice.currency}, ${detail.invoice.status}. Call get_invoice_document for a shareable link.`,
        structuredContent: { invoice, lines },
      });
    },
  ),
};

const documentInput = {
  organizationId: organizationIdSchema,
  invoiceId: invoiceIdSchema,
} as const;

export const getInvoiceDocumentTool = {
  name: "get_invoice_document",
  config: {
    title: "Get a shareable link to an invoice document",
    description:
      "Returns a signed, time-limited URL to the invoice exactly as its recipient sees it — the page a client opens and prints or saves as a PDF. The server does not render PDF binaries; the browser does. The link needs no login, expires, and carries the full document including payment details, so treat it as you would the invoice itself.",
    inputSchema: documentInput,
    outputSchema: {
      number: z.string(),
      url: z.string(),
      expiresAt: z.string(),
      format: z.string(),
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
      const link = await InvoiceService.documentLink(
        context.organizationId,
        context.auth.userId,
        args.invoiceId,
      );
      const url = `${context.baseUrl}${link.path}`;
      return mcpResponse({
        text: `${link.number}: ${url}\nValid until ${link.expiresAt}. Open it and print to PDF.`,
        structuredContent: {
          number: link.number,
          url,
          expiresAt: link.expiresAt,
          format: "html",
        },
      });
    },
  ),
};

const draftInput = {
  organizationId: organizationIdSchema,
  invoiceId: z
    .string()
    .min(1)
    .optional()
    .describe("Pass to revise an existing draft; omit to create a new one."),
  clientName: z.string().min(1).max(200),
  clientAddressLines: z.string().max(600).optional(),
  clientEmail: z.string().max(200).optional(),
  clientTaxIdLabel: z
    .string()
    .max(60)
    .optional()
    .describe("ABN, VAT, and so on."),
  clientTaxIdValue: z.string().max(60).optional(),
  currency: z
    .string()
    .length(3)
    .optional()
    .describe("Defaults to the workspace currency."),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  servicePeriod: z
    .string()
    .max(200)
    .optional()
    .describe("What the work covered, e.g. 17 August – 16 September 2026."),
  notes: z.string().max(2000).optional(),
  lines: z.array(lineSchema).min(1).max(50),
} as const;

export const draftInvoiceTool = {
  name: "draft_invoice",
  config: {
    title: "Create or revise an invoice draft",
    description:
      "Writes a DRAFT invoice a person then reviews and sends. Creating assigns the next number in the workspace sequence. An invoice that has already been issued cannot be edited — raise a new one instead. There is no tool to send an invoice or to mark one paid.",
    inputSchema: draftInput,
    outputSchema: {
      invoice: looseObjectOutputSchema,
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpOrganizationAuth(
    async (args: z.infer<z.ZodObject<typeof draftInput>>, context) => {
      const workspace = await InvoiceService.workspace(
        context.organizationId,
        context.auth.userId,
      );
      const invoice = await InvoiceService.save(
        context.organizationId,
        context.auth.userId,
        {
          invoiceId: args.invoiceId ?? null,
          documentType: "invoice",
          clientName: args.clientName,
          clientAddressLines: args.clientAddressLines ?? null,
          clientEmail: args.clientEmail ?? null,
          clientTaxIdLabel: args.clientTaxIdLabel ?? null,
          clientTaxIdValue: args.clientTaxIdValue ?? null,
          currency: args.currency ?? workspace.settings.defaultCurrency,
          issueDate: args.issueDate,
          dueDate: args.dueDate,
          servicePeriod: args.servicePeriod ?? null,
          notes: args.notes ?? null,
          // Whole units in, minor units stored — the agent should not have to
          // think in cents to write "200".
          lines: args.lines.map((line) => ({
            description: line.description,
            detail: line.detail ?? null,
            quantityMilli: Math.round(line.quantity * 1000),
            unitPriceMinor: Math.round(line.unitPrice * 100),
          })),
        },
      );
      return mcpResponse({
        text: `Draft ${invoice.number} for ${invoice.clientName} — ${formatMoney(invoice.totalMinor, invoice.currency)} ${invoice.currency}. A person still has to review and send it.`,
        structuredContent: { invoice },
      });
    },
  ),
};

export const invoiceSurface: McpModuleSurface = {
  key: "invoicing",
  scope: "organization",
  summary:
    "Read invoices and prepare drafts. Sending, marking paid, voiding and the issuer profile stay with a person.",
  tools: [
    listInvoicesTool,
    getInvoiceTool,
    getInvoiceDocumentTool,
    draftInvoiceTool,
  ],
  withheld: [
    {
      action: "mark an invoice paid",
      because:
        "It asserts money arrived. Only the person watching the bank account knows that.",
    },
    {
      action: "mark an invoice sent, or email it",
      because:
        "It asserts something happened outside the app, and it is the moment an invoice stops being editable.",
    },
    {
      action: "void or delete an invoice",
      because: "The number has to stay accounted for.",
    },
    {
      action: "edit the issuer profile or bank details",
      because:
        "Changing where money is asked to be sent is the highest-value target in the product.",
    },
  ],
};
