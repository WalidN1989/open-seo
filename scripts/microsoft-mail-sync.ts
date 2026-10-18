import { z } from "zod";
import {
  MAIL_BRIDGE_INTERNAL_PREFIX,
  MAIL_BRIDGE_SECRET_HEADER,
} from "../src/shared/mail-bridge";

/** Opt-in VPS mailbox sync, independent of every paused background-job tier. */
export function startMicrosoftMailSync() {
  const raw = process.env.MICROSOFT_MAIL_SYNC_ACCOUNT_IDS;
  if (!raw?.trim()) return () => {};
  const parsed = z
    .array(z.uuid())
    .min(1)
    .safeParse([...new Set(raw.split(",").map((id) => id.trim()))]);
  if (!parsed.success) {
    console.error(
      "[microsoft-mail-sync] Invalid account configuration; Microsoft sync stays disabled",
    );
    return () => {};
  }
  const accounts = parsed.data;
  const secret = process.env.INTERNAL_CRON_SECRET;
  if (!secret)
    throw new Error("Microsoft mail sync requires INTERNAL_CRON_SECRET");
  const base =
    process.env.INTERNAL_CRON_URL ??
    `http://127.0.0.1:${process.env.PORT ?? "3001"}`;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  async function tick() {
    for (const accountId of accounts) {
      if (stopped) return;
      try {
        const response = await fetch(
          `${base}${MAIL_BRIDGE_INTERNAL_PREFIX}microsoft-sync`,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              [MAIL_BRIDGE_SECRET_HEADER]: secret!,
            },
            body: JSON.stringify({ accountId }),
            signal: AbortSignal.timeout(300_000),
          },
        );
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        await response.json();
        console.log("[microsoft-mail-sync] Mailbox sync completed");
      } catch (error) {
        console.error(
          "[microsoft-mail-sync] Sync failed; retrying in one minute",
          error instanceof Error ? error.message : "Unknown error",
        );
      }
    }
    if (!stopped) timer = setTimeout(() => void tick(), 60_000);
  }
  console.log(
    `[microsoft-mail-sync] Enabled for ${accounts.length} mailbox(es); other background jobs remain paused`,
  );
  void tick();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
