import { ProjectContextService } from "@/server/features/project-context/services/ProjectContextService";
import { WhatsappAssistantRepository as Repo } from "../repositories/WhatsappAssistantRepository";
import {
  buildBusinessContext,
  formatCatalogueMatches,
} from "../providers/assistant-knowledge";
import {
  priceTokens,
  type AssistantSettings,
} from "./WhatsappAssistantService";

/** Everything the model may treat as fact about this business. */
export async function businessContext(
  organizationId: string,
  settings: AssistantSettings,
  includeReplyGuidance = true,
) {
  const [prices, published, projectId] = await Promise.all([
    priceTokens(organizationId),
    Repo.listPublishedAnswers(organizationId),
    Repo.projectIdForOrganization(organizationId),
  ]);
  let projectContext: string | null = null;
  if (projectId) {
    try {
      const context = await ProjectContextService.getProjectContext(projectId);
      projectContext = ProjectContextService.renderProjectContextMarkdown(
        context,
      ).slice(0, 6000);
    } catch {
      projectContext = null;
    }
  }
  return buildBusinessContext({
    settings,
    includeReplyGuidance,
    // A bookshop's whole catalogue does not belong in every prompt; the
    // instant-answer tokens still resolve against the full list.
    prices: prices.slice(0, 120),
    publishedAnswers: published.flatMap((item) =>
      item.blogUrl ? [{ question: item.question, url: item.blogUrl }] : [],
    ),
    projectContext,
  });
}

/**
 * What the model sees when it asks about the catalogue: the matching items
 * with their live prices, or a clear "nothing matched" so it does not guess.
 */
export async function lookupProducts(
  organizationId: string,
  query: string,
  includeReplyGuidance = true,
) {
  const [rows, currency] = await Promise.all([
    Repo.searchPricedProducts(organizationId, query),
    Repo.currencyFor(organizationId),
  ]);
  return formatCatalogueMatches(query, rows, currency, includeReplyGuidance);
}
