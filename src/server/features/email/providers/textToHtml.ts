/**
 * The HTML part of a plain-text email.
 *
 * People write email as text; the app sends both parts so a client's mail
 * program shows links they can click. Nothing is styled beyond what makes
 * the text read as written: paragraphs, line breaks, and anchors on URLs and
 * addresses. Everything else is escaped.
 */

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

const URL_OR_EMAIL =
  /(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+|[\w.+-]+@[\w-]+(?:\.[\w-]+)+)/g;

/** Trailing punctuation belongs to the sentence, not the address. */
function splitTrailing(match: string) {
  const trimmed = match.replace(/[.,;:!?)\]]+$/, "");
  return { link: trimmed, rest: match.slice(trimmed.length) };
}

function linkify(line: string) {
  let out = "";
  let last = 0;
  for (const found of line.matchAll(URL_OR_EMAIL)) {
    const index = found.index ?? 0;
    out += escapeHtml(line.slice(last, index));
    const { link, rest } = splitTrailing(found[0]);
    const href = link.includes("@")
      ? `mailto:${link}`
      : link.startsWith("www.")
        ? `https://${link}`
        : link;
    out += `<a href="${escapeHtml(href)}">${escapeHtml(link)}</a>${escapeHtml(rest)}`;
    last = index + found[0].length;
  }
  return out + escapeHtml(line.slice(last));
}

export function textToHtml(text: string) {
  const paragraphs = text
    .replaceAll("\r\n", "\n")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map(
      (block) =>
        `<p style="margin:0 0 1em">${block.split("\n").map(linkify).join("<br>")}</p>`,
    );
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#1c2530">${paragraphs.join("")}</div>`;
}
