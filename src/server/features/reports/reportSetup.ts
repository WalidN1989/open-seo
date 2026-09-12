import { SERVICE_CATALOGUE, type ReportSnapshot } from "./reportSnapshot";

/**
 * The "what we have set up for you" checklist.
 *
 * Half of it is read from the database and half is declared by the person
 * generating the report, because a tag on the client's site or a listing on
 * Google Maps leaves no row anywhere we can see.
 */

/** A social profile: shown when there is an address, marked ours or theirs. */
function social(
  label: string,
  url: string | null,
  managed: boolean,
): ReportSnapshot["setup"][number] {
  return {
    label,
    done: Boolean(url),
    detail: url
      ? managed
        ? "We manage this for you"
        : "Yours, not managed by us"
      : "No profile recorded",
    url,
    managed: url ? managed : null,
  };
}

function keywordDetail(researched: number, saved: number) {
  if (!researched && !saved) return "Not started yet";
  if (saved && researched > saved) {
    return `${researched} keywords researched, ${saved} shortlisted`;
  }
  if (saved) return `${saved} keywords researched and shortlisted`;
  return `${researched} keywords researched`;
}

export type Declared = {
  sitemap: boolean;
  tagManager: boolean;
  googleBusinessProfile: boolean;
  googleReviews: boolean;
  emailMarketing: boolean;
  facebookUrl: string | null;
  facebookManaged: boolean;
  instagramUrl: string | null;
  instagramManaged: boolean;
};

export function setupFor(input: {
  searchConsole: string | null;
  analytics: boolean;
  savedKeywords: number;
  researchedKeywords: number;
  trackedKeywords: number;
  hasAudit: boolean;
  competitors: number;
  /**
   * Things the database cannot see — a tag on their site, a listing on Google
   * Maps, a Facebook page — so the person generating the report says.
   */
  declared: Declared;
}): ReportSnapshot["setup"] {
  const { declared } = input;
  return [
    {
      label: "Google Search Console",
      done: Boolean(input.searchConsole),
      detail: input.searchConsole
        ? `Connected for ${input.searchConsole}`
        : "Not connected yet",
    },
    {
      label: "Google Analytics",
      done: input.analytics,
      detail: input.analytics ? "Connected" : "Not connected yet",
    },
    {
      label: "Keyword research",
      done: input.researchedKeywords > 0 || input.savedKeywords > 0,
      detail: keywordDetail(input.researchedKeywords, input.savedKeywords),
    },
    {
      label: "Rank tracking",
      done: input.trackedKeywords > 0,
      detail: input.trackedKeywords
        ? `${input.trackedKeywords} keywords checked on a schedule`
        : "Not started yet",
    },
    {
      label: "Technical site audit",
      done: input.hasAudit,
      detail: input.hasAudit ? "Completed" : "Not run yet",
    },
    {
      label: "Competitor analysis",
      done: input.competitors > 0,
      detail: input.competitors
        ? `${input.competitors} competitors identified`
        : "Not started yet",
    },
    {
      label: "XML sitemap",
      done: declared.sitemap,
      detail: declared.sitemap ? "Submitted to Google" : "Not submitted yet",
    },
    {
      label: "Google Tag Manager",
      done: declared.tagManager,
      detail: declared.tagManager ? "Installed" : "Not installed yet",
    },
    {
      label: "Google Business Profile",
      done: declared.googleBusinessProfile,
      detail: declared.googleBusinessProfile
        ? "Claimed and verified"
        : "Not set up yet",
    },
    {
      label: "Google reviews",
      done: declared.googleReviews,
      detail: declared.googleReviews
        ? "Review collection is running"
        : "Not started yet",
    },
    social("Facebook", declared.facebookUrl, declared.facebookManaged),
    social("Instagram", declared.instagramUrl, declared.instagramManaged),
    {
      label: "Email marketing",
      done: declared.emailMarketing,
      detail: declared.emailMarketing ? "Running" : "Not started yet",
    },
  ];
}

/**
 * What the client can sign in to, and where.
 *
 * The password is deliberately not here and must never be. This document is
 * handed over as a link anyone holding it can open, and it is saved, forwarded
 * and printed. A credential belongs in a separate message the client can act
 * on and delete, not in a report that outlives it.
 */
export function accessFor(
  projectId: string,
  appUrl: string,
  loginEmail: string | null,
) {
  return {
    url: `${appUrl.replace(/\/+$/, "")}/p/${projectId}`,
    loginEmail,
  };
}

/** A tick means it is actually running for them, not that it is on offer. */
export function includedFor(active: Record<string, boolean>) {
  return SERVICE_CATALOGUE.map((service) => ({
    label: service.label,
    detail: service.detail,
    active: active[service.key] ?? false,
  }));
}
