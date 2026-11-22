import type { RankTrackingDeviceResult } from "@/types/schemas/rank-tracking";

export function hasCurrentRankObservation(
  result: RankTrackingDeviceResult,
): boolean {
  return (
    result.checkState === "checked" ||
    (result.checkState == null && result.checkedAt != null)
  );
}

export function rankCheckStateLabel(result: RankTrackingDeviceResult): string {
  switch (result.checkState) {
    case "checked":
      return "Checked";
    case "not_checked":
      return "Not checked";
    case "not_requested":
      return "Not requested";
    case "checking":
      return "Checking";
    case "unknown":
      return "Unknown coverage";
    default:
      return result.checkedAt != null ? "Checked" : "Unknown";
  }
}
