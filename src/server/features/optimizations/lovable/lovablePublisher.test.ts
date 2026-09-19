import { beforeEach, describe, expect, it, vi } from "vitest";

type Patch = { status?: string; publishError?: string; cmsTargetJson?: string };

const { updateMock, generateMock } = vi.hoisted(() => ({
  updateMock:
    vi.fn<
      (
        organizationId: string,
        opportunityId: string,
        patch: Patch,
      ) => Promise<unknown>
    >(),
  generateMock:
    vi.fn<
      () => Promise<{ bytes: Uint8Array; extension: string; generator: string }>
    >(),
}));

vi.mock("cloudflare:workers", () => ({ env: {}, waitUntil: vi.fn() }));
vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/server/lib/connection-secrets", () => ({
  decryptCredentials: vi.fn(),
}));
vi.mock("../repositories/OptimizationRepository", () => ({
  OptimizationRepository: { update: updateMock },
}));
vi.mock(
  "@/server/features/business-modules/repositories/BusinessAuditRepository",
  () => ({ BusinessAuditRepository: { record: vi.fn() } }),
);
vi.mock("./blogImages", () => ({ generateBlogImage: generateMock }));

import { planPost } from "./lovablePost";
import { pushToLovable } from "./lovablePublisher";

const site = {
  token: "t",
  repository: "WalidN1989/sprout-reach-studio",
  branch: "main",
  siteUrl: "https://digitalurgency.com.au",
};
const plan = planPost({
  draft: { title: "Local SEO for Tradies", body: "Body text." },
  keyword: "local seo tradies",
  path: null,
  site: "au",
});

function urlOf(input: RequestInfo | URL) {
  return typeof input === "string"
    ? input
    : input instanceof URL
      ? input.href
      : input.url;
}

/** A GitHub with an empty blog folder that accepts every write. */
function github(writes: string[]) {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = urlOf(input);
    if (init?.method && init.method !== "GET") writes.push(url);
    if (url.includes("/contents/")) return new Response("{}", { status: 404 });
    if (url.endsWith("/git/ref/heads/main"))
      return Response.json({ object: { sha: "h" } });
    if (url.endsWith("/git/commits/h"))
      return Response.json({ sha: "h", tree: { sha: "t0" } });
    if (url.endsWith("/git/blobs")) return Response.json({ sha: "b" });
    if (url.endsWith("/git/trees")) return Response.json({ sha: "t1" });
    if (url.endsWith("/git/commits"))
      return Response.json({ sha: "c", tree: { sha: "t1" } });
    return Response.json({});
  };
}

async function push(writes: string[]) {
  if (!plan) throw new Error("plan expected");
  await pushToLovable({
    organizationId: "org",
    userId: "u",
    opportunityId: "opp",
    site,
    plan,
    keyword: "local seo tradies",
    today: "2026-09-20",
    fetcher: github(writes),
  });
}

describe("pushToLovable", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sends nothing and marks the article failed when the hero cannot be made", async () => {
    generateMock.mockRejectedValue(new Error("quota exceeded"));
    const writes: string[] = [];
    await push(writes);
    expect(writes).toEqual([]);
    const failed = updateMock.mock.calls.at(-1)?.[2];
    expect(failed?.status).toBe("failed");
    expect(failed?.publishError).toContain("hero image");
  });

  it("commits the post and hero together and records where it went", async () => {
    generateMock.mockResolvedValue({
      bytes: new Uint8Array([1]),
      extension: "webp",
      generator: "openai:gpt-image-1",
    });
    const writes: string[] = [];
    await push(writes);
    expect(writes.filter((url) => url.endsWith("/git/blobs"))).toHaveLength(2);
    const saved = updateMock.mock.calls.at(-1)?.[2];
    expect(saved?.status).toBe("published");
    expect(JSON.parse(saved?.cmsTargetJson ?? "{}")).toMatchObject({
      kind: "lovable",
      awaitingLovablePublish: true,
      url: `https://digitalurgency.com.au/blog/${plan?.slug}`,
    });
  });
});
