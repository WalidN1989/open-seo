import { expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  research:
    vi.fn<
      (request: { data: { groupKeywords?: boolean } }) => Promise<unknown>
    >(),
}));
vi.mock("react", () => ({
  useMemo: (fn: () => unknown) => fn(),
  useEffect: () => undefined,
  useRef: (current: unknown) => ({ current }),
}));
vi.mock("@tanstack/react-query", () => ({ useQuery: mocks.query }));
vi.mock("@/serverFunctions/keywords", () => ({
  researchKeywords: mocks.research,
}));
vi.mock("@/client/lib/posthog", () => ({ captureClientEvent: vi.fn() }));
import { useKeywordResearchData } from "./useKeywordResearchData";
it("keeps the variants toggle in the primary hook request and its cache identity", async () => {
  let run: (() => unknown) | undefined;
  mocks.query.mockImplementation((options: { queryFn: () => unknown }) => {
    run = options.queryFn;
    return {};
  });
  const input = {
    projectId: "project",
    keywordInput: "seo",
    locationCode: 2840,
    displayedLocationCode: 2840,
    resultLimit: 150 as const,
    mode: "auto" as const,
    clickstream: false,
  };
  useKeywordResearchData({ ...input, groupKeywords: true }, vi.fn());
  await run?.();
  expect(mocks.research.mock.calls[0][0].data.groupKeywords).toBe(true);
  const firstOptions: unknown = mocks.query.mock.calls[0][0];
  useKeywordResearchData({ ...input, groupKeywords: false }, vi.fn());
  await run?.();
  expect(mocks.research.mock.calls[1][0].data.groupKeywords).toBe(false);
  const secondOptions: unknown = mocks.query.mock.calls[1][0];
  expect(firstOptions).not.toEqual(secondOptions);
});
