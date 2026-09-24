import { BusinessModuleService } from "@/server/features/business-modules/services/BusinessModuleService";
import { BusinessAuditRepository } from "@/server/features/business-modules/repositories/BusinessAuditRepository";
import { lovableFor } from "@/server/features/optimizations/lovable/lovablePublisher";
import { listSiteServices } from "@/server/features/optimizations/lovable/siteServices";
import { AppError } from "@/server/lib/errors";
import { CommerceRepository } from "../repositories/CommerceRepository";

/**
 * The website's service pages, brought into the catalogue.
 *
 * A business writes what it sells once, on its own site, and then writes it
 * again in every quote, invoice and reply. This copies the site's answer in,
 * so the price a customer reads online is the price the assistant quotes.
 *
 * Services are stored as services: they carry a price and no stock, so no
 * count ever treats them as something on a shelf.
 */

/** A service page has no SKU, so one is made from its address — the same one
 *  every run, which is what makes a second sync an update and not a copy. */
function serviceSku(slug: string) {
  const stem = slug
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return `SVC-${stem || "SERVICE"}`;
}

/** Whole currency units on the site; minor units in the catalogue. */
function priceMinor(priceFrom: number | null) {
  return priceFrom === null ? 0 : Math.round(priceFrom * 100);
}

/**
 * Copy every service page into the catalogue, updating what is already there.
 *
 * Nothing is removed: a page taken off the site may still be sold, and
 * deleting a customer's catalogue behind their back is not this button's job.
 */
async function syncServices(organizationId: string, userId: string) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    "crm",
    "manage",
  );
  const site = await lovableFor(organizationId);
  if (!site) {
    throw new AppError(
      "VALIDATION_ERROR",
      "No website is connected for this project, so there are no services to read.",
    );
  }
  const services = await listSiteServices(site);
  if (services.length === 0) {
    throw new AppError(
      "VALIDATION_ERROR",
      "No service pages were found on this site.",
    );
  }

  let synced = 0;
  let unpriced = 0;
  for (const service of services) {
    if (service.priceFrom === null) unpriced += 1;
    const row = await CommerceRepository.upsertExternalProduct(organizationId, {
      externalSource: "lovable-site",
      externalId: service.slug,
      name: service.title,
      sku: serviceSku(service.slug),
      description: service.description || null,
      category: service.category,
      salePriceMinor: priceMinor(service.priceFrom),
      productUrl: service.url,
      itemType: "service",
    });
    if (row) synced += 1;
  }

  await BusinessAuditRepository.record({
    organizationId,
    actorUserId: userId,
    action: "commerce.services.synced_from_site",
    targetType: "commerce_products",
    metadata: { synced, unpriced, repository: site.repository },
  });

  return { synced, unpriced };
}

export const SiteCatalogueService = { syncServices };
