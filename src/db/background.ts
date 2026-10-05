import { waitUntil as runtimeWaitUntil } from "cloudflare:workers";
import { trackPgBackgroundTask } from "./pg/client";

/** Register background I/O without closing its request's database too early. */
export function waitUntil(task: Promise<unknown>): void {
  trackPgBackgroundTask(task);
  runtimeWaitUntil(task);
}
