import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { QuoteEmailService } from "@/server/features/quotes/services/QuoteEmailService";
import { QuoteFlowService } from "@/server/features/quotes/services/QuoteFlowService";
import { QuoteService } from "@/server/features/quotes/services/QuoteService";
import { productItemTypeSchema } from "@/types/schemas/commerce";
import {
  quoteDocumentTokenSchema,
  quoteIdSchema,
  quoteLeadSchema,
  saveQuoteSchema,
  setQuoteStatusSchema,
} from "@/types/schemas/quotes";
import {
  requireAuthenticatedContext,
  requireSignedQuoteToken,
} from "./middleware";

export const getQuotesWorkspace = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .handler(({ context }) =>
    QuoteService.workspace(context.organizationId, context.userId),
  );

export const getQuote = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(quoteIdSchema)
  .handler(({ context, data }) =>
    QuoteService.detail(context.organizationId, context.userId, data.quoteId),
  );

export const saveQuote = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(saveQuoteSchema)
  .handler(({ context, data }) =>
    QuoteService.save(context.organizationId, context.userId, data),
  );

export const deleteQuote = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(quoteIdSchema)
  .handler(({ context, data }) =>
    QuoteService.remove(context.organizationId, context.userId, data.quoteId),
  );

export const setQuoteStatus = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(setQuoteStatusSchema)
  .handler(({ context, data }) =>
    QuoteFlowService.setStatus(context.organizationId, context.userId, data),
  );

export const createQuoteLink = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(quoteIdSchema)
  .handler(({ context, data }) =>
    QuoteFlowService.documentLink(
      context.organizationId,
      context.userId,
      data.quoteId,
    ),
  );

export const convertQuoteToInvoice = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(quoteIdSchema)
  .handler(({ context, data }) =>
    QuoteFlowService.convertToInvoice(
      context.organizationId,
      context.userId,
      data.quoteId,
    ),
  );

export const getQuotePrefill = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(quoteLeadSchema)
  .handler(({ context, data }) =>
    QuoteFlowService.prefillFromLead(
      context.organizationId,
      context.userId,
      data.leadId,
    ),
  );

export const getLeadQuotes = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(quoteLeadSchema)
  .handler(({ context, data }) =>
    QuoteFlowService.listForLead(
      context.organizationId,
      context.userId,
      data.leadId,
    ),
  );

export const searchQuoteCatalogue = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(
    z.object({
      search: z.string().trim().max(200).optional(),
      itemType: productItemTypeSchema.optional(),
    }),
  )
  .handler(({ context, data }) =>
    QuoteFlowService.searchCatalogue(
      context.organizationId,
      context.userId,
      data,
    ),
  );

export const emailQuote = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(
    z.object({
      quoteId: z.string().min(1),
      to: z.string().trim().max(200).nullish(),
      message: z.string().trim().max(2000).nullish(),
    }),
  )
  .handler(({ context, data }) =>
    QuoteEmailService.emailQuote(context.organizationId, context.userId, data),
  );

/** The client's view of a quote, authorized by the signed link alone. */
export const getQuoteDocument = createServerFn({ method: "POST" })
  .middleware(requireSignedQuoteToken)
  .validator(quoteDocumentTokenSchema)
  .handler(({ context }) =>
    QuoteService.detailForClaims(context.organizationId, context.quoteId),
  );
