import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type * as TransactionalModule from "@/server/email/transactional";
import type * as ResendModule from "@/server/email/resend";

const mockEnv = vi.hoisted(() => ({}) as Record<string, string | undefined>);
vi.mock("cloudflare:workers", () => ({ env: mockEnv }));

let transactional: typeof TransactionalModule;
let resend: typeof ResendModule;

const sentEmailSchema = z.object({
  from: z.string(),
  to: z.array(z.string()),
  subject: z.string(),
  html: z.string(),
  text: z.string(),
});

/** fetch accepts three input shapes; narrow rather than stringify blindly. */
function requestedUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

/** Read back what was actually posted, without asserting our way past types. */
function sentEmail(init: RequestInit | undefined) {
  const body = init?.body;
  if (typeof body !== "string") {
    throw new Error("Expected the Resend request body to be a JSON string.");
  }
  return sentEmailSchema.parse(JSON.parse(body));
}

beforeEach(async () => {
  for (const key of Object.keys(mockEnv)) delete mockEnv[key];
  vi.resetModules();
  transactional = await import("@/server/email/transactional");
  resend = await import("@/server/email/resend");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("provider selection", () => {
  const resetUrl = "https://seo.example.com/reset-password?token=abc";

  function stubFetch() {
    return vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }));
  }

  it("names both options when no provider is configured", async () => {
    await expect(
      transactional.sendPasswordResetEmail({
        email: "walid@example.com",
        resetUrl,
      }),
    ).rejects.toThrow(/RESEND_API_KEY/);
  });

  it("prefers Resend over Loops when both are configured", async () => {
    mockEnv.RESEND_API_KEY = "re_test";
    mockEnv.RESEND_FROM_EMAIL = "OpenSEO <no-reply@example.com>";
    mockEnv.LOOPS_API_KEY = "loops_test";
    mockEnv.LOOPS_TRANSACTIONAL_RESET_PASSWORD_ID = "tpl_reset";
    mockEnv.LOOPS_TRANSACTIONAL_VERIFY_EMAIL_ID = "tpl_verify";
    const fetchSpy = stubFetch();

    await transactional.sendPasswordResetEmail({
      email: "walid@example.com",
      resetUrl,
    });

    expect(requestedUrl(fetchSpy.mock.calls[0][0])).toContain("api.resend.com");
  });

  it("still sends through Loops when only Loops is configured", async () => {
    mockEnv.LOOPS_API_KEY = "loops_test";
    mockEnv.LOOPS_TRANSACTIONAL_RESET_PASSWORD_ID = "tpl_reset";
    mockEnv.LOOPS_TRANSACTIONAL_VERIFY_EMAIL_ID = "tpl_verify";
    const fetchSpy = stubFetch();

    await transactional.sendPasswordResetEmail({
      email: "walid@example.com",
      resetUrl,
    });

    expect(requestedUrl(fetchSpy.mock.calls[0][0])).toContain("loops.so");
  });

  // A key with no sender is an operator mistake, not a reason to quietly send
  // through a different provider than the one they configured.
  it("refuses a half-configured Resend rather than falling through", async () => {
    mockEnv.RESEND_API_KEY = "re_test";
    mockEnv.LOOPS_API_KEY = "loops_test";
    mockEnv.LOOPS_TRANSACTIONAL_RESET_PASSWORD_ID = "tpl_reset";
    mockEnv.LOOPS_TRANSACTIONAL_VERIFY_EMAIL_ID = "tpl_verify";

    await expect(
      transactional.sendPasswordResetEmail({
        email: "walid@example.com",
        resetUrl,
      }),
    ).rejects.toThrow(/RESEND_FROM_EMAIL/);
  });
});

describe("the Resend password reset message", () => {
  const config = { apiKey: "re_test", from: "OpenSEO <no-reply@example.com>" };
  const resetUrl = "https://seo.example.com/reset-password?token=abc123";

  it("posts the reset link to Resend with both body parts", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("{}", { status: 200 }));

    await resend.sendResendPasswordResetEmail(config, {
      email: "walid@example.com",
      resetUrl,
      appName: "Digital Urgency",
      fetcher,
    });

    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(new Headers(init?.headers).get("Authorization")).toBe(
      "Bearer re_test",
    );

    const body = sentEmail(init);
    expect(body.from).toBe(config.from);
    expect(body.to).toEqual(["walid@example.com"]);
    expect(body.subject).toContain("Digital Urgency");
    // The link has to survive a client that strips HTML entirely.
    expect(body.text).toContain(resetUrl);
    expect(body.html).toContain("token=abc123");
  });

  it("surfaces the status when Resend rejects the send", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response('{"message":"domain not verified"}', { status: 403 }),
      );
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(
      resend.sendResendPasswordResetEmail(config, {
        email: "walid@example.com",
        resetUrl,
        appName: "Digital Urgency",
        fetcher,
      }),
    ).rejects.toThrow(/403/);
  });

  // A reset URL is attacker-influenced only through the configured base URL,
  // but it lands in an href and must not be able to close the attribute.
  it("escapes the action URL into the HTML body", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("{}", { status: 200 }));

    await resend.sendResendPasswordResetEmail(config, {
      email: "walid@example.com",
      resetUrl: 'https://seo.example.com/r?t=a"><script>alert(1)</script>',
      appName: "Digital Urgency",
      fetcher,
    });

    const body = sentEmail(fetcher.mock.calls[0][1]);
    expect(body.html).not.toContain("<script>");
    expect(body.html).toContain("&quot;");
  });
});
