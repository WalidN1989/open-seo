import { resolveConnectionCredential } from "@/server/lib/connection-secrets";
import { z } from "zod";

export type InboundWhatsappMessage = {
  externalMessageId: string;
  sender: string;
  recipient?: string;
  body?: string;
  messageType: string;
  receivedAt: string;
};

export type WhatsappDeliveryUpdate = {
  externalMessageId: string;
  status: string;
};

type WhatsappConnectionRecord = {
  id: string;
  provider: string;
  displayPhoneNumber: string | null;
  externalAccountId: string | null;
  credentialReference: string | null;
  credentials?: string | null;
};

type WhatsappSendResult = {
  externalMessageId: string;
  status: string;
};

export async function resolveCredential(
  connection: WhatsappConnectionRecord,
  suffix: string,
): Promise<string> {
  return resolveConnectionCredential(connection, suffix);
}

export function parseTwilioPayload(payload: Readonly<Record<string, string>>): {
  messages: InboundWhatsappMessage[];
  statuses: WhatsappDeliveryUpdate[];
} {
  const externalMessageId = payload.MessageSid || payload.SmsSid;
  const status = payload.MessageStatus || payload.SmsStatus;
  if (externalMessageId && status && !payload.Body) {
    return { messages: [], statuses: [{ externalMessageId, status }] };
  }
  if (!externalMessageId || !payload.From)
    return { messages: [], statuses: [] };
  const mediaType = payload.MediaContentType0;
  return {
    messages: [
      {
        externalMessageId,
        sender: payload.From.replace(/^whatsapp:/, ""),
        recipient: payload.To?.replace(/^whatsapp:/, ""),
        body: payload.Body || undefined,
        messageType: mediaType?.startsWith("audio/")
          ? "voice"
          : mediaType?.startsWith("image/")
            ? "image"
            : "text",
        receivedAt: new Date().toISOString(),
      },
    ],
    statuses: [],
  };
}

const metaPayloadSchema = z.object({
  entry: z
    .array(
      z.object({
        changes: z
          .array(
            z.object({
              value: z
                .object({
                  messages: z
                    .array(
                      z.object({
                        id: z.string().optional(),
                        from: z.string().optional(),
                        timestamp: z.string().optional(),
                        type: z.string().optional(),
                        text: z
                          .object({ body: z.string().optional() })
                          .optional(),
                      }),
                    )
                    .optional(),
                  statuses: z
                    .array(
                      z.object({
                        id: z.string().optional(),
                        status: z.string().optional(),
                      }),
                    )
                    .optional(),
                })
                .optional(),
            }),
          )
          .optional(),
      }),
    )
    .optional(),
});

export function parseMetaPayload(payload: unknown): {
  messages: InboundWhatsappMessage[];
  statuses: WhatsappDeliveryUpdate[];
} {
  const data = metaPayloadSchema.parse(payload);
  const messages: InboundWhatsappMessage[] = [];
  const statuses: WhatsappDeliveryUpdate[] = [];
  for (const entry of data.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const message of change.value?.messages ?? []) {
        if (!message.id || !message.from) continue;
        messages.push({
          externalMessageId: message.id,
          sender: message.from,
          body: message.text?.body,
          messageType: message.type ?? "unknown",
          receivedAt: message.timestamp
            ? new Date(Number(message.timestamp) * 1000).toISOString()
            : new Date().toISOString(),
        });
      }
      for (const status of change.value?.statuses ?? []) {
        if (status.id && status.status) {
          statuses.push({
            externalMessageId: status.id,
            status: status.status,
          });
        }
      }
    }
  }
  return { messages, statuses };
}

