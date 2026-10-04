import { z } from "zod";
import { resolveCredential, type WhatsappConnectionRecord } from "./whatsapp";

const IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
] as const;
export type WhatsappImage = {
  mediaType: (typeof IMAGE_TYPES)[number];
  data: string;
};

function isImageType(value: string): value is WhatsappImage["mediaType"] {
  return IMAGE_TYPES.some((type) => type === value);
}

function trustedMediaUrl(raw: string, provider: string): string {
  const url = new URL(raw);
  const host = url.hostname.toLowerCase();
  const trusted =
    provider === "twilio"
      ? host === "api.twilio.com"
      : host === "lookaside.fbsbx.com" ||
        host === "graph.facebook.com" ||
        host.endsWith(".fbcdn.net");
  if (url.protocol !== "https:" || !trusted || url.username || url.password) {
    throw new Error("Untrusted WhatsApp media URL");
  }
  return url.toString();
}

/** Fetch only bounded provider-hosted image bytes; never store them in the DB. */
export async function loadWhatsappImage(
  connection: WhatsappConnectionRecord,
  media: {
    mediaId?: string | null;
    mediaUrl?: string | null;
    mediaContentType?: string | null;
  },
  fetcher: typeof fetch = fetch,
): Promise<WhatsappImage> {
  let url = media.mediaUrl;
  let authorization: string;
  if (connection.provider === "meta_cloud") {
    if (!media.mediaId || !/^\d+$/.test(media.mediaId))
      throw new Error("Missing Meta image id");
    authorization = `Bearer ${await resolveCredential(connection, "ACCESS_TOKEN")}`;
    const metadata = await fetcher(
      `https://graph.facebook.com/v23.0/${media.mediaId}`,
      {
        headers: { Authorization: authorization },
        redirect: "manual",
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!metadata.ok)
      throw new Error(`Meta image lookup failed (${metadata.status})`);
    const parsed = z
      .object({ url: z.string().url() })
      .parse(await metadata.json());
    url = parsed.url;
  } else if (connection.provider === "twilio") {
    if (!connection.externalAccountId || !url)
      throw new Error("Missing Twilio image URL");
    const token = await resolveCredential(connection, "AUTH_TOKEN");
    authorization = `Basic ${btoa(`${connection.externalAccountId}:${token}`)}`;
    const path = new URL(url).pathname;
    if (
      !path.startsWith(`/2010-04-01/Accounts/${connection.externalAccountId}/`)
    ) {
      throw new Error("Twilio image does not belong to this account");
    }
  } else {
    throw new Error("Unsupported WhatsApp image provider");
  }
  const response = await fetcher(trustedMediaUrl(url, connection.provider), {
    headers: { Authorization: authorization },
    redirect: "manual",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok || !response.body)
    throw new Error(`WhatsApp image download failed (${response.status})`);
  const mediaType = (
    response.headers.get("content-type") ??
    media.mediaContentType ??
    ""
  )
    .split(";")[0]
    .trim()
    .toLowerCase();
  if (!isImageType(mediaType)) throw new Error("Unsupported image type");
  const maxBytes = 4_000_000;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > maxBytes) {
      await reader.cancel();
      throw new Error("WhatsApp image exceeds the vision limit");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return {
    mediaType,
    data: btoa(binary),
  };
}
