import { AppError } from "@/server/lib/errors";

// Used by both Live and queued rank checks, after required fields are validated.
export function assertReliableRankUrl(rawUrl: string, domain: string): void {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new AppError(
      "INTERNAL_ERROR",
      "DataForSEO returned an invalid organic URL",
    );
  }
  if (!["https:", "http:"].includes(url.protocol)) {
    throw new AppError(
      "INTERNAL_ERROR",
      "DataForSEO returned an unsupported organic URL scheme",
    );
  }
  if (
    url.pathname === "/goto" &&
    /^(www\.)?google\.[a-z.]+$/.test(url.hostname)
  ) {
    throw new AppError(
      "INTERNAL_ERROR",
      "DataForSEO returned an unresolved Google redirect",
    );
  }
  if (
    url.hostname.toLowerCase().replace(/^www\./, "") !==
    domain.toLowerCase().replace(/^www\./, "")
  ) {
    throw new AppError(
      "INTERNAL_ERROR",
      "DataForSEO returned conflicting organic URL and domain values",
    );
  }
}
