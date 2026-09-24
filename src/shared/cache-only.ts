/**
 * Sent with a research request that must be answered from cache or not at
 * all. A page that opens the latest saved result on its own sends it, so an
 * automatic view can never buy data: only something a person does can.
 */
export const CACHE_ONLY_HEADER = "x-openseo-cache-only";
