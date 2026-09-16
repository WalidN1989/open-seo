import { z } from "zod";

export const createClientLoginSchema = z.object({
  email: z.string().trim().email().max(200),
  name: z.string().trim().max(120).nullish(),
  role: z.enum(["member", "admin", "owner"]).default("member"),
});