export async function sendWhatsappText(
  connection: WhatsappConnectionRecord,
  recipient: string,
  body: string,
  fetcher: typeof fetch = fetch,
): Promise<WhatsappSendResult> {
  if (connection.provider === "twilio") {
    if (!connection.externalAccountId || !connection.displayPhoneNumber) {
      throw new Error("Twilio account SID and sender number are required.");
    }
    const token = await resolveCredential(connection, "AUTH_TOKEN");
    const params = new URLSearchParams({
      From: `whatsapp:${connection.displayPhoneNumber}`,
      To: `whatsapp:${recipient}`,
      Body: body,
    });
    const response = await fetcher(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(connection.externalAccountId)}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(`${connection.externalAccountId}:${token}`)}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params,
      },
    );
    const result = await response.json();
    const parsed = z
      .object({ sid: z.string(), status: z.string().optional() })
      .safeParse(result);
    if (!response.ok || !parsed.success) {
      throw new Error(`Twilio rejected the message (${response.status}).`);
    }
    return {
      externalMessageId: parsed.data.sid,
      status: parsed.data.status ?? "sent",
    };
  }
  if (connection.provider === "meta_cloud") {
    if (!connection.externalAccountId) {
      throw new Error("Meta phone number ID is required.");
    }
    const token = await resolveCredential(connection, "ACCESS_TOKEN");
    const response = await fetcher(
      `https://graph.facebook.com/v23.0/${encodeURIComponent(connection.externalAccountId)}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: recipient,
          type: "text",
          text: { body },
        }),
      },
    );
    const result = await response.json();
    const parsed = z
      .object({ messages: z.array(z.object({ id: z.string() })).min(1) })
      .safeParse(result);
    if (!response.ok || !parsed.success) {
      throw new Error(`Meta rejected the message (${response.status}).`);
    }
    return {
      externalMessageId: parsed.data.messages[0].id,
      status: "sent",
    };
  }
  throw new Error("This provider cannot send WhatsApp messages yet.");
}

export async function sendWhatsappTemplate(
  connection: WhatsappConnectionRecord,
  recipient: string,
  template: {
    name: string;
    languageCode: string;
    externalTemplateId: string | null;
  },
  fetcher: typeof fetch = fetch,
): Promise<WhatsappSendResult> {
  if (connection.provider === "meta_cloud") {
    if (!connection.externalAccountId) {
      throw new Error("Meta phone number ID is required.");
    }
    const token = await resolveCredential(connection, "ACCESS_TOKEN");
    const response = await fetcher(
      `https://graph.facebook.com/v23.0/${encodeURIComponent(connection.externalAccountId)}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: recipient,
          type: "template",
          template: {
            name: template.name,
            language: { code: template.languageCode },
          },
        }),
      },
    );
    const payload: unknown = await response.json();
    const parsed = z
      .object({ messages: z.array(z.object({ id: z.string() })).min(1) })
      .safeParse(payload);
    if (!response.ok || !parsed.success) {
      throw new Error(`Meta rejected the template (${response.status}).`);
    }
    return {
      externalMessageId: parsed.data.messages[0].id,
      status: "sent",
    };
  }
  if (connection.provider === "twilio") {
    if (
      !connection.externalAccountId ||
      !connection.displayPhoneNumber ||
      !template.externalTemplateId
    ) {
      throw new Error(
        "Twilio account SID, sender number, and approved Content SID are required.",
      );
    }
    const token = await resolveCredential(connection, "AUTH_TOKEN");
    const response = await fetcher(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(connection.externalAccountId)}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(`${connection.externalAccountId}:${token}`)}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          From: `whatsapp:${connection.displayPhoneNumber}`,
          To: `whatsapp:${recipient}`,
          ContentSid: template.externalTemplateId,
        }),
      },
    );
    const payload: unknown = await response.json();
    const parsed = z
      .object({ sid: z.string(), status: z.string().optional() })
      .safeParse(payload);
    if (!response.ok || !parsed.success) {
      throw new Error(`Twilio rejected the template (${response.status}).`);
    }
    return {
      externalMessageId: parsed.data.sid,
      status: parsed.data.status ?? "sent",
    };
  }
  throw new Error("This provider cannot send WhatsApp templates yet.");
}
