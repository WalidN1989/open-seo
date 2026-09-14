import type { PhoneCallReport } from "./elevenlabsWebhook";

/** How a call reads on the lead and in the welcome message. */

export function duration(seconds: number | null) {
  if (!seconds) return "";
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return minutes ? ` (${minutes}m ${rest}s)` : ` (${rest}s)`;
}

export function splitName(raw: string | undefined) {
  const cleaned = (raw ?? "").trim().replace(/\s+/g, " ");
  if (!cleaned) return { firstName: "Caller", lastName: null };
  const [first, ...rest] = cleaned.split(" ");
  return { firstName: first ?? "Caller", lastName: rest.join(" ") || null };
}

function label(key: string) {
  return key
    .replace(/^caller_/, "")
    .replace(/_/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase());
}

/** The activity note a person reads on the lead. */
export function activityNotes(report: PhoneCallReport) {
  const lines: string[] = [];
  if (report.summary) lines.push(report.summary, "");
  const captured = Object.entries(report.captured);
  if (captured.length) {
    lines.push("Captured on the call:");
    for (const [key, value] of captured)
      lines.push(`- ${label(key)}: ${value}`);
    lines.push("");
  }
  if (report.callerNumber)
    lines.push(`Caller number: ${report.callerNumber}`, "");
  if (report.transcript.length) {
    lines.push("Transcript:");
    for (const turn of report.transcript) {
      lines.push(
        `${turn.role === "agent" ? "Agent" : "Caller"}: ${turn.message}`,
      );
    }
  }
  return lines.join("\n").slice(0, 20_000);
}

/** "Website design" reads as "website design" mid-sentence; "SEO" stays. */
export function inSentence(phrase: string) {
  return /^[A-Z][a-z]/.test(phrase)
    ? phrase[0].toLowerCase() + phrase.slice(1)
    : phrase;
}
