import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getRequiredEnvValue: vi.fn(),
  getOptionalEnvValue: vi.fn(),
}));

vi.mock("@/server/lib/runtime-env", () => ({
  getRequiredEnvValue: mocks.getRequiredEnvValue,
  getOptionalEnvValue: mocks.getOptionalEnvValue,
}));

const {
  credentialKeysSet,
  decryptCredentials,
  encryptCredentials,
  environmentName,
  mergeCredentials,
  resolveConnectionCredential,
  stripCredentials,
} = await import("./connection-secrets");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getRequiredEnvValue.mockResolvedValue("a-test-signing-secret-value");
  mocks.getOptionalEnvValue.mockResolvedValue(undefined);
});

describe("credentials at rest", () => {
  it("round-trips values through encryption", async () => {
    const cipher = await encryptCredentials({
      BASE_URL: "https://store.example",
      CONSUMER_SECRET: "cs_secret",
    });
    expect(await decryptCredentials(cipher)).toEqual({
      BASE_URL: "https://store.example",
      CONSUMER_SECRET: "cs_secret",
    });
  });

  it("does not store the secret in readable form", async () => {
    const cipher = await encryptCredentials({ CONSUMER_SECRET: "cs_secret" });
    expect(cipher).not.toContain("cs_secret");
  });

  it("stores nothing when every value is blank", async () => {
    expect(await encryptCredentials({ API_KEY: "   " })).toBeNull();
  });

  it("reports no credentials when the key no longer decrypts the blob", async () => {
    // A rotated BETTER_AUTH_SECRET must read as "needs reconnecting", not
    // crash every request that touches the connection.
    const cipher = await encryptCredentials({ API_KEY: "value" });
    mocks.getRequiredEnvValue.mockResolvedValue("a-completely-different-key");
    expect(await decryptCredentials(cipher)).toEqual({});
  });
});

describe("editing credentials", () => {
  it("keeps a stored secret when the field is submitted blank", async () => {
    // The browser is never sent the value, so an untouched field arrives
    // empty. Treating that as "clear it" would wipe a working connection.
    const existing = await encryptCredentials({
      BASE_URL: "https://store.example",
      CONSUMER_SECRET: "cs_original",
    });
    const merged = await mergeCredentials(existing, {
      BASE_URL: "https://moved.example",
      CONSUMER_SECRET: "",
    });
    expect(await decryptCredentials(merged)).toEqual({
      BASE_URL: "https://moved.example",
      CONSUMER_SECRET: "cs_original",
    });
  });

  it("replaces a secret that was actually retyped", async () => {
    const existing = await encryptCredentials({ CONSUMER_SECRET: "cs_old" });
    const merged = await mergeCredentials(existing, {
      CONSUMER_SECRET: "cs_new",
    });
    expect(await decryptCredentials(merged)).toEqual({
      CONSUMER_SECRET: "cs_new",
    });
  });

  it("merges onto nothing for a first connection", async () => {
    const merged = await mergeCredentials(null, { API_KEY: "first" });
    expect(await decryptCredentials(merged)).toEqual({ API_KEY: "first" });
  });
});

describe("resolving a credential", () => {
  it("prefers what the tenant stored over a deployment variable", async () => {
    // Otherwise a leftover deployment variable would silently override the
    // keys someone just typed in, and the UI would be lying about which
    // store it is talking to.
    mocks.getOptionalEnvValue.mockResolvedValue("from-the-deployment");
    const credentials = await encryptCredentials({ API_KEY: "from-the-ui" });
    await expect(
      resolveConnectionCredential(
        { credentials, credentialReference: "BOOXWORM" },
        "API_KEY",
      ),
    ).resolves.toBe("from-the-ui");
  });

  it("falls back to the deployment variable when nothing is stored", async () => {
    mocks.getOptionalEnvValue.mockResolvedValue("from-the-deployment");
    await expect(
      resolveConnectionCredential(
        { credentials: null, credentialReference: "BOOXWORM" },
        "API_KEY",
      ),
    ).resolves.toBe("from-the-deployment");
    expect(mocks.getOptionalEnvValue).toHaveBeenCalledWith("BOOXWORM_API_KEY");
  });

  it("names the missing field when there is no credential anywhere", async () => {
    await expect(
      resolveConnectionCredential(
        { credentials: null, credentialReference: null },
        "CONSUMER_SECRET",
      ),
    ).rejects.toThrow(/consumer secret/);
  });

  it("builds an environment name safely from an awkward reference", async () => {
    expect(environmentName("boo xworm-lk", "BASE_URL")).toBe(
      "BOO_XWORM_LK_BASE_URL",
    );
  });
});

describe("what leaves the server", () => {
  it("removes the encrypted blob and reports only which keys are set", async () => {
    const credentials = await encryptCredentials({
      BASE_URL: "https://store.example",
      CONSUMER_SECRET: "cs_secret",
    });
    const safe = await stripCredentials({
      id: "connection_1",
      displayName: "BooXworm",
      credentials,
    });
    expect(safe).toEqual({
      id: "connection_1",
      displayName: "BooXworm",
      credentialKeysSet: ["BASE_URL", "CONSUMER_SECRET"],
    });
    expect(JSON.stringify(safe)).not.toContain("cs_secret");
    expect(safe).not.toHaveProperty("credentials");
  });

  it("passes through a row that no longer exists", async () => {
    expect(await stripCredentials(undefined)).toBeUndefined();
  });

  it("lists no keys for a connection that has never been configured", async () => {
    expect(await credentialKeysSet(null)).toEqual([]);
  });
});
