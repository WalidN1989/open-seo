import { describe, expect, it } from "vitest";
import { textToHtml } from "./textToHtml";

describe("textToHtml", () => {
  it("makes URLs and addresses clickable and keeps punctuation outside", () => {
    const html = textToHtml(
      "View your report:\n\nhttps://seo.digitalurgency.com.au/r/oTHueycNQx.\n\nWrite to sales@digitalurgency.com.au, or see www.digitalurgency.com.au",
    );
    expect(html).toContain(
      '<a href="https://seo.digitalurgency.com.au/r/oTHueycNQx">https://seo.digitalurgency.com.au/r/oTHueycNQx</a>.',
    );
    expect(html).toContain('<a href="mailto:sales@digitalurgency.com.au">');
    expect(html).toContain('<a href="https://www.digitalurgency.com.au">');
  });

  it("escapes markup and keeps paragraphs and line breaks", () => {
    const html = textToHtml("Hi <Connor>,\nline two\n\nBye & thanks");
    expect(html).toContain("Hi &lt;Connor&gt;,<br>line two");
    expect(html).toContain('<p style="margin:0 0 1em">Bye &amp; thanks</p>');
    expect(html).not.toContain("<Connor>");
  });
});
