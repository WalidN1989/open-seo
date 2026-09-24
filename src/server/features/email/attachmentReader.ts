/**
 * Read the photos and PDFs a customer attaches, so the reply and the lead
 * know what they show. The model describes; it never measures or prices, and
 * what it cannot see it leaves out.
 */

const MODEL = "claude-sonnet-5";

const SYSTEM_PROMPT = `You look at the photos and documents a customer attached to an email to a small trade or service business, and note what a salesperson needs to know before replying or quoting.

Rules:
- Plain text, up to 8 short "- " bullet lines, Australian English.
- Describe what is visible: the area or item, materials, condition, obstacles, access, anything written on a plan or document (dimensions only if they are printed or written on it).
- Never estimate measurements, prices or timelines, and never guess what is not shown.
- Refer to files by their order, e.g. "Photo 2:", when it helps.`;

type ReadableFile = {
  filename: string;
  contentType: string;
  contentBase64: string;
};

function block(file: ReadableFile) {
  return file.contentType === "application/pdf"
    ? {
        type: "document" as const,
        source: {
          type: "base64" as const,
          media_type: "application/pdf" as const,
          data: file.contentBase64,
        },
      }
    : {
        type: "image" as const,
        source: {
          type: "base64" as const,
          media_type: file.contentType,
          data: file.contentBase64,
        },
      };
}

export async function readAttachments(
  input: { subject: string | null; text: string | null; files: ReadableFile[] },
  apiKey: string,
  fetcher: typeof fetch = fetch,
): Promise<string | null> {
  if (!input.files.length) return null;
  const response = await fetcher("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 700,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            ...input.files.flatMap((file, index) => [
              {
                type: "text" as const,
                text: `File ${index + 1}: ${file.filename}`,
              },
              block(file),
            ]),
            {
              type: "text" as const,
              text: `The email's subject: ${input.subject ?? "(none)"}\nThe email says:\n${(input.text ?? "").slice(0, 4000)}\n\nWrite the notes.`,
            },
          ],
        },
      ],
    }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!response.ok) throw new Error(`Anthropic returned ${response.status}`);
  const payload: { content?: Array<{ type: string; text?: string }> } =
    await response.json();
  const text = (payload.content ?? [])
    .filter((part) => part.type === "text")
    .map((part) => part.text ?? "")
    .join("\n")
    .trim();
  return text ? text.slice(0, 2000) : null;
}
