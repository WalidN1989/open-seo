import { describe, expect, it } from "vitest";
import {
  assistantKeepsReplying,
  customerBrief,
  looksAutomated,
} from "./customerFollowUp";

describe("customer follow-up rules", () => {
  it("never answers an out-of-office or a bounce", () => {
    expect(looksAutomated("Automatic reply: Quote QUO-0002", "a@b.com")).toBe(
      true,
    );
    expect(looksAutomated("RE: Out of Office", "a@b.com")).toBe(true);
    expect(looksAutomated("Undeliverable: hi", "a@b.com")).toBe(true);
    expect(looksAutomated("Hello", "MAILER-DAEMON@mail.com")).toBe(true);
    expect(looksAutomated("Re: Quotation QUO-0002", "justin@gmail.com")).toBe(
      false,
    );
  });

  it("stops after two assistant replies in a day with no person in between", () => {
    const now = Date.parse("2026-09-15T12:00:00Z");
    const at = (hoursAgo: number) =>
      new Date(now - hoursAgo * 3_600_000).toISOString();
    const assistant = (hoursAgo: number) => ({
      direction: "outbound",
      authoredBy: "assistant",
      occurredAt: at(hoursAgo),
    });
    const inbound = (hoursAgo: number) => ({
      direction: "inbound",
      authoredBy: null,
      occurredAt: at(hoursAgo),
    });
    expect(
      assistantKeepsReplying(
        [assistant(3), inbound(2), assistant(1), inbound(0)],
        now,
      ),
    ).toBe(true);
    expect(assistantKeepsReplying([assistant(1), inbound(0)], now)).toBe(false);
    expect(
      assistantKeepsReplying(
        [
          assistant(3),
          { direction: "outbound", authoredBy: "user-1", occurredAt: at(2) },
          assistant(1),
        ],
        now,
      ),
    ).toBe(false);
  });

  it("gives the reply the quotation and what the photos show", () => {
    const brief = customerBrief({
      name: "Justin",
      leadTitle: "Colorbond side gate",
      quote: {
        number: "QUO-0003",
        status: "sent",
        total: "$1,450.00 AUD",
        validUntil: "2026-10-15",
        sentAt: "2026-09-15T01:00:00Z",
        lines: [
          {
            description: "Colorbond pedestrian gate",
            quantity: 1,
            amount: "$950.00",
          },
        ],
      },
      attachmentNotes: "- Narrow side passage with a downpipe",
    });
    expect(brief).toContain("QUO-0003, status sent, total $1,450.00 AUD");
    expect(brief).toContain("- 1 x Colorbond pedestrian gate: $950.00");
    expect(brief).toContain("Narrow side passage");
  });
});
