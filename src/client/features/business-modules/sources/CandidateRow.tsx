import { Check, ExternalLink, X } from "lucide-react";

export type Candidate = {
  id: string;
  companyName: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  category: string | null;
  country: string | null;
  rating: number | null;
  reviewCount: number | null;
  evidenceScore: number;
  status: string;
  leadId: string | null;
};

function evidenceTone(score: number): string {
  if (score >= 70) return "text-success";
  if (score >= 40) return "text-warning";
  return "text-base-content/40";
}

export function CandidateRow({
  candidate,
  busy,
  onPromote,
  onReject,
}: {
  candidate: Candidate;
  busy: boolean;
  onPromote: () => void;
  onReject: () => void;
}) {
  const decided =
    candidate.status === "promoted" || candidate.status === "rejected";

  return (
    <tr className="hover">
      <td>
        <span className="font-medium">{candidate.companyName}</span>
        {candidate.country ? (
          <span className="ml-2 text-xs text-base-content/40">
            {candidate.country}
          </span>
        ) : null}
      </td>
      <td className="text-xs">
        {candidate.contactName ?? (
          <span className="text-base-content/25">—</span>
        )}
        {candidate.email || candidate.phone ? (
          <div className="text-base-content/50">
            {candidate.email ?? candidate.phone}
          </div>
        ) : null}
      </td>
      <td className="text-xs">
        {candidate.category ?? <span className="text-base-content/25">—</span>}
      </td>
      <td className="text-xs">
        {candidate.website ? (
          <a
            href={
              candidate.website.startsWith("http")
                ? candidate.website
                : `https://${candidate.website}`
            }
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            {candidate.website.replace(/^https?:\/\/(www\.)?/, "").slice(0, 24)}
            <ExternalLink className="size-3" />
          </a>
        ) : (
          <span className="text-base-content/25">—</span>
        )}
      </td>
      <td className="text-xs">
        {candidate.rating != null ? (
          <>
            {candidate.rating}★
            <span className="ml-1 text-base-content/40">
              ({candidate.reviewCount ?? 0})
            </span>
          </>
        ) : (
          <span className="text-base-content/25">—</span>
        )}
      </td>
      <td
        className={`text-right tabular-nums ${evidenceTone(candidate.evidenceScore)}`}
        title="How reachable this record is: contact details count for most."
      >
        {candidate.evidenceScore}
      </td>
      <td className="text-right">
        {decided ? (
          <span className="badge badge-ghost badge-sm">{candidate.status}</span>
        ) : (
          <div className="join">
            <button
              className="btn btn-primary btn-xs join-item"
              disabled={busy}
              onClick={onPromote}
            >
              <Check className="size-3" /> Add to leads
            </button>
            <button
              className="btn btn-ghost btn-xs join-item"
              disabled={busy}
              onClick={onReject}
              title="Dismiss"
            >
              <X className="size-3" />
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}
