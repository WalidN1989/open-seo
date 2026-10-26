type Counts = { status: string; count: number }[];
export function deliveryCounts(rows: Counts) {
  const counts: Record<string, number> = {};
  for (const row of rows)
    counts[row.status] = (counts[row.status] ?? 0) + Number(row.count);
  return counts;
}
export function statusTone(status: string): "red" | "amber" | "green" {
  if (/fail|bounce|reject|unknown|stale|unavailable/i.test(status))
    return "red";
  if (/delivered|read|completed/i.test(status)) return "green";
  return "amber";
}
export function callTotals(
  rows: { direction: string | null; outcome: string | null; count: number }[],
) {
  let total = 0,
    inbound = 0,
    outbound = 0;
  for (const row of rows) {
    const count = Number(row.count);
    total += count;
    if (row.direction === "inbound") inbound += count;
    if (row.direction === "outbound") outbound += count;
  }
  // A successful conversation is not proof that all ringing calls were answered.
  return {
    total,
    inbound,
    outbound,
    unknownDirection: total - inbound - outbound,
    answered: null,
    missed: null,
    coverage:
      "Stored calls only. Provider ringing/answer events are not yet mirrored, so answered and missed totals are unknown.",
  };
}
