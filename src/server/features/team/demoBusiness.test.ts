import { describe, expect, it } from "vitest";
import { buildDemoOverview } from "./demoBusiness";
import { demoProfileFor } from "./demoProfiles";

const now = new Date("2026-09-16T00:00:00.000Z");

describe("demoProfileFor", () => {
  it("matches the trade from the workspace name or domain", () => {
    expect(demoProfileFor("Bestrends", "bestrends.lk").key).toBe("fashion");
    expect(demoProfileFor("Bookshop Near Me", null).key).toBe("books");
    expect(demoProfileFor("Southside Fencing", null).key).toBe("trades");
  });

  it("falls back to a generic services business", () => {
    expect(demoProfileFor("Acme Pty Ltd", "acme.com.au").key).toBe("services");
    expect(demoProfileFor(null, undefined).key).toBe("services");
  });
});

describe("buildDemoOverview", () => {
  it("shows the same business every time for one workspace", () => {
    const first = buildDemoOverview({
      seed: "org-1",
      workspace: "Bestrends",
      now,
    });
    const second = buildDemoOverview({
      seed: "org-1",
      workspace: "Bestrends",
      now,
    });
    expect(second).toEqual(first);
  });

  it("gives two workspaces different businesses", () => {
    const one = buildDemoOverview({
      seed: "org-1",
      workspace: "Bestrends",
      now,
    });
    const two = buildDemoOverview({
      seed: "org-2",
      workspace: "Bestrends",
      now,
    });
    expect(two.leads).not.toEqual(one.leads);
  });

  it("fills every section the client lands on", () => {
    const overview = buildDemoOverview({
      seed: "org-1",
      workspace: "Bestrends",
      domain: "bestrends.lk",
      now,
    });
    expect(overview.headline).toHaveLength(6);
    for (const rows of [
      overview.leads,
      overview.contacts,
      overview.inquiries,
      overview.meetings,
      overview.quotations,
      overview.messages,
      overview.products,
      overview.orders,
      overview.traffic.days,
      overview.traffic.channels,
    ]) {
      expect(rows.length).toBeGreaterThan(0);
    }
    expect(overview.products[0]?.name).toMatch(
      /slipper|sneaker|boot|sandal|shoe/i,
    );
  });

  it("counts the headline numbers off the rows it lists", () => {
    const overview = buildDemoOverview({
      seed: "org-3",
      workspace: "Acme",
      now,
    });
    expect(overview.headline[0]?.value).toBe(String(overview.leads.length));
    expect(overview.headline[3]?.value).toBe(String(overview.orders.length));
    expect(overview.headline[4]?.value).toBe(
      String(overview.traffic.totalSessions),
    );
  });
});
