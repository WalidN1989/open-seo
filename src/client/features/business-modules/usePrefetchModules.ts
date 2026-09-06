import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getBusinessModuleAccess } from "@/serverFunctions/business-modules";
import {
  getIntegrationsWorkspace,
  getWhatsappWorkspace,
} from "@/serverFunctions/communications";
import { getLeadsWorkspace } from "@/serverFunctions/crm";
import { getEmailWorkspace } from "@/serverFunctions/email";
import type { BusinessModuleKey } from "@/shared/business-modules";

/**
 * The first read of a module costs a round trip to the database; every read
 * after it is served from the cache. Nobody opens a module the instant they
 * sign in, so the wait can be spent before they ask for it.
 */
const PREFETCHABLE: Partial<
  Record<
    BusinessModuleKey,
    { key: readonly unknown[]; load: () => Promise<unknown> }
  >
> = {
  whatsapp: {
    key: ["whatsapp", "workspace"],
    load: () => getWhatsappWorkspace(),
  },
  email: { key: ["email", "workspace"], load: () => getEmailWorkspace() },
  integrations: {
    key: ["integrations", "workspace"],
    load: () => getIntegrationsWorkspace(),
  },
  leads: { key: ["crm", "leads"], load: () => getLeadsWorkspace() },
};

/** Run once the browser has nothing better to do, so the open module wins. */
function whenIdle(run: () => void): () => void {
  if (typeof requestIdleCallback === "function") {
    const handle = requestIdleCallback(run, { timeout: 4000 });
    return () => cancelIdleCallback(handle);
  }
  const handle = setTimeout(run, 1500);
  return () => clearTimeout(handle);
}

/**
 * Warms the other modules this business has switched on, so moving between
 * them is a cache read rather than a wait. Only what is enabled, only what is
 * not already cached, and never the module already on screen — that one is
 * loading for real.
 */
export function usePrefetchModules(current: BusinessModuleKey | null) {
  const client = useQueryClient();
  const access = useQuery({
    queryKey: ["business-modules", "access"],
    queryFn: () => getBusinessModuleAccess(),
    staleTime: 60_000,
  });
  const enabled = access.data;

  useEffect(() => {
    if (!enabled) return;
    return whenIdle(() => {
      for (const module of enabled) {
        if (!module.enabled || module.key === current) continue;
        const target = PREFETCHABLE[module.key];
        if (!target) continue;
        void client.prefetchQuery({
          queryKey: target.key,
          queryFn: target.load,
          // Anything already fetched this session is left alone.
          staleTime: 5 * 60 * 1000,
        });
      }
    });
  }, [client, current, enabled]);
}
