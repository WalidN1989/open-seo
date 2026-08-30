import { BusinessModuleService } from "@/server/features/business-modules/services/BusinessModuleService";
import { BusinessSettingsRepository } from "@/server/features/business-modules/repositories/BusinessSettingsRepository";
import { AnalyticsRepository } from "../repositories/AnalyticsRepository";
import { normalizeCurrency } from "@/shared/currencies";

/**
 * Business analytics.
 *
 * Derived only from the commerce tables — orders, order lines, inventory and
 * products. Nothing here touches OpenSEO's SEO, Search Console or Google
 * Analytics data; those answer a different question about a different thing.
 */
async function getOverview(
  organizationId: string,
  userId: string,
  input: { days: number },
) {
  await BusinessModuleService.requireAccess(organizationId, userId, "crm");

  const [current, previous, statuses, byDay, products, inventory, settings] =
    await Promise.all([
      AnalyticsRepository.revenueSummary(organizationId, input.days),
      // The window immediately before this one, so "up 12%" means something.
      AnalyticsRepository.revenueSummary(organizationId, input.days * 2),
      AnalyticsRepository.statusCounts(organizationId, input.days),
      AnalyticsRepository.revenueByDay(organizationId, input.days),
      AnalyticsRepository.topProducts(organizationId, input.days),
      AnalyticsRepository.inventorySummary(organizationId),
      BusinessSettingsRepository.getOrCreate(organizationId),
    ]);

  // The wider query covers both windows, so the earlier one is the difference.
  const priorRevenue = previous.revenueMinor - current.revenueMinor;
  const priorOrders = previous.orders - current.orders;

  return {
    currency: normalizeCurrency(settings?.currency),
    days: input.days,
    revenueMinor: current.revenueMinor,
    orders: current.orders,
    discountMinor: current.discountMinor,
    taxMinor: current.taxMinor,
    // An average of nothing is nothing, not a division by zero.
    averageOrderMinor:
      current.orders > 0
        ? Math.round(current.revenueMinor / current.orders)
        : 0,
    revenueChangePercent: percentChange(current.revenueMinor, priorRevenue),
    ordersChangePercent: percentChange(current.orders, priorOrders),
    statuses,
    byDay,
    topProducts: products,
    inventory,
  };
}

/**
 * Growth against the previous window. Returns null rather than a number when
 * there is nothing to compare against: "up 100%" from a base of zero says
 * more than the data supports.
 */
function percentChange(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

export const AnalyticsService = { getOverview };
