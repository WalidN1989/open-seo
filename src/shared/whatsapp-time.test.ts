import { expect, it } from "vitest";
import {
  formatWhatsappTimestamp,
  parseWhatsappTimestamp,
} from "./whatsapp-time";

it("treats SQLite timestamps as UTC, matching the Postgres ISO representation", () => {
  expect(parseWhatsappTimestamp("2026-10-21 18:30:00")).toBe(
    Date.UTC(2026, 9, 21, 18, 30),
  );
  expect(parseWhatsappTimestamp("2026-10-21 18:30:00.125")).toBe(
    parseWhatsappTimestamp("2026-10-21T18:30:00.125Z"),
  );
});

it("shows a calendar date together with the time and handles missing timestamps", () => {
  const label = formatWhatsappTimestamp("2026-10-21T12:34:00Z");
  expect(label).toContain("2026");
  expect(label).toContain("21");
  expect(label).toContain(":34");
  expect(formatWhatsappTimestamp(null)).toBe("");
  expect(formatWhatsappTimestamp("invalid")).toBe("");
  expect(parseWhatsappTimestamp("1970-01-01T00:00:00Z")).toBe(0);
});
