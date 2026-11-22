import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type {
  RankTrackingDeviceResult,
  RankTrackingRow,
} from "@/types/schemas/rank-tracking";
import {
  DeviceRankCell,
  buildRankTrackingExport,
} from "./RankTrackingTableParts";
import { CheckConfirmModal } from "./CheckConfirmModal";
import { RankTrackingHistoryMatrix } from "./RankTrackingHistoryMatrix";
import { applyFilters, EMPTY_FILTERS } from "./RankTrackingFilters";

function result(
  overrides: Partial<RankTrackingDeviceResult> = {},
): RankTrackingDeviceResult {
  return {
    checkState: "checked",
    checkedAt: "2026-11-20 10:00:00",
    position: null,
    previousPosition: 5,
    rankingUrl: null,
    serpFeatures: [],
    ...overrides,
  };
}
function row(desktop: RankTrackingDeviceResult): RankTrackingRow {
  return {
    trackingKeywordId: "kw",
    keyword: "example",
    searchVolume: null,
    keywordDifficulty: null,
    cpc: null,
    desktop,
    mobile: result(),
  };
}

describe("rank check presentation", () => {
  it("shows the operator-inclusive cost before confirming a manual check", () => {
    const markup = renderToStaticMarkup(
      createElement(CheckConfirmModal, {
        keywords: ["site:example.com"],
        devices: "both",
        serpDepth: 10,
        isPending: false,
        onRunNow: () => {},
        onCancel: () => {},
      }),
    );
    expect(markup).toContain("~$0.03");
    expect(markup).toContain("2 SERP checks");
  });

  it("labels a missing check separately from a confirmed ranking loss", () => {
    const missing = renderToStaticMarkup(
      createElement(DeviceRankCell, {
        result: result({ checkState: "not_checked", position: 4 }),
      }),
    );
    expect(missing).toContain("Not checked");
    expect(missing).toContain("Last known: 4");
    expect(missing).not.toContain("lost");
    const checked = renderToStaticMarkup(
      createElement(DeviceRankCell, { result: result() }),
    );
    expect(checked).toContain("lost");
  });

  it("exports check state, original timestamp and last-known rank without a stale delta", () => {
    const { headers, rows } = buildRankTrackingExport(
      [row(result({ checkState: "not_checked", position: 4 }))],
      true,
      false,
    );
    expect(rows[0][headers.indexOf("Desktop Check State")]).toBe("Not checked");
    expect(rows[0][headers.indexOf("Desktop Checked At (UTC)")]).toContain(
      "2026-11-20",
    );
    expect(rows[0][headers.indexOf("Desktop Position")]).toBe(4);
    expect(rows[0][headers.indexOf("Desktop Change")]).toBe("");
    expect(headers).not.toContain("Mobile Check State");
  });

  it("distinguishes not checked, not found and absent membership in history", () => {
    const markup = renderToStaticMarkup(
      createElement(RankTrackingHistoryMatrix, {
        isLoading: false,
        keywords: [
          { trackingKeywordId: "kw", keyword: "example" },
          { trackingKeywordId: "other", keyword: "other" },
        ],
        cells: [
          {
            runId: "r1",
            checkedAt: "2026-11-20",
            trackingKeywordId: "kw",
            position: null,
            checked: false,
          },
          {
            runId: "r2",
            checkedAt: "2026-11-21",
            trackingKeywordId: "kw",
            position: null,
            checked: true,
          },
        ],
      }),
    );
    expect(markup).toContain("Not checked");
    expect(markup).toContain("Not found");
    expect(markup).toContain("No check");
  });

  it("does not classify an unchecked keyword as unranked in filters", () => {
    const rows = [row(result({ checkState: "not_checked" })), row(result())];
    expect(
      applyFilters(rows, { ...EMPTY_FILTERS, maxDesktopPos: "0" }),
    ).toEqual([rows[1]]);
  });
});

it("sets an honest expectation for redirect resolution in the check confirmation", () => {
  const html = renderToStaticMarkup(
    createElement(CheckConfirmModal, {
      keywords: ["example"],
      devices: "mobile",
      serpDepth: 20,
      isPending: false,
      onRunNow: () => {},
      onCancel: () => {},
    }),
  );
  expect(html).toContain("Google link resolution can take several minutes.");
  expect(html).not.toContain("Results in ~");
});
