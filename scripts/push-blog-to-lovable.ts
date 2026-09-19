/**
 * Dry run of an approved blog's push to its Lovable site: prints the post
 * file and the images that would be committed, without generating an image,
 * calling GitHub or changing anything. The real push is the Approve button in
 * Content Optimization, which a person clicks.
 *
 *   DATABASE_URL=… pnpm exec tsx scripts/push-blog-to-lovable.ts \
 *     --opportunityId=<id> --site=https://digitalurgency.com.au --dry-run
 */
import process from "node:process";
import postgres from "postgres";
import {
  imagePaths,
  planPost,
  renderPost,
  siteFor,
} from "../src/server/features/optimizations/lovable/lovablePost";

function arg(name: string) {
  const prefix = `--${name}=`;
  return process.argv
    .find((item) => item.startsWith(prefix))
    ?.slice(prefix.length);
}

async function main() {
  const opportunityId = arg("opportunityId");
  const siteUrl = arg("site") ?? "https://digitalurgency.com.au";
  if (!process.argv.includes("--dry-run")) {
    throw new Error(
      "Only --dry-run is supported here. Publish from the Approve button.",
    );
  }
  if (!opportunityId) throw new Error("Pass --opportunityId=<id>.");
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Set DATABASE_URL.");
  const sql = postgres(url, { max: 1 });
  try {
    const [row] = await sql<
      {
        keyword: string;
        type: string;
        status: string;
        draft_json: string | null;
        target_url: string | null;
        proposed_path: string | null;
      }[]
    >`select keyword, type, status, draft_json, target_url, proposed_path
      from optimization_opportunities where id = ${opportunityId}`;
    if (!row) throw new Error("No opportunity with that id.");
    const plan = planPost({
      draft: row.draft_json ? JSON.parse(row.draft_json) : null,
      keyword: row.keyword,
      path: row.target_url ?? row.proposed_path,
      site: siteFor(siteUrl),
    });
    if (!plan) throw new Error("The draft has no title or body.");
    const sources = Object.fromEntries(
      plan.images.map((image) => [
        image.key,
        image.existingUrl ?? imagePaths(plan.slug, image.key, "webp").sitePath,
      ]),
    );
    const post = renderPost({
      plan,
      siteUrl,
      date: new Date().toISOString().slice(0, 10),
      keyword: row.keyword,
      opportunityId,
      imageSources: sources,
    });
    console.log(
      `Type ${row.type}, status ${row.status}, site ${siteFor(siteUrl)}`,
    );
    console.log(`Would write src/content/blog/${plan.slug}.json`);
    for (const image of plan.images) {
      console.log(
        image.existingUrl
          ? `  ${image.key}: use ${image.existingUrl}`
          : `  ${image.key}: generate → ${imagePaths(plan.slug, image.key, "webp").repoPath}\n      prompt: ${image.prompt}`,
      );
    }
    console.log(
      JSON.stringify({ ...post, html: `${post.html.slice(0, 400)}…` }, null, 2),
    );
  } finally {
    await sql.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
