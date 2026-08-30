/**
 * Derivations the leads table reads from. Health, due tone and activity
 * recency are computed from the row every time it is rendered rather than
 * stored: a lead does not become stale because someone edited it, it becomes
 * stale because nobody touched it, and only the clock knows that.
 */

export const LEAD_HEALTHS = ["hot", "active", "warm", "cold"] as const;
export type LeadHealth = (typeof LEAD_HEALTHS)[number];

export const LEAD_PRIORITIES = ["urgent", "high", "medium", "low"] as const;
export type LeadPriority = (typeof LEAD_PRIORITIES)[number];

export const HEALTH_META: Record<
  LeadHealth,
  { label: string; className: string; order: number }
> = {
  hot: { label: "Hot", className: "text-warning", order: 0 },
  active: { label: "Active", className: "text-success", order: 1 },
  warm: { label: "Warm", className: "text-info", order: 2 },
  cold: { label: "Cold", className: "text-base-content/40", order: 3 },
};

export const PRIORITY_META: Record<
  LeadPriority,
  { label: string; className: string; order: number }
> = {
  urgent: { label: "Urgent", className: "badge-error", order: 0 },
  high: { label: "High", className: "badge-warning", order: 1 },
  medium: { label: "Medium", className: "badge-ghost", order: 2 },
  low: { label: "Low", className: "badge-ghost", order: 3 },
};

type LeadHealthInput = {
  status: string;
  leadScore?: number | null;
  lastActivityAt?: string | null;
  updatedAt?: string | null;
  createdAt?: string | null;
};

function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const parsed = new Date(iso).getTime();
  if (Number.isNaN(parsed)) return null;
  return Math.floor((Date.now() - parsed) / 86_400_000);
}

export function computeHealth(lead: LeadHealthInput): LeadHealth {
  if (lead.status === "lost" || lead.status === "dead") return "cold";
  const silent = daysSince(
    lead.lastActivityAt ?? lead.updatedAt ?? lead.createdAt,
  );
  if (lead.status === "won") return "active";
  if (silent === null) return "warm";
  if (lead.status === "hot" && silent <= 7) return "hot";
  if ((lead.leadScore ?? 0) >= 70 && silent <= 7) return "hot";
  if (silent <= 3) return "active";
  if (silent <= 10) return "warm";
  return "cold";
}

/** "3d", "5w", "just now" — a column is too narrow for a date. */
export function timeAgo(iso: string | null | undefined): string {
  const days = daysSince(iso);
  if (days === null) return "—";
  if (days <= 0) return "today";
  if (days === 1) return "1d";
  if (days < 7) return `${days}d`;
  if (days < 31) return `${Math.floor(days / 7)}w`;
  if (days < 365) return `${Math.floor(days / 30)}mo`;
  return `${Math.floor(days / 365)}y`;
}

type DueInfo = { label: string; tone: "overdue" | "soon" | "later" };

export function dueInfo(iso: string | null | undefined): DueInfo | null {
  if (!iso) return null;
  const parsed = new Date(iso).getTime();
  if (Number.isNaN(parsed)) return null;
  const days = Math.ceil((parsed - Date.now()) / 86_400_000);
  if (days < 0) return { label: `${Math.abs(days)}d late`, tone: "overdue" };
  if (days === 0) return { label: "today", tone: "soon" };
  if (days === 1) return { label: "tomorrow", tone: "soon" };
  if (days <= 7) return { label: `${days}d`, tone: "soon" };
  return { label: `${days}d`, tone: "later" };
}

export const DUE_TONE_CLASS: Record<DueInfo["tone"], string> = {
  overdue: "text-error font-medium",
  soon: "text-warning",
  later: "text-base-content/60",
};

/** Money is stored in integer minor units, so never divide before display. */
export function formatMinorUnits(minor: number | null | undefined): string {
  if (!minor) return "—";
  const major = minor / 100;
  // Abbreviate only once the rounding is small relative to the number. At
  // 1,500 a "2k" is a 33% lie about the value of a deal, which is worse than
  // a slightly wider column.
  return major >= 10_000
    ? `${Math.round(major / 1000)}k`
    : major.toLocaleString(undefined, { maximumFractionDigits: 0 });
}
