import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolContext } from "@/server/mcp/context";
import { requireMcpToolAccess } from "@/server/mcp/access-control";

const mocks = vi.hoisted(() => ({
  memberships: vi.fn(),
  project: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({ env: {}, waitUntil: vi.fn() }));

vi.mock("@/server/auth/repositories/AuthRepository", () => ({
  AuthRepository: { listOrganizationIdsForUser: mocks.memberships },
}));
vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: { getProjectForMember: mocks.project },
}));

const { crmWriteSurface } = await import("./crm-write-tools");
const { draftWriteSurface } = await import("./draft-write-tools");
const { quoteSurface } = await import("./quote-tools");
const { voiceSurface } = await import("./voice-tools");

const NEW_BUSINESS = [
  "create_lead",
  "update_lead",
  "update_lead_stage",
  "set_lead_follow_up",
  "archive_lead",
  "edit_log_entry",
  "delete_log_entry",
  "update_email_draft",
  "delete_email_draft",
  "draft_whatsapp_reply",
  "draft_sms_reply",
  "update_quote_draft",
] as const;
const VOICE = [
  "list_voice_calls",
  "get_voice_call",
  "list_voice_agents",
  "get_voice_agent",
  "update_voice_agent",
] as const;

function context(scopes: string[] = []): ToolContext {
  return {
    auth: {
      userId: "user_1",
      userEmail: "user@example.com",
      organizationId: "org_1",
      clientId: "client_1",
      tokenId: "grant_1",
      scopes,
      baseUrl: "https://example.com",
    },
  };
}

function findTool(name: string) {
  const tool = [crmWriteSurface, draftWriteSurface, quoteSurface, voiceSurface]
    .flatMap((surface) => surface.tools)
    .find((item) => item.name === name);
  if (!tool) throw new Error(`Missing tool ${name}`);
  return tool;
}

describe("expanded business MCP surface", () => {
  beforeEach(() => {
    mocks.memberships.mockReset().mockResolvedValue(["org_1"]);
    mocks.project.mockReset().mockResolvedValue({
      id: "project_1",
      organizationId: "org_1",
    });
  });

  it("registers every requested tool", () => {
    for (const name of NEW_BUSINESS) {
      expect(findTool(name).name).toBe(name);
    }
    for (const name of VOICE) {
      expect(findTool(name).name).toBe(name);
    }
  });

  it.each([...NEW_BUSINESS, ...VOICE])(
    "%s has a policy that rejects a newly issued unscoped token",
    async (name) => {
      const voice = VOICE.some((voiceName) => voiceName === name);
      const write = !name.startsWith("list_") && !name.startsWith("get_");
      expect(() =>
        requireMcpToolAccess(context().auth, {
          scope: voice
            ? write
              ? "voice:write"
              : "voice:read"
            : "business:write",
          legacyCompatible: false,
          tenantScope: voice ? "project" : "organization",
        }),
      ).toThrow(/scope/);
    },
  );

  it.each([...NEW_BUSINESS, ...VOICE])(
    "%s accepts its explicitly granted scope",
    (name) => {
      const voice = VOICE.some((voiceName) => voiceName === name);
      const write = !name.startsWith("list_") && !name.startsWith("get_");
      const scope = voice
        ? write
          ? ("voice:write" as const)
          : ("voice:read" as const)
        : ("business:write" as const);
      expect(() =>
        requireMcpToolAccess(context([scope]).auth, {
          scope,
          legacyCompatible: false,
          tenantScope: voice ? "project" : "organization",
        }),
      ).not.toThrow();
    },
  );

  it("keeps real send tools out of the new draft surface", () => {
    expect(draftWriteSurface.tools.map((tool) => tool.name)).toEqual([
      "update_email_draft",
      "delete_email_draft",
      "draft_whatsapp_reply",
      "draft_sms_reply",
    ]);
  });
});
