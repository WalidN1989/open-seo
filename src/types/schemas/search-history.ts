import { z } from "zod";

export const searchHistoryModules = [
  "keywords",
  "domain",
  "backlinks",
  "brand_lookup",
  "prompt_explorer",
] as const;

const base = z.object({
  projectId: z.string().min(1),
  module: z.enum(searchHistoryModules),
});

export const listSearchHistorySchema = base;

export const addSearchHistorySchema = base.extend({
  itemKey: z.string().min(1).max(400),
  /** The entry exactly as its module's UI holds it. */
  item: z.unknown(),
});

export const removeSearchHistorySchema = base.extend({
  itemKey: z.string().min(1).max(400),
});
