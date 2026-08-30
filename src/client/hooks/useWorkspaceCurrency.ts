import { useQuery } from "@tanstack/react-query";
import { getBusinessSettings } from "@/serverFunctions/commerce";
import { DEFAULT_CURRENCY, formatMoney } from "@/shared/currencies";

export const CURRENCY_KEY = ["business", "settings", "currency"];

/**
 * The workspace currency and a formatter bound to it. Every screen that shows
 * money goes through this, so changing the setting changes all of them and no
 * page can quietly keep its own hardcoded symbol.
 */
export function useWorkspaceCurrency() {
  const query = useQuery({
    queryKey: CURRENCY_KEY,
    queryFn: () => getBusinessSettings(),
    // The workspace currency changes about once, ever.
    staleTime: 5 * 60_000,
  });
  const currency = query.data?.currency ?? DEFAULT_CURRENCY;
  return {
    currency,
    format: (minor: number | null | undefined, compact = false) =>
      formatMoney(minor, currency, { compact }),
  };
}
