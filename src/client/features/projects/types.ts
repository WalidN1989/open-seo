// The project's default market: the country/language pair its data calls
// fall back to. Mirrors resolveMarket's project argument in shared/.
export type ProjectMarket = { locationCode: number; languageCode: string };

// Shape returned by the getProjects server function (a mapped project row).
export type ProjectSummary = {
  id: string;
  name: string;
  domain: string | null;
  // The readable address segment (/p/booxworm); null on projects created
  // before slugs. projectAddress() falls back to the id.
  slug?: string | null;
  // Default market for the project's data calls.
  locationCode: number;
  languageCode: string;
  createdAt: string;
  // True for the project whose organization the session is on. Only the list
  // endpoint sets it; single-project returns (create, update) do not.
  isActive?: boolean;
};
