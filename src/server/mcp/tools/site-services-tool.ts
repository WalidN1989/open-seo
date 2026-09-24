import { z } from "zod";
import { OptimizationPublishService } from "@/server/features/optimizations/services/OptimizationPublishService";
import { buildProjectMeta } from "@/server/mcp/context";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { projectIdSchema } from "@/server/mcp/schemas";
import { mcpResponse } from "@/server/mcp/formatters";
import {
  looseObjectOutputSchema,
  optionalMetaOutputSchema,
} from "@/server/mcp/output-schemas";

function url(projectId: string) {
  return `/p/${projectId}/optimizations`;
}

const siteServicesInput = { projectId: projectIdSchema } as const;

/**
 * The service pages the site already has, read from the site's own files.
 *
 * A service page is the page a business most wants to rank, so an agent that
 * proposes work without reading them proposes an article that competes with
 * one. Offered read-only: changing a service page changes what a business
 * sells and what it charges, which is a person's decision.
 */
export const listSiteServicesTool = {
  name: "list_site_services",
  config: {
    title: "List the service pages already live on this project's site",
    description:
      "The service pages published on the project's connected website, with title, address, path, category, price from, the keyword each page is written for, and when the site's service data last changed. Uses no credits. Call this with list_site_posts before proposing content: if a service page already targets the search, improve that page (recommendedAction 'optimize_existing' with its targetUrl) rather than publishing an article that competes with it.",
    inputSchema: siteServicesInput,
    outputSchema: {
      connected: z.boolean(),
      services: z.array(looseObjectOutputSchema),
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(
    async (args: z.infer<z.ZodObject<typeof siteServicesInput>>, context) => {
      const { connected, services } =
        await OptimizationPublishService.siteServices(
          context.auth.organizationId,
        );
      const text = !connected
        ? "No website is connected for this project, so nothing can be read from it."
        : services.length
          ? `Service pages (${services.length}):\n` +
            services
              .map(
                (service) =>
                  `- ${service.title} — ${service.url}${
                    service.primaryKeyword
                      ? ` (written for "${service.primaryKeyword}")`
                      : ""
                  }${
                    service.priceFrom
                      ? ` · from ${service.currency} ${service.priceFrom}${service.priceType === "monthly" ? "/month" : ""}`
                      : ""
                  }`,
              )
              .join("\n")
          : "The site has no service pages, or they are not where this reads them.";
      return mcpResponse({
        text,
        meta: buildProjectMeta(context, args.projectId, url(args.projectId)),
        structuredContent: { connected, services },
      });
    },
  ),
};
