/**
 * The stretch of time in which research requests from a page must be served
 * from cache or not at all: from the moment a page starts opening the latest
 * saved result by itself until the person first does something.
 *
 * It is tied to the page's path, so leaving the page ends it, and to the
 * person's first press, click or key — captured before the page's own
 * handlers run — so anything they ask for themselves is a normal request.
 * Browser back and forward end it too, and it lapses after a minute: long
 * enough for the first screen to load, short enough that a tab left open
 * does not keep refusing requests.
 */

const LIFETIME_MS = 60_000;

let openFor: string | null = null;
let lapse: ReturnType<typeof setTimeout> | undefined;

function close() {
  openFor = null;
  clearTimeout(lapse);
  window.removeEventListener("pointerdown", close, true);
  window.removeEventListener("keydown", close, true);
  window.removeEventListener("popstate", close, true);
}

export function openCacheOnlyWindow() {
  close();
  openFor = window.location.pathname;
  lapse = setTimeout(close, LIFETIME_MS);
  window.addEventListener("pointerdown", close, true);
  window.addEventListener("keydown", close, true);
  window.addEventListener("popstate", close, true);
}

export const closeCacheOnlyWindow = close;

export function isCacheOnlyWindowOpen() {
  return (
    typeof window !== "undefined" &&
    openFor !== null &&
    openFor === window.location.pathname
  );
}
