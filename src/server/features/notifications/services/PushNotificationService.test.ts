import { beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({
  WEB_PUSH_VAPID_PUBLIC_KEY: "public-key",
  WEB_PUSH_VAPID_PRIVATE_KEY: "private-key",
  WEB_PUSH_VAPID_SUBJECT: "https://digitalurgency.example",
  BETTER_AUTH_URL: "https://digitalurgency.example",
}));
const access = vi.hoisted(() => ({
  getAccess: vi.fn(),
  requireAccess: vi.fn(),
}));
const projects = vi.hoisted(() => ({ listProjects: vi.fn() }));
const repository = vi.hoisted(() => ({
  disable: vi.fn(),
  isEnabled: vi.fn(),
  listActiveSubscriptions: vi.fn(),
  listEnabledUserIds: vi.fn(),
  markSuccess: vi.fn(),
  setPreference: vi.fn(),
  upsertSubscription: vi.fn(),
}));
const push = vi.hoisted(() => ({ sendNotification: vi.fn() }));

vi.mock("@/server/lib/runtime-env", () => ({
  getOptionalEnvValue: (name: string) =>
    Promise.resolve(Reflect.get(env, name)),
}));
vi.mock(
  "@/server/features/business-modules/services/BusinessModuleService",
  () => ({ BusinessModuleService: access }),
);
vi.mock("@/server/features/projects/repositories/ProjectRepository", () => ({
  ProjectRepository: projects,
}));
vi.mock("../repositories/PushNotificationRepository", () => ({
  PushNotificationRepository: repository,
}));
vi.mock("web-push", () => push);

import { PushNotificationService } from "./PushNotificationService";

describe("PushNotificationService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    access.getAccess.mockResolvedValue([
      { key: "whatsapp", enabled: true, permission: "view" },
    ]);
    access.requireAccess.mockResolvedValue({ key: "whatsapp" });
    projects.listProjects.mockResolvedValue([
      { id: "project-1", slug: "period-lk", name: "Period.lk" },
    ]);
    repository.isEnabled.mockResolvedValue(false);
    repository.setPreference.mockResolvedValue(true);
    repository.listEnabledUserIds.mockResolvedValue([{ userId: "user-1" }]);
    repository.listActiveSubscriptions.mockResolvedValue([
      {
        endpoint: "https://push.example/subscription",
        p256dh: "device-public-key",
        auth: "device-auth",
      },
    ]);
    push.sendNotification.mockResolvedValue({ statusCode: 201 });
  });

  it("reports availability only when the user can access WhatsApp", async () => {
    await expect(
      PushNotificationService.status("org-1", "user-1"),
    ).resolves.toMatchObject({
      configured: true,
      eligible: true,
      enabled: false,
      publicKey: "public-key",
      workspaceName: "Period.lk",
    });
    access.getAccess.mockResolvedValue([]);
    await expect(
      PushNotificationService.status("org-1", "user-2"),
    ).resolves.toMatchObject({ eligible: false });
  });

  it("stores the device only after checking workspace access", async () => {
    await PushNotificationService.subscribe("org-1", "user-1", {
      endpoint: "https://push.example/subscription",
      p256dh: "device-public-key",
      auth: "device-auth",
    });
    expect(access.requireAccess).toHaveBeenCalledWith(
      "org-1",
      "user-1",
      "whatsapp",
      "view",
    );
    expect(repository.upsertSubscription).toHaveBeenCalledOnce();
    expect(repository.setPreference).toHaveBeenCalledWith(
      "org-1",
      "user-1",
      true,
    );
  });

  it("sends a privacy-safe deep link to opted-in authorized users", async () => {
    await PushNotificationService.notifyWhatsappInbound({
      organizationId: "org-1",
      conversationId: "conversation-1",
      externalMessageId: "message-1",
    });
    expect(push.sendNotification).toHaveBeenCalledOnce();
    const calls = push.sendNotification.mock.calls as unknown[][];
    const payload = calls[0]?.[1];
    expect(typeof payload).toBe("string");
    expect(JSON.parse(String(payload))).toEqual({
      title: "New WhatsApp message · Period.lk",
      body: "Open Digital Urgency to view and reply.",
      url: "/p/period-lk/modules/whatsapp?conversation=conversation-1",
      tag: "whatsapp:message-1",
    });
    expect(repository.markSuccess).toHaveBeenCalledWith(
      "https://push.example/subscription",
    );
  });

  it("does not notify a user whose WhatsApp access was removed", async () => {
    access.requireAccess.mockRejectedValue(new Error("forbidden"));
    await PushNotificationService.notifyWhatsappInbound({
      organizationId: "org-1",
      conversationId: "conversation-1",
      externalMessageId: "message-1",
    });
    expect(push.sendNotification).not.toHaveBeenCalled();
  });

  it("disables an expired browser subscription", async () => {
    push.sendNotification.mockRejectedValue({ statusCode: 410 });
    await PushNotificationService.notifyWhatsappInbound({
      organizationId: "org-1",
      conversationId: "conversation-1",
      externalMessageId: "message-1",
    });
    expect(repository.disable).toHaveBeenCalledWith(
      "https://push.example/subscription",
    );
  });
});
