import { z } from "zod";
import type { WordpressArticle } from "./wordpressArticle";

/**
 * WordPress's REST API with an Application Password: find a post by slug and
 * create or update it, published. Pure apart from `fetch`.
 */

export type WordpressCredentials = {
  siteUrl: string;
  username: string;
  applicationPassword: string;
};

const postSchema = z.object({
  id: z.number(),
  link: z.string(),
  status: z.string(),
});

/** "bookshopnearme.lk" is what people type; it means https://bookshopnearme.lk. */
export function siteOrigin(siteUrl: string) {
  const trimmed = siteUrl.trim();
  const url = new URL(
    /^[a-z]+:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`,
  );
  if (url.protocol !== "https:") {
    throw new Error("The WordPress site address must start with https://.");
  }
  return url.origin;
}

async function call(
  credentials: WordpressCredentials,
  path: string,
  fetcher: typeof fetch,
  init?: { method: string; body: string },
) {
  const response = await fetcher(`${siteOrigin(credentials.siteUrl)}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: `Basic ${btoa(`${credentials.username}:${credentials.applicationPassword.replace(/\s+/g, "")}`)}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: init?.body,
    // workerd rejects "error"; a redirect here usually means http→https or a
    // login page, and either way the post was not written.
    redirect: "manual",
    signal: AbortSignal.timeout(30_000),
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = z.object({ message: z.string() }).safeParse(payload);
    throw new Error(
      response.status === 401 || response.status === 403
        ? "WordPress refused the login. Check the username and Application Password."
        : message.success
          ? `WordPress said: ${message.data.message}`
          : `WordPress returned ${response.status}.`,
    );
  }
  return payload;
}

export async function publishToWordpress(
  credentials: WordpressCredentials,
  article: WordpressArticle,
  kind: "posts" | "pages",
  fetcher: typeof fetch = fetch,
) {
  const found = z
    .array(z.object({ id: z.number() }))
    .safeParse(
      await call(
        credentials,
        `/wp-json/wp/v2/${kind}?slug=${encodeURIComponent(article.slug)}&status=publish,draft,pending,private&context=edit`,
        fetcher,
      ),
    );
  const existingId = found.success ? found.data[0]?.id : undefined;
  const saved = postSchema.safeParse(
    await call(
      credentials,
      `/wp-json/wp/v2/${kind}${existingId ? `/${existingId}` : ""}`,
      fetcher,
      {
        method: "POST",
        body: JSON.stringify({
          title: article.title,
          content: article.html,
          slug: article.slug,
          status: "publish",
          ...(article.excerpt ? { excerpt: article.excerpt } : {}),
        }),
      },
    ),
  );
  if (!saved.success) throw new Error("WordPress's reply could not be read.");
  return {
    postId: saved.data.id,
    url: saved.data.link,
    status: saved.data.status,
    updatedExisting: Boolean(existingId),
  };
}

/** For the integration's Check now: who the Application Password logs in as. */
export async function wordpressWhoAmI(
  credentials: WordpressCredentials,
  fetcher: typeof fetch = fetch,
) {
  const me = z
    .object({ name: z.string() })
    .safeParse(
      await call(credentials, "/wp-json/wp/v2/users/me?context=edit", fetcher),
    );
  return me.success ? me.data.name : credentials.username;
}
