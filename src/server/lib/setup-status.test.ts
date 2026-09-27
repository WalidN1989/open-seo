import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  env: {} as Record<string, string>,
}));

vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/db/schema", () => ({ projects: {} }));
vi.mock("@/server/lib/runtime-env", () => ({
  getOptionalEnvValue: vi.fn(async (name: string) => mocks.env[name]),
}));

import { getSelfHostSetupStatus } from "./setup-status";

describe("getSelfHostSetupStatus", () => {
  beforeEach(() => {
    mocks.env = {
      AUTH_MODE: "selfhosted",
      BETTER_AUTH_URL: "https://seo.example.com",
      BETTER_AUTH_SECRET: "x".repeat(40),
      SELFHOSTED_ALLOWED_EMAILS: "owner@example.com",
    };
  });

  it("reports Resend as configured when both runtime variables are present", async () => {
    mocks.env.RESEND_API_KEY = "re_test";
    mocks.env.RESEND_FROM_EMAIL = "Digital Urgency <no-reply@example.com>";

    const status = await getSelfHostSetupStatus({ skipDatabaseCheck: true });

    expect(status.checks.auth).toEqual({
      status: "ok",
      detail:
        "Account email via Resend from Digital Urgency <no-reply@example.com>",
    });
  });
});
