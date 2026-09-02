import { withPgClient } from "@/db";
import { registerCronJob } from "./registry";
import { reconcileStaleAudits } from "@/server/features/audit/services/auditReconciler";
import { runScheduledRankChecks } from "@/server/features/rank-tracking/services/scheduledRankChecks";
import { CommunicationsService } from "@/server/features/communications/services/CommunicationsService";
import { CatalogueSyncService } from "@/server/features/commerce/services/CatalogueSyncService";
import { runDueVoiceLearning } from "@/server/features/communications/services/VoiceLearningService";

let registered = false;

/**
 * Adding a job here is the only thing needed to make it run; the tier decides
 * how often (see CRON_TIER_INTERVAL_MS).
 *
 * The two SEO jobs were previously reachable only through Cloudflare's
 * `scheduled` handler. On Railway that handler is never invoked, so neither
 * had ever run in this deployment.
 *
 * Idempotent: the handler calls it on every request and the registry rejects
 * duplicate names.
 */
export function registerBusinessCronJobs() {
  if (registered) return;
  registered = true;

  registerCronJob({
    name: "audit.reconcileStale",
    tier: "slow",
    run: async () => {
      await withPgClient(() => reconcileStaleAudits());
    },
  });

  registerCronJob({
    name: "rankTracking.scheduledChecks",
    tier: "slow",
    run: async (env) => {
      await withPgClient(() => runScheduledRankChecks(env));
    },
  });

  registerCronJob({
    name: "commerce.catalogueSync",
    tier: "standard",
    run: async () => {
      await withPgClient(() => CatalogueSyncService.runDueSyncs());
    },
  });

  registerCronJob({
    name: "voice.learnFromConversations",
    tier: "slow",
    run: async () => {
      await withPgClient(() => runDueVoiceLearning());
    },
  });

  registerCronJob({
    name: "webhooks.retryDue",
    tier: "standard",
    run: async () => {
      await withPgClient(() =>
        CommunicationsService.retryDueWebhookDeliveries(),
      );
    },
  });
}
