import { isSouthsideWorkflow } from "@/server/features/customer-workflow/policy";
import { CommerceRepository } from "@/server/features/commerce/repositories/CommerceRepository";
import { z } from "zod";
import { catalogueMatches } from "./voiceCatalogue";
import { decryptCredentials } from "@/server/lib/connection-secrets";
import { BusinessModuleRepository } from "@/server/features/business-modules/repositories/BusinessModuleRepository";
import { WhatsappAssistantRepository } from "@/server/features/communications/repositories/WhatsappAssistantRepository";
import { OrderService } from "@/server/features/commerce/services/OrderService";
import { orderPhone } from "@/server/features/commerce/providers/shopifyOrders";
import { PhoneCallRepository } from "../repositories/PhoneCallRepository";
import { normalisePhone, timingSafeEqual } from "../elevenlabsWebhook";

const requestSchema = z
  .object({
    action: z.enum(["search_products", "search_orders"]),
    query: z.string().trim().max(200).default(""),
  })
  .strict();

/**
 * ElevenLabs supplies x-caller-id from its system__caller_id variable, not
 * from model arguments. The shared secret is an existing provider credential.
 * This endpoint never accepts a workspace or customer phone in its JSON body.
 */
async function query(connectionId: string, headers: Headers, rawBody: string) {
  const connection = await PhoneCallRepository.getIntegrationById(connectionId);
  if (
    !connection ||
    connection.providerKey !== "elevenlabs" ||
    connection.status !== "connected"
  )
    return { status: 404, body: { error: "Unknown connection" } };
  const credentials = await decryptCredentials(connection.credentials);
  const sent = headers.get("x-openseo-secret");
  if (
    !credentials.CALLER_LOOKUP_SECRET ||
    !sent ||
    !timingSafeEqual(sent, credentials.CALLER_LOOKUP_SECRET)
  )
    return { status: 401, body: { error: "Unauthorized" } };
  if (rawBody.length > 4096)
    return { status: 413, body: { error: "Request too large" } };
  let input: z.infer<typeof requestSchema>;
  try {
    input = requestSchema.parse(JSON.parse(rawBody));
  } catch {
    return { status: 400, body: { error: "Invalid query" } };
  }
  const organizationId = connection.organizationId;
  const entitlements =
    await BusinessModuleRepository.listEntitlements(organizationId);
  if (
    !entitlements.some(
      (row) => row.moduleKey === "crm" && row.status === "enabled",
    )
  )
    return { status: 403, body: { error: "CRM is unavailable" } };
  if (input.action === "search_products") {
    if (!input.query)
      return {
        status: 400,
        body: { error: "Supply a product name, SKU or ISBN" },
      };
    if (await isSouthsideWorkflow(organizationId)) {
      const [result, currency] = await Promise.all([
        CommerceRepository.listProducts(organizationId, {
          status: "active",
          limit: 500,
          offset: 0,
        }),
        WhatsappAssistantRepository.currencyFor(organizationId),
      ]);
      return {
        status: 200,
        body: {
          source: "Digital Urgency catalogue",
          currency,
          products: catalogueMatches(result.products, input.query).map((p) => ({
            name: p.name,
            sku: p.sku,
            description: p.description,
            price: p.salePriceMinor > 0 ? p.salePriceMinor / 100 : null,
            pricingBasis: /gate.*frame/i.test(p.name)
              ? "starting price, supply only, GST included"
              : "supply only, GST included; installation quoted separately",
            availability:
              "Ordered after confirmation and payment; supplier availability and lead times require confirmation.",
            product_url: p.productUrl,
          })),
          fallback: "Our representative will get in touch with you.",
          catalogueMayBeTruncated: result.total > result.products.length,
          retrievedAt: new Date().toISOString(),
        },
      };
    }
    const [products, currency] = await Promise.all([
      WhatsappAssistantRepository.searchPricedProducts(
        organizationId,
        input.query,
      ),
      WhatsappAssistantRepository.currencyFor(organizationId),
    ]);
    return {
      status: 200,
      body: {
        source: "DigitalUrgency CRM",
        currency,
        products: products.map((p) => ({
          name: p.name,
          sku: p.sku,
          price: p.salePriceMinor / 100,
          stock: p.quantityOnHand,
          availability:
            p.quantityOnHand === null
              ? "unknown"
              : p.quantityOnHand > 0
                ? "in_stock"
                : "out_of_stock",
          product_url: p.productUrl,
        })),
      },
    };
  }
  // Do not turn a spoken number, a query or a website-supplied variable into
  // authorization. A telephony caller id is injected by ElevenLabs as a header.
  const region = await PhoneCallRepository.defaultPhoneRegion(organizationId);
  const caller = orderPhone(normalisePhone(headers.get("x-caller-id"), region));
  if (!caller)
    return {
      status: 200,
      body: {
        found: false,
        next: "No trusted calling number is available. Ask for a number for staff follow-up; do not disclose order history or claim it was verified.",
      },
    };
  const result = await OrderService.lookupCustomerOrder(
    organizationId,
    caller,
    input.query,
  );
  return { status: 200, body: JSON.parse(result) as unknown };
}

export const VoiceCustomerQueryService = { query };
