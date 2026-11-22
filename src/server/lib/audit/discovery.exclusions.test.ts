import { expect, it } from "vitest";
import { parseRobotsTxt } from "./discovery";
it("combines excluded paths with robots restrictions even when robots is absent", () => {
  const withRobots = parseRobotsTxt(
    "https://example.com",
    "User-agent: *\nDisallow: /private/",
    ["/tags/"],
  );
  expect(withRobots.isAllowed("https://example.com/tags/book")).toBe(false);
  expect(withRobots.isAllowed("https://example.com/private/book")).toBe(false);
  expect(withRobots.isAllowed("https://example.com/books")).toBe(true);
  expect(
    parseRobotsTxt("https://example.com", null, ["/tags/"]).isAllowed(
      "https://example.com/tags/book",
    ),
  ).toBe(false);
});
