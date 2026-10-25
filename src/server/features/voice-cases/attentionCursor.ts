import { z } from "zod";
import { AppError } from "@/server/lib/errors";

const cursorSchema = z.object({
  v: z.literal(1),
  org: z.string(),
  modules: z.string(),
  since: z.string().nullable(),
  revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  until: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable(),
  initial: z.boolean(),
});
type AttentionCursor = z.infer<typeof cursorSchema>;
export function encodeAttentionCursor(value: AttentionCursor) {
  return btoa(JSON.stringify(value));
}
export function decodeAttentionCursor(
  token: string,
  org: string,
  modules: string,
  since?: string,
): AttentionCursor {
  try {
    const value: unknown = JSON.parse(atob(token));
    const cursor = cursorSchema.parse(value);
    if (
      cursor.org !== org ||
      cursor.modules !== modules ||
      (since !== undefined && cursor.since !== since)
    )
      throw new Error("scope");
    return cursor;
  } catch {
    throw new AppError(
      "VALIDATION_ERROR",
      "Invalid cursor or changed workspace, access or since filter. Start a fresh check without a cursor.",
    );
  }
}
export function shortAttentionText(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
}
export function reportedBoolean(value: unknown): "yes" | "no" | "unknown" {
  if (value === true || value === "true" || value === "yes") return "yes";
  if (value === false || value === "false" || value === "no") return "no";
  return "unknown";
}
