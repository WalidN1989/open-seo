/**
 * A stand-in AgentMail for the email module tests: records every call and
 * answers with the documented response shapes, plus a Svix-style signer for
 * webhook bodies.
 */
export const WEBHOOK_SECRET =
  "whsec_" + btoa("email-module-test-secret-32bytes!");

export const calls: Array<{
  method: string;
  path: string;
  auth: string | null;
  body: unknown;
}> = [];

const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status });

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseBody(body: BodyInit | null | undefined): Record<string, unknown> {
  if (typeof body !== "string") return {};
  const parsed: unknown = JSON.parse(body);
  return isRecord(parsed) ? parsed : {};
}

/** A stand-in AgentMail: records every call and answers like the real API. */
export const fakeAgentmail: typeof fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : input);
  const path = url.pathname.replace(/^\/v0/, "");
  const body = parseBody(init?.body);
  calls.push({
    method: init?.method ?? "GET",
    path,
    auth: new Headers(init?.headers).get("authorization"),
    body,
  });
  if (path === "/pods" && init?.method === "GET")
    return json({
      pods: [{ pod_id: "pod_old", name: "Other", client_id: "someone-else" }],
    });
  if (path === "/pods") return json({ pod_id: "pod_1", name: body.name });
  if (path === "/pods/pod_1/inboxes")
    return json({
      pod_id: "pod_1",
      inbox_id: "inbox_1",
      email: `${typeof body.username === "string" ? body.username : "auto"}@agentmail.to`,
    });
  if (path === "/pods/pod_1/api-keys")
    return json({
      api_key_id: "key_1",
      api_key: "am_pod_scoped_key",
      prefix: "am_",
    });
  if (
    path === "/webhooks" &&
    new Headers(init?.headers).get("authorization") ===
      "Bearer am_us_inbox_pasted" &&
    body.inbox_ids
  )
    return json(
      {
        message:
          "inbox_ids and pod_ids cannot be set when using an inbox-scoped API key is forbidden",
      },
      403,
    );
  if (path === "/webhooks")
    return json({
      webhook_id: "wh_1",
      url: body.url,
      secret: WEBHOOK_SECRET,
      enabled: true,
    });
  if (/^\/inboxes\/inbox_1\/messages\/[^/]+\/reply$/.test(path))
    return json({ message_id: "<reply-1@agentmail.to>", thread_id: "thd_1" });
  if (path === "/inboxes/period%40agentmail.to" && init?.method === "GET")
    return json({
      inbox_id: "period@agentmail.to",
      email: "period@agentmail.to",
      display_name: "Period.lk",
    });
  if (path === "/inboxes/period%40agentmail.to/api-keys")
    return json({
      api_key_id: "key_2",
      api_key: "am_inbox_scoped_key",
      prefix: "am_us_inbox_",
    });
  if (path === "/inboxes/inbox_1/messages/send")
    return json({ message_id: "<sent-1@agentmail.to>", thread_id: "thd_new" });
  return json({ message: `unexpected ${path}` }, 404);
};

export async function signed(body: string, id = "msg_1") {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const raw = Uint8Array.from(atob(WEBHOOK_SECRET.slice(6)), (c) =>
    c.charCodeAt(0),
  );
  const key = await crypto.subtle.importKey(
    "raw",
    raw,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${id}.${timestamp}.${body}`),
  );
  return new Headers({
    "svix-id": id,
    "svix-timestamp": timestamp,
    "svix-signature": `v1,${btoa(String.fromCharCode(...new Uint8Array(sig)))}`,
  });
}
