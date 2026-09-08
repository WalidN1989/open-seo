import { createServerFn } from "@tanstack/react-start";
import { InvoiceService } from "@/server/features/invoicing/services/InvoiceService";
import {
  requireAuthenticatedContext,
  requireSignedDocumentToken,
} from "@/serverFunctions/middleware";
import {
  invoiceDocumentTokenSchema,
  invoiceIdSchema,
  invoiceSettingsSchema,
  saveInvoiceSchema,
  setInvoiceStatusSchema,
} from "@/types/schemas/invoicing";

export const getInvoicingWorkspace = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .handler(({ context }) =>
    InvoiceService.workspace(context.organizationId, context.userId),
  );

export const saveInvoiceSettings = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(invoiceSettingsSchema)
  .handler(({ data, context }) =>
    InvoiceService.saveSettings(context.organizationId, context.userId, data),
  );

export const getInvoice = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(invoiceIdSchema)
  .handler(({ data, context }) =>
    InvoiceService.detail(
      context.organizationId,
      context.userId,
      data.invoiceId,
    ),
  );

export const saveInvoice = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(saveInvoiceSchema)
  .handler(({ data, context }) =>
    InvoiceService.save(context.organizationId, context.userId, data),
  );

export const setInvoiceStatus = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(setInvoiceStatusSchema)
  .handler(({ data, context }) =>
    InvoiceService.setStatus(context.organizationId, context.userId, data),
  );

export const deleteInvoice = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(invoiceIdSchema)
  .handler(({ data, context }) =>
    InvoiceService.remove(
      context.organizationId,
      context.userId,
      data.invoiceId,
    ),
  );

/**
 * Reads an invoice for a shared document link.
 *
 * Deliberately unauthenticated: the signed token IS the credential, and the
 * workspace it grants comes from inside the signature rather than the URL.
 */
export const getInvoiceDocument = createServerFn({ method: "POST" })
  .middleware(requireSignedDocumentToken)
  .validator(invoiceDocumentTokenSchema)
  .handler(({ context }) =>
    InvoiceService.detailForClaims(context.organizationId, context.invoiceId),
  );

export const createInvoiceDocumentLink = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(invoiceIdSchema)
  .handler(({ data, context }) =>
    InvoiceService.documentLink(
      context.organizationId,
      context.userId,
      data.invoiceId,
    ),
  );
