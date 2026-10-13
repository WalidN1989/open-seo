import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { afterAll, expect, it } from "vitest";
import { z } from "zod";

const requests: { action: string; conversationId?: string }[] = [];
const server = createServer(async (request, response) => {
  if (request.url === "/api/health") {
    response.end("ok");
    return;
  }
  let body = "";
  for await (const chunk of request) body += String(chunk);
  const action = z
    .object({ action: z.string(), conversationId: z.string().optional() })
    .parse(JSON.parse(body));
  requests.push(action);
  response.setHeader("content-type", "application/json");
  response.end(
    action.action === "recover"
      ? JSON.stringify([
          {
            conversationId: "recovered",
            dueAt: new Date(Date.now() + 100).toISOString(),
          },
        ])
      : "[]",
  );
});
let child: ReturnType<typeof spawn> | undefined;
afterAll(async () => {
  if (child && child.exitCode === null) {
    child.kill();
    await once(child, "exit");
  }
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
const notify = (dueAt: string, secret = "test-only-secret") =>
  fetch("http://127.0.0.1:3003/schedule", {
    method: "POST",
    headers: { "x-internal-cron-secret": secret },
    body: JSON.stringify({ conversationId: "burst", dueAt }),
  });

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(predicate: () => boolean) {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return;
    await sleep(50);
  }
  throw new Error("Reply runner did not become ready");
}

it("recovers once, stays quiet while idle, and coalesces one-time message wakeups", async () => {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Expected TCP server");
  const port = address.port;
  let ready = false;
  let errors = "";
  child = spawn(
    process.execPath,
    ["node_modules/tsx/dist/cli.mjs", "scripts/whatsapp-reply-runner.ts"],
    {
      env: {
        ...process.env,
        INTERNAL_CRON_SECRET: "test-only-secret",
        PORT: String(port),
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  child.stdout?.on("data", (data) => {
    if (String(data).includes("Event-driven replies enabled")) ready = true;
  });
  child.stderr?.on("data", (data) => {
    errors += String(data);
  });
  await waitFor(() => ready);
  await waitFor(() =>
    requests.some((row) => row.conversationId === "recovered"),
  );
  expect(requests.filter((row) => row.action === "recover")).toHaveLength(1);
  const idleCount = requests.length;
  await sleep(250);
  expect(requests).toHaveLength(idleCount);
  expect(
    (await notify(new Date(Date.now() + 100).toISOString(), "wrong")).status,
  ).toBe(401);
  expect((await notify("invalid-date")).status).toBe(400);
  expect((await notify(new Date(Date.now() + 150).toISOString())).status).toBe(
    200,
  );
  expect((await notify(new Date(Date.now() + 350).toISOString())).status).toBe(
    200,
  );
  await sleep(220);
  expect(requests.filter((row) => row.conversationId === "burst")).toHaveLength(
    0,
  );
  await waitFor(() => requests.some((row) => row.conversationId === "burst"));
  await sleep(250);
  expect(requests.filter((row) => row.conversationId === "burst")).toHaveLength(
    1,
  );
  expect(errors).toBe("");
}, 15_000);
