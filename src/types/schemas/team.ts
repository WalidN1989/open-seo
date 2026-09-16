import { z } from "zod";

export const createClientLoginSchema = z.object({
  email: z.string().trim().email().max(200),
  name: z.string().trim().max(120).nullish(),
  role: z.enum(["member", "admin", "owner"]).default("member"),
  /**
   * Start them on sample data. A workspace created today holds nothing, and a
   * tour of empty screens tells a new client nothing about what they bought.
   */
  demoData: z.boolean().default(false),
});

export const setClientDemoDataSchema = z.object({
  userId: z.string().min(1),
  demoData: z.boolean(),
});
