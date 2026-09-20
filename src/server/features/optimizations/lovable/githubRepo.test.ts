import { describe, expect, it } from "vitest";
import { checkRepository, commitFiles, repositoryName } from "./githubRepo";

function urlOf(input: RequestInfo | URL) {
  return typeof input === "string"
    ? input
    : input instanceof URL
      ? input.href
      : input.url;
}

const refusing = async () => new Response("{}", { status: 401 });

const target = {
  token: "t",
  repository: "WalidN1989/sprout-reach-studio",
  branch: "main",
};

describe("repositoryName", () => {
  it("accepts a GitHub URL or owner/name", () => {
    expect(
      repositoryName("https://github.com/WalidN1989/digitalurgency.lk.git"),
    ).toBe("WalidN1989/digitalurgency.lk");
    expect(() => repositoryName("not a repo")).toThrow();
  });
});

describe("commitFiles", () => {
  it("writes every file in one fast-forward commit", async () => {
    const calls: { method: string; url: string; body: unknown }[] = [];
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = urlOf(input);
      const method = init?.method ?? "GET";
      const body: unknown =
        typeof init?.body === "string" ? JSON.parse(init.body) : null;
      calls.push({ method, url, body });
      if (url.endsWith("/git/ref/heads/main"))
        return Response.json({ object: { sha: "head" } });
      if (url.endsWith("/git/commits/head"))
        return Response.json({ sha: "head", tree: { sha: "tree0" } });
      if (url.endsWith("/git/blobs"))
        return Response.json({ sha: `blob${calls.length}` }, { status: 201 });
      if (url.endsWith("/git/trees"))
        return Response.json({ sha: "tree1" }, { status: 201 });
      if (url.endsWith("/git/commits"))
        return Response.json(
          { sha: "new", tree: { sha: "tree1" } },
          { status: 201 },
        );
      if (url.endsWith("/git/refs/heads/main")) return Response.json({});
      return new Response(null, { status: 500 });
    };
    const result = await commitFiles(
      target,
      [
        {
          path: "public/blog-images/a/hero.webp",
          bytes: new Uint8Array([1, 2, 3]),
        },
        { path: "src/content/blog/a.json", text: "{}\n" },
      ],
      "content(blog): add a",
      fetcher,
    );
    expect(result.url).toBe(
      "https://github.com/WalidN1989/sprout-reach-studio/commit/new",
    );
    expect(
      calls.filter((call) => call.url.endsWith("/git/blobs")),
    ).toHaveLength(2);
    const move = calls.at(-1);
    expect(move?.method).toBe("PATCH");
    expect(move?.body).toEqual({ sha: "new", force: false });
  });

  it("says plainly when the token is refused", async () => {
    await expect(commitFiles(target, [], "m", refusing)).rejects.toThrow(
      "refused the token",
    );
  });
});

describe("checkRepository", () => {
  it("blames the token, not the blog, when GitHub says not found", async () => {
    // GitHub answers 404 for a repository a token may not see, which used to
    // read as "this site has no blog folder".
    const fetcher = async () => new Response("{}", { status: 404 });
    await expect(checkRepository(target, fetcher)).rejects.toThrow(
      "cannot see WalidN1989/sprout-reach-studio",
    );
  });

  it("reports a missing blog folder only when the repository is readable", async () => {
    const fetcher = async (input: RequestInfo | URL) =>
      urlOf(input).endsWith("/sprout-reach-studio")
        ? Response.json({ name: "sprout-reach-studio" })
        : new Response("{}", { status: 404 });
    await expect(checkRepository(target, fetcher)).rejects.toThrow(
      "no src/content/blog folder",
    );
  });

  it("counts the posts already there", async () => {
    const fetcher = async (input: RequestInfo | URL) =>
      urlOf(input).endsWith("/sprout-reach-studio")
        ? Response.json({ name: "sprout-reach-studio" })
        : Response.json([{ path: "a.json" }, { path: "b.json" }]);
    await expect(checkRepository(target, fetcher)).resolves.toBe(2);
  });
});
