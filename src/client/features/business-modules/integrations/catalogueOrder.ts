import type { IntegrationCatalogueEntry } from "@/shared/integration-catalogue";

/**
 * Roughly where each brand mark sits on the colour wheel. It is an ordering
 * key only — nothing renders it — so a row reads as a gradient instead of a
 * jumble. A monochrome mark has no hue and sorts last within its group.
 */
const BRAND_HUE: Record<string, number> = {
  zoho: 0,
  hubspot: 14,
  claude_haiku: 18,
  firecrawl: 20,
  hunter: 25,
  shopify: 80,
  google_sheets: 145,
  apify: 150,
  messenger: 209,
  payhere: 230,
  stripe: 245,
  woocommerce: 262,
  make: 280,
  instagram: 330,
};
const NO_HUE = 999;

/**
 * What a business has connected comes first — that is the tile it returns to.
 * Then what it could connect, then what is built in, then what is not
 * available yet.
 */
function statusRank(entry: IntegrationCatalogueEntry, connected: boolean) {
  if (connected) return 0;
  if (entry.state === "connectable") return 1;
  if (entry.state === "built_in") return 2;
  return 3;
}

export function orderCatalogue(
  entries: readonly IntegrationCatalogueEntry[],
  connectedKeys: ReadonlySet<string>,
): IntegrationCatalogueEntry[] {
  return entries.toSorted((a, b) => {
    const byStatus =
      statusRank(a, connectedKeys.has(a.key)) -
      statusRank(b, connectedKeys.has(b.key));
    if (byStatus !== 0) return byStatus;
    const byHue = (BRAND_HUE[a.key] ?? NO_HUE) - (BRAND_HUE[b.key] ?? NO_HUE);
    return byHue !== 0 ? byHue : a.name.localeCompare(b.name);
  });
}
