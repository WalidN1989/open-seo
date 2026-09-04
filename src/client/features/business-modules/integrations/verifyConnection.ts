import { checkIntegrationHealth } from "@/serverFunctions/commerce";
import { testIntegration } from "@/serverFunctions/communications";
import { getStandardErrorMessage } from "@/client/lib/error-messages";

/**
 * Verifies a connection with the check that suits its provider.
 *
 * Every provider used to be verified through the catalogue-sync health check,
 * which only knows WooCommerce and Shopify. Connecting Firecrawl, Apify or
 * Hunter therefore reported "Please check your input and try again" — the
 * generic copy for the VALIDATION_ERROR that check raises for a provider it
 * has no catalogue reader for — which reads as a rejected API key rather than
 * a question that was never asked about it.
 */
export async function verifyConnection(input: {
  connectionId: string;
  supportsCatalogueSync: boolean;
}): Promise<{ ok: boolean; detail: string }> {
  try {
    if (input.supportsCatalogueSync) {
      // Worth the separate path: it reports the store's product count, which
      // is the thing a merchant actually wants confirmed.
      const health = await checkIntegrationHealth({
        data: { connectionId: input.connectionId },
      });
      return {
        ok: health?.status === "connected",
        detail:
          health?.healthDetail ??
          (health?.status === "connected"
            ? "Connected"
            : "The credentials did not work."),
      };
    }

    const result = await testIntegration({
      data: { connectionId: input.connectionId },
    });
    return { ok: true, detail: result?.detail ?? "Connected" };
  } catch (error) {
    return { ok: false, detail: getStandardErrorMessage(error) };
  }
}
