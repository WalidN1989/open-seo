# Content Optimization → Lovable site (with images)

**Approve → images → commit to the site's repo → you click Publish in Lovable → live.**

## Flow

1. An agent drafts a blog in Content Optimization (as today).
2. You open it → **Publish** tab → **Approve & send to Lovable**.
3. In the background (about 1–2 minutes) Open SEO:
   - plans the images: a **hero** always (the writer's `images[]` hero, or one
     described from the title and keyword), plus one per `![alt][IMAGE: …]` /
     `![alt](IMAGE: …)` placeholder. A placeholder that repeats the hero is dropped;
   - generates each missing image in the site's country (AU or LK style guide:
     no text, no logos, no other country's flags or landmarks);
   - commits **one** commit to the site's GitHub repo:
     `src/content/blog/<slug>.json` + `public/blog-images/<slug>/<key>.<ext>`.
4. The opportunity shows **Sent to your Lovable site** with the image thumbnails and a
   link to the commit. Lovable syncs the commit into the project.
5. You open the project in Lovable and click **Publish**. Only then is it live at
   `/blog/<slug>`. (Both domains are served by Lovable, 185.158.133.1 — the live site
   changes only on Publish.)

## Rules it keeps

- **Never AU ↔ LK.** Each project's organization connects its own site; the push can only
  go to that organization's repository. `.lk` addresses get Sri Lankan images.
- **Hero or nothing.** If the hero cannot be made, nothing is committed and the article
  shows **failed** with the reason and a retry. An in-article image that fails is left
  out of the post and noted.
- **Idempotent.** The file is `<slug>.json`; sending again replaces it (keeping the
  original date) and reuses images already committed, so a retry does not pay for the
  same picture twice.
- **Fast-forward only.** If someone pushed meanwhile, the push fails with "try again"
  rather than overwriting their work.
- **Blogs only** for now. Pages and products are refused with a clear message.
- Post format is the one the sites already read (`src/lib/blog.ts`): slug, title,
  description, date, category, author, heroImage, html — plus `keyword` and
  `openseoOpportunityId`. The hero is absolute (it is the og:image); body images are
  site-relative, so they show in Lovable's preview before publishing.

Status choice: a successful push sets the opportunity to `published` with
`cmsTarget.awaitingLovablePublish: true`. The UI says "Sent — click Publish in Lovable",
never "live". No new status was added.

## Setup (once per site)

1. **Image model** — on the server (Railway), add ONE of:
   - `OPENAI_API_KEY` → `gpt-image-1`, 1536×1024 WebP (about US$0.04 per image), or
   - `GEMINI_API_KEY` → `gemini-2.5-flash-image`, 16:9 PNG.
     `BLOG_IMAGE_MODEL` optionally overrides the model name.
2. **GitHub token** — github.com → Settings → Developer settings → Fine-grained tokens:
   only the site repositories, **Contents: Read and write**.
3. **Connect the site** — switch to the project → Business → Integrations → **Lovable
   site** → Connect:

   | Project             | Live site address               | Repository                                                        |
   | ------------------- | ------------------------------- | ----------------------------------------------------------------- |
   | Digital Urgency AUS | `https://digitalurgency.com.au` | `WalidN1989/sprout-reach-studio` (Lovable "DU Australia .com.au") |
   | DU Sri Lanka        | `https://www.digitalurgency.lk` | `WalidN1989/digitalurgency.lk` (Lovable "DigitalUrgency.lk")      |

   Then **Check now**: it counts the posts already in the blog.

A connected Lovable site takes priority over WordPress for that project.

## Dry run

Prints the post file and image plan for an opportunity. Generates nothing, calls no API:

```bash
DATABASE_URL=… pnpm exec tsx scripts/push-blog-to-lovable.ts \
  --opportunityId=<id> --site=https://www.digitalurgency.lk --dry-run
```

## Not in phase 1

Auto-publish to production, agent approval, MCP `push_optimization_to_cms`, pages and
products. Approval stays a browser action by a person (see OPTIMIZATIONS_MODULE.md).
