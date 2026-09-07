import { createServerFn } from "@tanstack/react-start";
import { InvoiceService } from "@/server/features/invoicing/services/InvoiceService";
import { requireAuthenticatedContext } from "@/serverFunctions/middleware";
import {
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
