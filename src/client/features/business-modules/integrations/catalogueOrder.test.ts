import { describe, expect, it } from "vitest";
import { integrationCatalogue } from "@/shared/integration-catalogue";
import { orderCatalogue } from "./catalogueOrder";

const keysOf = (connected: string[]) =>
  orderCatalogue(integrationCatalogue, new Set(connected)).map(
    (entry) => entry.key,
  );

describe("orderCatalogue", () => {
  it("puts what BooXworm has connected in the first tiles", () => {
    const keys = keysOf(["shopify", "claude_haiku"]);
    expect(keys.slice(0, 2).toSorted()).toEqual(["claude_haiku", "shopify"]);
  });

  it("puts Period.lk's single connection first", () => {
    expect(keysOf(["claude_haiku"])[0]).toBe("claude_haiku");
  });

  it("orders the rest: available, then built in, then coming soon", () => {
    const ordered = orderCatalogue(integrationCatalogue, new Set(["shopify"]));
    const rank = (key: string) => ordered.findIndex((e) => e.key === key);
    expect(rank("shopify")).toBe(0);
    // Webhooks is built in, so it sits after everything connectable.
    expect(rank("firecrawl")).toBeLessThan(rank("webhooks"));
    // Anything not available yet is last.
    expect(rank("webhooks")).toBeLessThan(rank("stripe"));
    expect(rank("custom")).toBeLessThan(rank("instagram"));
  });

  it("runs colour around the wheel within a group", () => {
    const ordered = orderCatalogue(integrationCatalogue, new Set());
    const rank = (key: string) => ordered.findIndex((e) => e.key === key);
    // Warm marks before cool ones, and a monochrome mark last of its group.
    expect(rank("claude_haiku")).toBeLessThan(rank("shopify"));
    expect(rank("shopify")).toBeLessThan(rank("make"));
    expect(rank("make")).toBeLessThan(rank("custom"));
  });

  it("keeps every entry exactly once", () => {
    const keys = keysOf(["shopify"]);
    expect(keys).toHaveLength(integrationCatalogue.length);
    expect(new Set(keys).size).toBe(integrationCatalogue.length);
  });
});
