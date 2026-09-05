import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  businessSettings,
  commerceProducts,
  projects,
  whatsappAskedQuestions,
  whatsappAssistantSettings,
  whatsappConversations,
  whatsappInstantAnswers,
  whatsappMessages,
} from "@/db/schema";

export type AssistantSettingsRow =
  typeof whatsappAssistantSettings.$inferSelect;
export type AssistantSettingsInput = Partial<
  Omit<AssistantSettingsRow, "organizationId" | "createdAt" | "updatedAt">
>;

async function getSettings(organizationId: string) {
  const [row] = await db
    .select()
    .from(whatsappAssistantSettings)
    .where(eq(whatsappAssistantSettings.organizationId, organizationId))
    .limit(1);
  return row ?? null;
}

async function upsertSettings(
  organizationId: string,
  values: AssistantSettingsInput,
) {
  const updatedAt = new Date().toISOString();
  const [row] = await db
    .insert(whatsappAssistantSettings)
    .values({ organizationId, ...values, updatedAt })
    .onConflictDoUpdate({
      target: whatsappAssistantSettings.organizationId,
      set: { ...values, updatedAt },
    })
    .returning();
  return row;
}

async function listInstantAnswers(organizationId: string) {
  return db
    .select()
    .from(whatsappInstantAnswers)
    .where(eq(whatsappInstantAnswers.organizationId, organizationId))
    .orderBy(desc(whatsappInstantAnswers.createdAt));
}

async function findInstantAnswer(
  organizationId: string,
  normalizedQuestion: string,
) {
  const [row] = await db
    .select()
    .from(whatsappInstantAnswers)
    .where(
      and(
        eq(whatsappInstantAnswers.organizationId, organizationId),
        eq(whatsappInstantAnswers.normalizedQuestion, normalizedQuestion),
        eq(whatsappInstantAnswers.enabled, true),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function createInstantAnswer(
  organizationId: string,
  values: { question: string; normalizedQuestion: string; answer: string },
) {
  const [row] = await db
    .insert(whatsappInstantAnswers)
    .values({ id: crypto.randomUUID(), organizationId, ...values })
    .returning();
  return row;
}

async function updateInstantAnswer(
  organizationId: string,
  id: string,
  values: Partial<{
    question: string;
    normalizedQuestion: string;
    answer: string;
    enabled: boolean;
  }>,
) {
  const [row] = await db
    .update(whatsappInstantAnswers)
    .set({ ...values, updatedAt: new Date().toISOString() })
    .where(
      and(
        eq(whatsappInstantAnswers.organizationId, organizationId),
        eq(whatsappInstantAnswers.id, id),
      ),
    )
    .returning();
  return row ?? null;
}

async function deleteInstantAnswer(organizationId: string, id: string) {
  const rows = await db
    .delete(whatsappInstantAnswers)
    .where(
      and(
        eq(whatsappInstantAnswers.organizationId, organizationId),
        eq(whatsappInstantAnswers.id, id),
      ),
    )
    .returning({ id: whatsappInstantAnswers.id });
  return rows.length > 0;
}

async function listAskedQuestions(organizationId: string) {
  return db
    .select()
    .from(whatsappAskedQuestions)
    .where(eq(whatsappAskedQuestions.organizationId, organizationId))
    .orderBy(
      desc(whatsappAskedQuestions.askCount),
      desc(whatsappAskedQuestions.lastAskedAt),
    )
    .limit(200);
}

async function listPublishedAnswers(organizationId: string) {
  return db
    .select({
      question: whatsappAskedQuestions.question,
      blogUrl: whatsappAskedQuestions.blogUrl,
    })
    .from(whatsappAskedQuestions)
    .where(
      and(
        eq(whatsappAskedQuestions.organizationId, organizationId),
        eq(whatsappAskedQuestions.status, "published"),
      ),
    )
    .orderBy(desc(whatsappAskedQuestions.askCount))
    .limit(40);
}

/** Count one more ask of a question, creating it on first sight. */
async function recordAskedQuestion(
  organizationId: string,
  values: { question: string; normalizedQuestion: string },
) {
  const now = new Date().toISOString();
  await db
    .insert(whatsappAskedQuestions)
    .values({
      id: crypto.randomUUID(),
      organizationId,
      question: values.question.slice(0, 300),
      normalizedQuestion: values.normalizedQuestion,
      lastAskedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        whatsappAskedQuestions.organizationId,
        whatsappAskedQuestions.normalizedQuestion,
      ],
      set: {
        askCount: sql`${whatsappAskedQuestions.askCount} + 1`,
        lastAskedAt: now,
        updatedAt: now,
      },
    });
}

async function updateAskedQuestion(
  organizationId: string,
  id: string,
  values: Partial<{ blogUrl: string | null; status: string }>,
) {
  const [row] = await db
    .update(whatsappAskedQuestions)
    .set({ ...values, updatedAt: new Date().toISOString() })
    .where(
      and(
        eq(whatsappAskedQuestions.organizationId, organizationId),
        eq(whatsappAskedQuestions.id, id),
      ),
    )
    .returning();
  return row ?? null;
}

async function deleteAskedQuestion(organizationId: string, id: string) {
  const rows = await db
    .delete(whatsappAskedQuestions)
    .where(
      and(
        eq(whatsappAskedQuestions.organizationId, organizationId),
        eq(whatsappAskedQuestions.id, id),
      ),
    )
    .returning({ id: whatsappAskedQuestions.id });
  return rows.length > 0;
}

/** Active products with a price, for `{{price:Name}}` tokens and the prompt. */
async function listPricedProducts(organizationId: string) {
  const [rows, [settings]] = await Promise.all([
    db
      .select({
        name: commerceProducts.name,
        salePriceMinor: commerceProducts.salePriceMinor,
      })
      .from(commerceProducts)
      .where(
        and(
          eq(commerceProducts.organizationId, organizationId),
          eq(commerceProducts.status, "active"),
        ),
      )
      .orderBy(commerceProducts.name)
      .limit(300),
    db
      .select({ currency: businessSettings.currency })
      .from(businessSettings)
      .where(eq(businessSettings.organizationId, organizationId))
      .limit(1),
  ]);
  return { products: rows, currency: settings?.currency ?? "AUD" };
}

/** The project this organization belongs to, for its context markdown. */
async function projectIdForOrganization(organizationId: string) {
  const [row] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.organizationId, organizationId))
    .limit(1);
  return row?.id ?? null;
}

