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

  it("publishes the words when the picture cannot be made, and says why", async () => {
    // A quota-limited key is not a reason to sit on finished writing.
    generateMock.mockRejectedValue(new Error("Gemini 429: quota exceeded"));
    const writes: string[] = [];
    await push(writes);
    const saved = updateMock.mock.calls.at(-1)?.[2];
    expect(saved?.status).toBe("published");
    // Just the post file: no image was made, so none was committed.
    expect(writes.filter((url) => url.endsWith("/git/blobs"))).toHaveLength(1);
    expect(JSON.parse(saved?.cmsTargetJson ?? "{}")).toMatchObject({
      skippedImages: ["hero"],
      imageProblem: expect.stringContaining("quota exceeded") as unknown,
    });
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
