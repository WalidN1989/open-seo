import { and, count, desc, eq, like, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  commerceInventoryBalances,
  commerceProducts,
  crmContacts,
  organization,
  voiceAgentLessons,
} from "@/db/schema";

const platformKnowledge = [
  "Digital Urgency is a multi-organization business and SEO platform.",
  "Its business workspace includes CRM leads, contacts, companies, inquiries, meetings, products, inventory, orders, analytics, WhatsApp, Voice Agent, and integrations.",
  "The integrations catalogue supports commerce and data providers including Shopify and WooCommerce. Product catalogue rows remain attributed to their source.",
  "WhatsApp provides a shared inbox, contacts, templates, campaigns, automation, an assistant, order requests, reports, and connection settings.",
  "Voice Agent provides browser voice conversations. Telephone calling is a separate provider capability and must not be promised unless configured.",
  "Digital Urgency SEO workspaces provide site audits, keyword research, rank tracking, backlinks, competitors, local SEO, and project context.",
].join("\n");

export async function buildVoiceAgentContext(
  organizationId: string,
  agentConfigId: string,
  question: string,
) {
  const searchTerms = question
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((term) => term.length >= 3)
    .slice(0, 8);
  const productMatch = searchTerms.length
    ? or(
        ...searchTerms.flatMap((term) => [
          like(sql`lower(${commerceProducts.name})`, `%${term}%`),
          like(sql`lower(${commerceProducts.sku})`, `%${term}%`),
          like(sql`lower(${commerceProducts.category})`, `%${term}%`),
        ]),
      )
    : undefined;
  const [[org], [contactTotal], products, lessons] = await Promise.all([
    db
      .select({ name: organization.name })
      .from(organization)
      .where(eq(organization.id, organizationId))
      .limit(1),
    db
      .select({ value: count() })
      .from(crmContacts)
      .where(eq(crmContacts.organizationId, organizationId)),
    db
      .select({
        name: commerceProducts.name,
        sku: commerceProducts.sku,
        category: commerceProducts.category,
        price: commerceProducts.salePriceMinor,
        productUrl: commerceProducts.productUrl,
        stock: commerceInventoryBalances.quantityOnHand,
      })
      .from(commerceProducts)
      .leftJoin(
        commerceInventoryBalances,
        and(
          eq(commerceInventoryBalances.organizationId, organizationId),
          eq(commerceInventoryBalances.productId, commerceProducts.id),
        ),
      )
      .where(
        and(
          eq(commerceProducts.organizationId, organizationId),
          eq(commerceProducts.status, "active"),
          productMatch,
        ),
      )
      .orderBy(desc(commerceProducts.updatedAt))
      .limit(50),
    db
      .select({
        kind: voiceAgentLessons.kind,
        lesson: voiceAgentLessons.lesson,
      })
      .from(voiceAgentLessons)
      .where(
        and(
          eq(voiceAgentLessons.organizationId, organizationId),
          eq(voiceAgentLessons.agentConfigId, agentConfigId),
        ),
      )
      .orderBy(
        desc(voiceAgentLessons.seenCount),
        desc(voiceAgentLessons.updatedAt),
      )
      .limit(40),
  ]);
  const productContext = products.length
    ? products
        .map(
          (product) =>
            `- ${product.name} | SKU ${product.sku} | ${product.category ?? "uncategorized"} | price minor units ${product.price} | stock ${product.stock ?? "unknown"}${product.productUrl ? ` | ${product.productUrl}` : ""}`,
        )
        .join("\n")
    : "No current product rows were found.";
  const learned = lessons.length
    ? lessons.map((item) => `- (${item.kind}) ${item.lesson}`).join("\n")
    : "No durable conversation lessons have been learned yet.";
  return [
    `Organization: ${org?.name ?? "Current organization"}. CRM contact count: ${contactTotal?.value ?? 0}.`,
    `Digital Urgency platform knowledge:\n${platformKnowledge}`,
    `Current organization catalogue snapshot:\n${productContext}`,
    `Durable lessons learned from this agent's past conversations:\n${learned}`,
  ].join("\n\n");
}
