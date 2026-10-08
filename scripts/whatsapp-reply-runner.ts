import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import {
  replyWakeupSchema,
  replyWakeupsSchema,
  WHATSAPP_REPLY_RUNNER_PORT,
  WHATSAPP_REPLY_WAKEUP_PATH,
  type ReplyWakeup,
} from "../src/shared/whatsapp-reply-wakeup";

const secret = process.env.INTERNAL_CRON_SECRET;
if (!secret)
  throw new Error("INTERNAL_CRON_SECRET is required for the reply runner");
const serverUrl = `http://127.0.0.1:${process.env.PORT ?? "3001"}`;
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const attempts = new Map<string, number>();

async function worker(
  body: { action: "recover" } | { action: "run"; conversationId: string },
) {
  const response = await fetch(`${serverUrl}${WHATSAPP_REPLY_WAKEUP_PATH}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-internal-cron-secret": secret!,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error(`Reply worker returned ${response.status}`);
  return replyWakeupsSchema.parse(await response.json());
}

function schedule(job: ReplyWakeup, newMessage = false) {
  const previous = timers.get(job.conversationId);
  if (previous) clearTimeout(previous);
  if (newMessage) attempts.delete(job.conversationId);
  const delay = Math.max(0, Date.parse(job.dueAt) - Date.now());
  const timer = setTimeout(
    () => {
      timers.delete(job.conversationId);
      void run(job.conversationId);
    },
    Math.min(delay, 2_147_483_647),
  );
  timers.set(job.conversationId, timer);
}

async function run(conversationId: string) {
  const attempt = (attempts.get(conversationId) ?? 0) + 1;
  attempts.set(conversationId, attempt);
  try {
    const pending = await worker({ action: "run", conversationId });
    // A new inbound notification owns its newer timer.
    if (timers.has(conversationId)) return;
    if (!pending.length) {
      attempts.delete(conversationId);
      return;
    }
    if (attempt < 3) for (const job of pending) schedule(job);
    else
      console.error(
        "[reply-runner] Reply remains queued after three attempts; manual retry required",
      );
  } catch (error) {
    console.error("[reply-runner] Processing failed", error);
    if (attempt < 3 && !timers.has(conversationId)) {
      schedule({
        conversationId,
        dueAt: new Date(Date.now() + 30_000).toISOString(),
      });
    }
  }
}

const server = createServer(async (request, response) => {
  const provided = request.headers["x-internal-cron-secret"];
  if (
    typeof provided !== "string" ||
    Buffer.byteLength(provided) !== Buffer.byteLength(secret!) ||
    !timingSafeEqual(Buffer.from(provided), Buffer.from(secret!))
  ) {
    response.writeHead(401).end();
    return;
  }
  if (request.method !== "POST" || request.url !== "/schedule") {
    response.writeHead(404).end();
    return;
  }
  try {
    let body = "";
    for await (const chunk of request) {
      body += String(chunk);
      if (Buffer.byteLength(body) > 4096) {
        response.writeHead(413).end();
        return;
      }
    }
    const job = replyWakeupSchema.safeParse(JSON.parse(body));
    if (!job.success) {
      response.writeHead(400).end();
      return;
    }
    schedule(job.data, true);
    response.writeHead(200).end();
  } catch {
    response.writeHead(400).end();
  }
});
server.listen(WHATSAPP_REPLY_RUNNER_PORT, "127.0.0.1", () => {
  console.log(
    "[reply-runner] Event-driven replies enabled; no recurring queue checks",
  );
});

// Recovery reads the durable queue once after startup; empty queues schedule nothing.
async function recover() {
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      const response = await fetch(`${serverUrl}/api/health`, {
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok) {
        for (const job of await worker({ action: "recover" })) {
          if (!timers.has(job.conversationId)) schedule(job);
        }
        return;
      }
    } catch {
      /* Server is still booting. */
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  console.error(
    "[reply-runner] Startup recovery failed; manual recovery required",
  );
}
void recover();
