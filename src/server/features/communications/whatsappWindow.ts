import { z } from "zod";

const instant = z.iso.datetime({ offset: true });
const DAY = 86_400_000;

/** Database text timestamps without an offset are SQLite UTC, never host-local time. */
export function evaluateWhatsappWindow(
  lastInboundAt: string | null,
  now = new Date(),
) {
  const evaluatedAt = now.toISOString();
  const closed = (
    reason: "no_inbound" | "invalid_inbound" | "future_inbound",
  ) => ({
    lastInboundAt,
    expiresAt: null,
    evaluatedAt,
    windowOpen: false,
    reason,
  });
  if (!lastInboundAt) return closed("no_inbound");
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$/.test(
    lastInboundAt,
  )
    ? lastInboundAt.replace(" ", "T") + "Z"
    : lastInboundAt;
  if (!instant.safeParse(normalized).success) return closed("invalid_inbound");
  const at = Date.parse(normalized);
  if (!Number.isFinite(at)) return closed("invalid_inbound");
  if (at > now.getTime()) return closed("future_inbound");
  const expiresAt = new Date(at + DAY).toISOString();
  const windowOpen = now.getTime() < at + DAY;
  return {
    lastInboundAt: new Date(at).toISOString(),
    expiresAt,
    evaluatedAt,
    windowOpen,
    reason: windowOpen ? ("open" as const) : ("expired" as const),
  };
}
