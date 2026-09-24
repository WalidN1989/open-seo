import { describe, expect, it } from "vitest";
import { buildDemoOverview } from "./demoBusiness";
import { demoProfileFor } from "./demoProfiles";
import { demoRegionFor } from "./demoRegions";

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

describe("demoRegionFor", () => {
  it("reads the country from the domain and writes its phone numbers", () => {
    expect(demoRegionFor("bestrends.lk").dialCode).toBe("+94");
    expect(demoRegionFor("digitalurgency.com.au").currency).toBe("AUD");
    expect(demoRegionFor(null).dialCode).toBe("+61");
  });
});

describe("buildDemoOverview", () => {
  it("uses the local country code, money and language", () => {
    const overview = buildDemoOverview({
      seed: "org-lk",
      workspace: "Bestrends",
      domain: "bestrends.lk",
      now,
    });
    expect(overview.country).toBe("Sri Lanka");
    expect(overview.currency).toBe("LKR");
    for (const contact of overview.contacts) {
      expect(contact.phone.startsWith("+94")).toBe(true);
    }
    const written = overview.messages.filter((message) => message.language);
    expect(written.length).toBeGreaterThan(0);
    for (const message of written) {
      expect(["Sinhala", "Tamil"]).toContain(message.language);
      expect(message.meaning).toBeTruthy();
    }
  });

  it("keeps Australian workspaces on +61 and English", () => {
    const overview = buildDemoOverview({
      seed: "org-au",
      workspace: "Southside Fencing",
      domain: "southsidefencing.com.au",
      now,
    });
    expect(overview.contacts[0]?.phone.startsWith("+61")).toBe(true);
    expect(overview.messages.every((message) => !message.language)).toBe(true);
  });

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

  it("reports the month in the headline, not the size of the sample table", () => {
    const overview = buildDemoOverview({
      seed: "org-3",
      workspace: "Acme",
      now,
    });
    // The tables below show a handful of recent rows; the tiles above them
    // are the month, which is the figure a business owner recognises.
    expect(Number(overview.headline[0]?.value)).toBeGreaterThanOrEqual(38);
    expect(Number(overview.headline[3]?.value)).toBeGreaterThanOrEqual(120);
    expect(overview.headline[4]?.value).toBe(
      String(overview.traffic.totalSessions),
    );
  });

  it("counts the communication tiles off the days the chart plots", () => {
    const overview = buildDemoOverview({
      seed: "org-4",
      workspace: "Acme",
      now,
    });
    const days = overview.communicationDays;
    expect(days).toHaveLength(14);
    const calls = days.reduce((sum, day) => sum + day.calls, 0);
    const voiceOrders = days.reduce((sum, day) => sum + day.voiceOrders, 0);
    expect(overview.communication[0]?.value).toBe(String(calls));
    expect(overview.communication[1]?.value).toBe(String(voiceOrders));
    expect(overview.restockQueue.length).toBeGreaterThan(0);
    expect(overview.locations.length).toBeGreaterThan(0);
  });
});
