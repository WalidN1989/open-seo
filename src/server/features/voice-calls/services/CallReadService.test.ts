import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  listCalls: vi.fn(),
  listRows: vi.fn(),
  connection: vi.fn(),
  credential: vi.fn(),
  fetch: vi.fn(),
}));
vi.mock("./PhoneCallService", () => ({
  PhoneCallService: { listCalls: mocks.listCalls },
}));
vi.mock("../repositories/PhoneCallRepository", () => ({
  PhoneCallRepository: {
    listCalls: mocks.listRows,
    getIntegrationById: mocks.connection,
  },
}));
vi.mock("@/server/lib/connection-secrets", () => ({
  resolveConnectionCredential: mocks.credential,
}));
import { CallReadService } from "./CallReadService";
const call = {
  id: "call-1",
  startedAt: "2026-10-11T09:08:36.000Z",
  callerNumber: "+61000000000",
  contact: { id: "contact-1", name: "Test Caller" },
  lead: { id: "lead-1", title: "Fence", status: "new" },
  durationSeconds: 21,
  direction: "inbound",
  summary: "Fence enquiry",
  callSuccessful: "success",
  transcript: [{ role: "user", message: "Please quote a fence", atSeconds: 1 }],
};
describe("call reads", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", mocks.fetch);
    mocks.listCalls.mockResolvedValue([call]);
    mocks.listRows.mockResolvedValue([
      {
        call: {
          provider: "elevenlabs",
          integrationId: "integration-1",
          externalConversationId: "conv-1",
        },
      },
    ]);
    mocks.connection.mockResolvedValue({
      organizationId: "org-1",
      providerKey: "elevenlabs",
      status: "connected",
    });
    mocks.credential.mockResolvedValue("test-secret");
    mocks.fetch.mockResolvedValue(
      new Response(JSON.stringify({ has_audio: true })),
    );
  });
  it("returns the stored full transcript and a session-protected URL without provider secrets", async () => {
    const result = await CallReadService.detail(
      "org-1",
      "user-1",
      "call-1",
      "https://app.test",
    );
    expect(result).toMatchObject({
      ...call,
      organizationId: "org-1",
      timezone: "UTC",
      outcome: "success",
      recordingStatus: "available",
      recordingUrl:
        "https://app.test/api/voice/calls/call-1/recording?organizationId=org-1",
    });
    expect(JSON.stringify(result)).not.toContain("test-secret");
    expect(mocks.listCalls).toHaveBeenCalledWith("org-1", "user-1", {
      callId: "call-1",
      limit: 1,
    });
    expect(mocks.fetch).toHaveBeenCalledWith(
      "https://api.elevenlabs.io/v1/convai/conversations/conv-1",
      expect.objectContaining({ redirect: "manual" }),
    );
  });
  it("filters by start time and bounds the database query", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-12T00:00:00Z"));
    try {
      await CallReadService.list("org-1", "user-1", "https://app.test", {
        sinceHours: 24,
        limit: 3,
      });
      expect(mocks.listCalls).toHaveBeenCalledWith("org-1", "user-1", {
        limit: 3,
        since: "2026-10-11T00:00:00.000Z",
      });
    } finally {
      vi.useRealTimers();
    }
  });
  it("returns an empty list without touching provider credentials", async () => {
    mocks.listCalls.mockResolvedValue([]);
    expect(
      await CallReadService.list("org-1", "user-1", "https://app.test", {}),
    ).toEqual([]);
    expect(mocks.credential).not.toHaveBeenCalled();
  });
  it("refuses a missing or foreign-workspace call before fetching provider data", async () => {
    mocks.listCalls.mockResolvedValue([]);
    await expect(
      CallReadService.detail("org-1", "user-1", "foreign", "https://app.test"),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mocks.listRows).not.toHaveBeenCalled();
  });
  it("does not resolve a different tenant's integration credentials", async () => {
    mocks.connection.mockResolvedValue({
      organizationId: "org-2",
      providerKey: "elevenlabs",
      status: "connected",
    });
    expect(
      await CallReadService.detail(
        "org-1",
        "user-1",
        "call-1",
        "https://app.test",
      ),
    ).toMatchObject({ recordingUrl: null, recordingStatus: "unavailable" });
    expect(mocks.credential).not.toHaveBeenCalled();
  });
  it("keeps transcript available when the provider fails", async () => {
    mocks.fetch.mockRejectedValue(new Error("provider down"));
    expect(
      await CallReadService.detail(
        "org-1",
        "user-1",
        "call-1",
        "https://app.test",
      ),
    ).toMatchObject({
      transcript: call.transcript,
      recordingUrl: null,
      recordingStatus: "unavailable",
    });
  });
  it("reports no recording when the provider has no audio", async () => {
    mocks.fetch.mockResolvedValue(
      new Response(JSON.stringify({ has_audio: false })),
    );
    expect(
      await CallReadService.detail(
        "org-1",
        "user-1",
        "call-1",
        "https://app.test",
      ),
    ).toMatchObject({ recordingUrl: null, recordingStatus: "not_recorded" });
  });
  it("rechecks authorization before audio playback", async () => {
    mocks.listCalls.mockRejectedValue(new Error("FORBIDDEN"));
    await expect(
      CallReadService.recording("org-1", "outsider", "call-1"),
    ).rejects.toThrow("FORBIDDEN");
    expect(mocks.credential).not.toHaveBeenCalled();
  });
  it("proxies audio only for an authorized call and matching integration", async () => {
    mocks.fetch.mockResolvedValue(
      new Response("audio", { headers: { "content-type": "audio/mpeg" } }),
    );
    expect(
      await (
        await CallReadService.recording("org-1", "user-1", "call-1")
      ).text(),
    ).toBe("audio");
    expect(mocks.fetch).toHaveBeenCalledWith(
      "https://api.elevenlabs.io/v1/convai/conversations/conv-1/audio",
      expect.anything(),
    );
  });
});

it("reports missing recording credentials without losing the stored transcript", async () => {
  mocks.listCalls.mockResolvedValue([call]);
  mocks.listRows.mockResolvedValue([
    {
      call: {
        provider: "elevenlabs",
        integrationId: "integration-1",
        externalConversationId: "conv-1",
      },
    },
  ]);
  mocks.connection.mockResolvedValue({
    organizationId: "org-1",
    providerKey: "elevenlabs",
    status: "connected",
  });
  mocks.credential.mockRejectedValue(new Error("missing API key"));
  expect(
    await CallReadService.detail(
      "org-1",
      "user-1",
      "call-1",
      "https://app.test",
    ),
  ).toMatchObject({
    transcript: call.transcript,
    recordingUrl: null,
    recordingStatus: "credentials_missing",
  });
  expect(mocks.fetch).not.toHaveBeenCalled();
});
