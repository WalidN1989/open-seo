import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { resetOrganizationScopedQueries } from "./organization-scoped-queries";

function clientWith(entries: [readonly unknown[], unknown][]) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  for (const [key, value] of entries) queryClient.setQueryData(key, value);
  return queryClient;
}

describe("discarding the previous client's cached answers", () => {
  it("drops business-module data, which is keyed by module and not by project", async () => {
    const queryClient = clientWith([
      [["integrations", "workspace"], { connections: ["shopify"] }],
      [["commerce", "products", "", "all", 0], { total: 2999 }],
      [["whatsapp", "workspace"], { conversations: 1 }],
      [["voice", "workspace"], { messages: 11 }],
      [["crm", "workspace"], { contacts: 1 }],
      [["business-modules", "crm", "access"], { permission: "admin" }],
    ]);

    await resetOrganizationScopedQueries(queryClient);

    for (const key of [
      ["integrations", "workspace"],
      ["commerce", "products", "", "all", 0],
      ["whatsapp", "workspace"],
      ["voice", "workspace"],
      ["crm", "workspace"],
      ["business-modules", "crm", "access"],
    ]) {
      expect(queryClient.getQueryData(key)).toBeUndefined();
    }
  });

  // Clearing these is what left the dashboard on skeletons until the page was
  // navigated away from and back: their observers were still mounted, and an
  // observer whose query has been removed has nothing to refetch.
  it("leaves project-keyed SEO data alone", async () => {
    const queryClient = clientWith([
      [["dashboardOverview", "project_a"], { clicks: 6081 }],
      [["dashboardActivation", "project_a"], { steps: 4 }],
      [["dashboardGscReport", "project_a"], { impressions: 244289 }],
      [["projects"], [{ id: "project_a" }]],
      [["integrations", "workspace"], { connections: ["shopify"] }],
    ]);

    await resetOrganizationScopedQueries(queryClient);

    expect(
      queryClient.getQueryData(["dashboardOverview", "project_a"]),
    ).toEqual({ clicks: 6081 });
    expect(
      queryClient.getQueryData(["dashboardActivation", "project_a"]),
    ).toEqual({ steps: 4 });
    expect(
      queryClient.getQueryData(["dashboardGscReport", "project_a"]),
    ).toEqual({ impressions: 244289 });
    // The switcher reads this one; emptying it would blank the switcher during
    // the switch that triggered the reset.
    expect(queryClient.getQueryData(["projects"])).toEqual([
      { id: "project_a" },
    ]);
    // ...while the organization-scoped neighbour still goes.
    expect(
      queryClient.getQueryData(["integrations", "workspace"]),
    ).toBeUndefined();
  });
});

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { ORGANIZATION_SCOPED_QUERY_ROOTS } from "./organization-scoped-queries";

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(path) && !path.endsWith(".test.ts") ? [path] : [];
  });
}

/**
 * Every business-module query root must be on the reset list.
 *
 * A module whose root is missing keeps the previous workspace's answer across
 * a switch. When that answer is "nothing here", the module looks empty until
 * something happens to invalidate it — which is how nine reports were
 * invisible until a tenth was generated. Read from the source so the next
 * module cannot forget.
 */
describe("every business module resets on a workspace switch", () => {
  const dir = join(
    process.cwd(),
    "src",
    "client",
    "features",
    "business-modules",
  );
  const roots = new Set<string>();
  for (const file of sourceFiles(dir)) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/queryKey: \["([a-z-]+)"/g)) {
      if (match[1]) roots.add(match[1]);
    }
  }

  it("finds the roots the modules use", () => {
    expect(roots.size).toBeGreaterThan(5);
  });

  it.each([...roots])("%s is on the reset list", (root) => {
    expect(
      (ORGANIZATION_SCOPED_QUERY_ROOTS as readonly string[]).includes(root),
      `"${root}" is keyed by module, not project, and will keep the previous workspace's data across a switch`,
    ).toBe(true);
  });
});
