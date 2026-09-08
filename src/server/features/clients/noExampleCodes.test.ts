import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Nothing the assistant can say may contain something shaped like an access
 * code.
 *
 * This exists because it already happened: a real client's code was pasted
 * into the prompt as an "example format", and the assistant then read it out
 * to anyone who asked what a code looked like. Any literal that reads like a
 * code is a code somebody holds.
 */
const CODE_SHAPE =
  /\b[23456789ABCDEFGHJKMNPQRSTVWXYZ]{4}[-–—\s][23456789ABCDEFGHJKMNPQRSTVWXYZ]{4}\b/;

const SPEAKS_TO_CUSTOMERS = [
  "src/server/features/communications/services/WhatsappAssistantReplyService.ts",
  "src/server/features/communications/providers/whatsapp-ai.ts",
];

describe("what the assistant can say", () => {
  it.each(SPEAKS_TO_CUSTOMERS)("%s contains no example code", (file) => {
    const source = readFileSync(join(process.cwd(), file), "utf8");
    // Only string literals matter; prose in comments is checked too, since a
    // comment is where the last one came from.
    const match = CODE_SHAPE.exec(source);
    expect(
      match?.[0] ?? null,
      match ? `"${match[0]}" reads like a real access code` : "",
    ).toBeNull();
  });
});
