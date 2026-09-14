/**
 * The email a quote goes out in. Pure, so the wording and links can be tested
 * without a mailbox: a short note, a button to the quote, a direct link to the
 * PDF for anyone wary of buttons, and the PDF itself attached.
 */

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

type QuoteEmailInput = {
  businessName: string;
  firstName: string | null;
  number: string;
  title: string | null;
  total: string;
  validUntil: string;
  viewUrl: string;
  pdfUrl: string;
  message: string | null;
  footer: string;
};

function validUntilLabel(iso: string) {
  const date = new Date(`${iso}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function composeQuoteEmail(input: QuoteEmailInput) {
  const greeting = `Hi ${input.firstName?.trim() || "there"},`;
  const intro = `Thanks for your time. Here is your quotation ${input.number}${
    input.title ? ` for ${input.title}` : ""
  }: ${input.total}, valid until ${validUntilLabel(input.validUntil)}.`;
  const closing =
    "The PDF is attached, and you can also open it online. If anything needs changing, just reply to this email.";
  const subject = `Quotation ${input.number} from ${input.businessName}`;

  const text = [
    greeting,
    intro,
    input.message?.trim() ?? "",
    closing,
    `View your quotation: ${input.viewUrl}`,
    `Download the PDF: ${input.pdfUrl}`,
    input.footer,
  ]
    .filter(Boolean)
    .join("\n\n");

  const paragraph = (value: string) =>
    `<tr><td style="font-size:15px;line-height:1.6;color:#42505e;padding-bottom:16px;">${escapeHtml(value).replaceAll("\n", "<br>")}</td></tr>`;
  const html = `<!doctype html>
<html lang="en">
<body style="margin:0;padding:0;background:#f4f5f7;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:32px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:540px;background:#ffffff;border-radius:12px;padding:36px 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1c2530;">
<tr><td style="font-size:20px;font-weight:600;padding-bottom:14px;">${escapeHtml(subject)}</td></tr>
${paragraph(greeting)}
${paragraph(intro)}
${input.message?.trim() ? paragraph(input.message.trim()) : ""}
${paragraph(closing)}
<tr><td style="padding:6px 0 20px;">
<a href="${escapeHtml(input.viewUrl)}" style="display:inline-block;background:#1c2530;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 26px;border-radius:8px;">View your quotation</a>
</td></tr>
<tr><td style="font-size:14px;line-height:1.6;padding-bottom:26px;"><a href="${escapeHtml(input.pdfUrl)}" style="color:#0c6a6a;">Download the PDF</a></td></tr>
<tr><td style="font-size:12px;line-height:1.6;color:#8a95a1;border-top:1px solid #e6e9ed;padding-top:18px;">${escapeHtml(input.footer)}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
  return { subject, text, html };
}

/** Bytes to base64 without Node's Buffer, which the worker may not have. */
export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}
