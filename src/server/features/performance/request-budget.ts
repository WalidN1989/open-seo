import { AppError } from "@/server/lib/errors";

// A small per-process guard against accidental repeats. This is not a global
// billing cap: separate workers/restarts have separate windows.
const windows = new Map<string, { until: number; used: number }>();
export function claimJevRequest(userId: string, now = Date.now()) {
  for (const [id, window] of windows)
    if (window.until <= now) windows.delete(id);
  const window = windows.get(userId);
  if ((window?.used ?? 0) >= 6 || (!window && windows.size >= 1000))
    throw new AppError(
      "RATE_LIMITED",
      "Please wait a minute before asking Jev again.",
    );
  windows.set(userId, {
    until: window?.until ?? now + 60_000,
    used: (window?.used ?? 0) + 1,
  });
}
