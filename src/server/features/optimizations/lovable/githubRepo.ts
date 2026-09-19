import { z } from "zod";

/**
 * The Git side of a Lovable site: its GitHub repository. Lovable syncs the
 * repository's branch into the project, so a commit here shows up in the
 * Lovable editor and preview — and reaches the live domain only when someone
 * clicks Publish in Lovable. Pure apart from `fetch`.
 */

export type RepoTarget = {
  token: string;
  /** "owner/name" */
  repository: string;
  branch: string;
};

export type RepoFile =
  | { path: string; text: string }
  | { path: string; bytes: Uint8Array };

const API = "https://api.github.com";

/** "https://github.com/WalidN1989/sprout-reach-studio" or "owner/name" → "owner/name". */
export function repositoryName(value: string) {
  const name = value
    .trim()
    .replace(/^https?:\/\/github\.com\//i, "")
    .replace(/\.git$/i, "")
    .replace(/\/+$/, "");
  if (!/^[\w.-]+\/[\w.-]+$/.test(name)) {
    throw new Error('The repository must look like "owner/name".');
  }
  return name;
}

async function call(
  target: RepoTarget,
  path: string,
  fetcher: typeof fetch,
  init?: { method: string; body: unknown },
) {
  const response = await fetcher(
    `${API}/repos/${repositoryName(target.repository)}${path}`,
    {
      method: init?.method ?? "GET",
      headers: {
        Authorization: `Bearer ${target.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
        "User-Agent": "OpenSEO",
      },
      body: init ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(60_000),
    },
  );
  const payload: unknown = await response.json().catch(() => null);
  return { response, payload };
}

function refused(status: number, what: string) {
  return new Error(
    status === 401
      ? "GitHub refused the token. Create a new one and paste it in the Lovable integration."
      : status === 403 || status === 404
        ? `GitHub would not let the token ${what}. Give it Contents: Read and write on this repository.`
        : `GitHub returned ${status} while trying to ${what}.`,
  );
}

function base64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** Text of one file on the branch, or null when it does not exist. */
export async function readFile(
  target: RepoTarget,
  path: string,
  fetcher: typeof fetch = fetch,
) {
  const { response, payload } = await call(
    target,
    `/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(target.branch)}`,
    fetcher,
  );
  if (response.status === 404) return null;
  const parsed = z.object({ content: z.string() }).safeParse(payload);
  if (!response.ok || !parsed.success)
    throw refused(response.status, "read the repository");
  const binary = atob(parsed.data.content.replace(/\s+/g, ""));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Which of these paths already exist on the branch. */
export async function existingPaths(
  target: RepoTarget,
  directory: string,
  fetcher: typeof fetch = fetch,
) {
  const { response, payload } = await call(
    target,
    `/contents/${directory.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(target.branch)}`,
    fetcher,
  );
  if (response.status === 404) return new Set<string>();
  const parsed = z.array(z.object({ path: z.string() })).safeParse(payload);
  if (!response.ok || !parsed.success)
    throw refused(response.status, "read the repository");
  return new Set(parsed.data.map((item) => item.path));
}

/** A cheap check that the token can see the repository and its blog. */
export async function checkRepository(
  target: RepoTarget,
  fetcher: typeof fetch = fetch,
) {
  const blog = await existingPaths(target, "src/content/blog", fetcher);
  if (!blog.size) {
    throw new Error(
      `${repositoryName(target.repository)} has no src/content/blog folder on ${target.branch}.`,
    );
  }
  return blog.size;
}

const refSchema = z.object({ object: z.object({ sha: z.string() }) });
const shaSchema = z.object({ sha: z.string() });
const commitSchema = z.object({
  sha: z.string(),
  tree: z.object({ sha: z.string() }),
  html_url: z.string().optional(),
});

/**
 * Writes every file in one commit on the branch. Paths that exist are
 * replaced, so publishing the same post again updates it in place.
 */
export async function commitFiles(
  target: RepoTarget,
  files: RepoFile[],
  message: string,
  fetcher: typeof fetch = fetch,
) {
  const branch = encodeURIComponent(target.branch);
  const ref = await call(target, `/git/ref/heads/${branch}`, fetcher);
  const head = refSchema.safeParse(ref.payload);
  if (!ref.response.ok || !head.success)
    throw refused(ref.response.status, "find the branch");
  const parent = await call(
    target,
    `/git/commits/${head.data.object.sha}`,
    fetcher,
  );
  const parentCommit = commitSchema.safeParse(parent.payload);
  if (!parent.response.ok || !parentCommit.success) {
    throw refused(parent.response.status, "read the latest commit");
  }

  const tree = [];
  for (const file of files) {
    const blob = await call(target, "/git/blobs", fetcher, {
      method: "POST",
      body:
        "text" in file
          ? { content: file.text, encoding: "utf-8" }
          : { content: base64(file.bytes), encoding: "base64" },
    });
    const created = shaSchema.safeParse(blob.payload);
    if (!blob.response.ok || !created.success)
      throw refused(blob.response.status, "upload a file");
    tree.push({
      path: file.path,
      mode: "100644",
      type: "blob",
      sha: created.data.sha,
    });
  }

  const newTree = await call(target, "/git/trees", fetcher, {
    method: "POST",
    body: { base_tree: parentCommit.data.tree.sha, tree },
  });
  const treeSha = shaSchema.safeParse(newTree.payload);
  if (!newTree.response.ok || !treeSha.success)
    throw refused(newTree.response.status, "build the commit");

  const commit = await call(target, "/git/commits", fetcher, {
    method: "POST",
    body: { message, tree: treeSha.data.sha, parents: [parentCommit.data.sha] },
  });
  const created = commitSchema.safeParse(commit.payload);
  if (!commit.response.ok || !created.success)
    throw refused(commit.response.status, "create the commit");

  // Fast-forward only: if someone pushed meanwhile this fails rather than
  // overwriting their work, and a retry builds on top of theirs.
  const moved = await call(target, `/git/refs/heads/${branch}`, fetcher, {
    method: "PATCH",
    body: { sha: created.data.sha, force: false },
  });
  if (!moved.response.ok) {
    throw moved.response.status === 422
      ? new Error("The site changed while publishing. Try again.")
      : refused(moved.response.status, "update the branch");
  }
  return {
    sha: created.data.sha,
    url: `https://github.com/${repositoryName(target.repository)}/commit/${created.data.sha}`,
  };
}
