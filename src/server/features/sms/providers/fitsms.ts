import { z } from "zod";
import { resolveConnectionCredential } from "@/server/lib/connection-secrets";

const responseSchema = z.object({
  status: z.literal("success"),
  data: z.unknown(),
});

// Setup deliberately exposes no sending, campaign launch or scheduling API.
export async function checkFitsmsConnection(
  connection: {
    credentials?: string | null;
    credentialReference: string | null;
  },
  fetcher: typeof fetch = fetch,
) {
  const token = await resolveConnectionCredential(connection, "API_TOKEN");
  try {
    const response = await fetcher("https://app.fitsms.lk/api/v4/sms?page=1", {
      method: "GET",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      redirect: "manual",
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error("Request rejected");
    const body: unknown = await response.json();
    if (!responseSchema.safeParse(body).success)
      throw new Error("Invalid response");
  } catch {
    // Neither provider responses nor transport errors may echo the token or history.
    throw new Error(
      "FITSMS connection check failed. Verify the v4 API token and try again. No SMS was sent.",
    );
  }
}
