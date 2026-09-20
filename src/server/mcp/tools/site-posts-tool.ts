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

const sitePostsInput = { projectId: projectIdSchema } as const;

/**
 * What the site already publishes. Offered so an agent reads the blog from
 * the site's own files rather than crawling it, and so the obvious question
 * — is this keyword already covered? — is cheap to answer before writing.
 */
export const listSitePostsTool = {
  name: "list_site_posts",
  config: {
    title: "List the posts already live on this project's site",
    description:
      "The articles already published on the project's connected website, newest first, with title, address, date and the keyword each was written for. Uses no credits. Call this before proposing a blog: if the site already covers the search, improve that article (recommendedAction 'optimize_existing' with its targetUrl) instead of publishing a second one that competes with it.",
    inputSchema: sitePostsInput,
    outputSchema: {
      connected: z.boolean(),
      posts: z.array(looseObjectOutputSchema),
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(
    async (args: z.infer<z.ZodObject<typeof sitePostsInput>>, context) => {
      const { connected, posts } = await OptimizationPublishService.sitePosts(
        context.auth.organizationId,
      );
      const text = !connected
        ? "No website is connected for this project, so nothing can be read from it."
        : posts.length
          ? `Live posts (${posts.length}):\n` +
            posts
              .map(
                (post) =>
                  `- ${post.date || "undated"} · ${post.title} — ${post.url}${post.keyword ? ` (written for "${post.keyword}")` : ""}`,
              )
              .join("\n")
          : "The site has no blog posts yet.";
      return mcpResponse({
        text,
        meta: buildProjectMeta(context, args.projectId, url(args.projectId)),
        structuredContent: { connected, posts },
      });
    },
  ),
};
