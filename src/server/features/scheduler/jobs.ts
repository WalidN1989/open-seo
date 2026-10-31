import { WhatsappHandoffService } from "@/server/features/communications/services/WhatsappHandoffService";
import { OrderShipmentService } from "@/server/features/commerce/services/OrderShipmentService";
import { OrderOperationsService } from "@/server/features/commerce/services/OrderOperationsService";
import { withPgClient } from "@/db";
import { registerCronJob } from "./registry";
import { reconcileStaleAudits } from "@/server/features/audit/services/auditReconciler";
import { runScheduledRankChecks } from "@/server/features/rank-tracking/services/scheduledRankChecks";
import { CommunicationsService } from "@/server/features/communications/services/CommunicationsService";
import { CatalogueSyncService } from "@/server/features/commerce/services/CatalogueSyncService";
import { runDueVoiceLearning } from "@/server/features/communications/services/VoiceLearningService";
import { syncMicrosoftMailboxes } from "@/server/features/email/services/MicrosoftMailSyncService";
import { QuoteChaserService } from "@/server/features/quotes/services/QuoteChaserService";
import { ClientLifecycleService } from "@/server/features/team/services/ClientLifecycleService";
import { runDueWhatsappReplies } from "@/server/features/communications/services/WhatsappReplyJobService";

let registered = false;

/**
 * Register jobs available to an explicitly invoked tier. Registration alone
 * does not schedule them (see CRON_TIER_INTERVAL_MS).
 *
 * The two SEO jobs were previously reachable only through Cloudflare's
 * `scheduled` handler. Container deployments do not invoke that handler;
 * they need an explicit trigger. Do not re-enable disabled legacy pollers.
 *
 * Idempotent: the handler calls it on every request and the registry rejects
 * duplicate names.
 */
export function registerBusinessCronJobs() {
  if (registered) return;
  registered = true;
  registerCronJob({
    name: "commerce.citypakTracking",
    tier: "standard",
    run: async () => {
      await withPgClient(() => OrderShipmentService.runDueTracking());
    },
  });
  registerCronJob({
    name: "commerce.orderOperations",
    tier: "fast",
    run: async () => {
      await withPgClient(() => OrderOperationsService.runDue());
    },
  });

  registerCronJob({
    name: "whatsapp.replyAfterBurst",
    tier: "fast",
    run: async () => {
      await withPgClient(async () => {
        await runDueWhatsappReplies();
        await WhatsappHandoffService.runDue();
      });
    },
  });

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
    name: "email.microsoftSync",
    tier: "standard",
    run: async () => {
      await withPgClient(() => syncMicrosoftMailboxes());
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
    name: "quotes.followUpUnanswered",
    tier: "standard",
    run: async () => {
      await withPgClient(() => QuoteChaserService.runDueFollowUps());
    },
  });

  registerCronJob({
    name: "team.nudgeQuietLogins",
    tier: "slow",
    run: async () => {
      await withPgClient(() => ClientLifecycleService.runDueNudges());
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
