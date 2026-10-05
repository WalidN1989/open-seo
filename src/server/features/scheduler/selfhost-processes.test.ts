import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { describe, expect, it } from "vitest";

function exited(child: ReturnType<typeof spawn>) {
  return new Promise<number | null>((resolveExit, reject) => {
    child.once("error", reject);
    child.once("exit", resolveExit);
  });
}

describe("self-host process recovery", () => {
  it("exits after six HTTP failures, resetting the streak after recovery", async () => {
    let count = 0;
    // Healthy, three failures, healthy again, then exactly six failures.
    const server = createServer((_request, response) => {
      count++;
      response.writeHead(count === 1 || count === 5 ? 200 : 500);
      response.end(JSON.stringify({ results: [] }));
    });
    await new Promise<void>((ready) => server.listen(0, "127.0.0.1", ready));
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("missing port");
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "scripts/internal-ticker.ts"],
      {
        env: {
          ...process.env,
          INTERNAL_CRON_SECRET: "test-only",
          INTERNAL_CRON_URL: `http://127.0.0.1:${address.port}`,
          INTERNAL_CRON_FAST_MS: "1000",
          INTERNAL_CRON_STANDARD_MS: "60000",
          INTERNAL_CRON_SLOW_MS: "60000",
        },
        stdio: "ignore",
      },
    );
    try {
      expect(await exited(child)).toBe(1);
      expect(count).toBe(11);
    } finally {
      child.kill("SIGKILL");
      await new Promise<void>((done) => server.close(() => done()));
    }
  }, 20_000);

  it("makes PID 1 fail when the ticker exits and terminates its siblings", async () => {
    const directory = await mkdtemp(join(tmpdir(), "openseo-supervisor-"));
    await mkdir(join(directory, "node_modules/vite/bin"), { recursive: true });
    await mkdir(join(directory, "scripts"));
    await writeFile(
      join(directory, "node_modules/vite/bin/vite.js"),
      'process.on("SIGTERM", () => { console.log("SERVER_STOPPED"); process.exit(0); }); setInterval(() => {}, 1000);',
    );
    await writeFile(
      join(directory, "scripts/internal-ticker.ts"),
      "setTimeout(() => process.exit(1), 500);",
    );
    await writeFile(
      join(directory, "scripts/mail-bridge.ts"),
      "setInterval(() => {}, 1000);",
    );
    await symlink(
      resolve("node_modules/tsx"),
      join(directory, "node_modules/tsx"),
      "dir",
    );
    const child = spawn(
      process.execPath,
      [resolve("scripts/selfhost-supervisor.mjs")],
      {
        cwd: directory,
        env: { ...process.env, INTERNAL_CRON_SECRET: "test-only" },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let log = "";
    child.stdout?.on("data", (chunk) => {
      log += String(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      log += String(chunk);
    });
    try {
      expect(await exited(child)).toBe(1);
      expect(log).toContain("ticker exited (1)");
      expect(log).toContain("SERVER_STOPPED");
    } finally {
      child.kill("SIGKILL");
      await rm(directory, { recursive: true, force: true });
    }
  }, 10_000);
});