async function getConversationStatus(
  organizationId: string,
  conversationId: string,
) {
  const [row] = await db
    .select({ status: whatsappConversations.status })
    .from(whatsappConversations)
    .where(
      and(
        eq(whatsappConversations.organizationId, organizationId),
        eq(whatsappConversations.id, conversationId),
      ),
    )
    .limit(1);
  return row?.status ?? null;
}

/** The newest inbound message's external id, to tell if a later one arrived. */
async function latestInboundExternalId(
  organizationId: string,
  conversationId: string,
) {
  const [row] = await db
    .select({ externalMessageId: whatsappMessages.externalMessageId })
    .from(whatsappMessages)
    .where(
      and(
        eq(whatsappMessages.organizationId, organizationId),
        eq(whatsappMessages.conversationId, conversationId),
        eq(whatsappMessages.direction, "inbound"),
      ),
    )
    .orderBy(desc(whatsappMessages.createdAt))
    .limit(1);
  return row?.externalMessageId ?? null;
}

export const WhatsappAssistantRepository = {
  getSettings,
  upsertSettings,
  listInstantAnswers,
  findInstantAnswer,
  createInstantAnswer,
  updateInstantAnswer,
  deleteInstantAnswer,
  listAskedQuestions,
  listPublishedAnswers,
  recordAskedQuestion,
  updateAskedQuestion,
  deleteAskedQuestion,
  listPricedProducts,
  projectIdForOrganization,
  getConversationStatus,
  latestInboundExternalId,
};
