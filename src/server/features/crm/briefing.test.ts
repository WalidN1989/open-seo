import { describe, expect, it } from "vitest";
import { buildBriefing, type BriefingData } from "./briefing";

const now = "2026-09-16T08:00:00.000Z";
const since = "2026-09-15T20:00:00.000Z";
const quote = {
  number: "QUO-0002",
  status: "sent",
  clientName: "Justin Kim",
  totalMinor: 7900,
  currency: "AUD",
  sentAt: "2026-09-14T19:36:00.000Z",
  respondedAt: null,
  validUntil: "2026-09-20",
  chaseCount: 1,
  createdAt: "2026-09-14T19:35:00.000Z",
};
const empty: BriefingData = {
  since,
  now,
  calls: [],
  newLeads: [],
  emails: [],
  draftsWaiting: [],
  quotes: [],
  followUpsDue: [],
  remindersWaiting: [],
  whatsapp: { messages: 0, chats: 0, waitingForPerson: 0 },
};

describe("buildBriefing", () => {
  it("says plainly when there is nothing to do", () => {
    const briefing = buildBriefing(empty);
    expect(briefing.needsYou).toEqual([]);
    expect(briefing.text).toContain("Nothing is waiting on you.");
  });

  it("puts what needs a person first, and counts the rest", () => {
    const briefing = buildBriefing({
      ...empty,
      quotes: [
        quote,
        {
          ...quote,
          number: "QUO-0003",
          status: "accepted",
          respondedAt: "2026-09-16T01:00:00.000Z",
        },
        {
          ...quote,
          number: "QUO-0004",
          status: "draft",
          sentAt: null,
          createdAt: "2026-09-16T05:00:00.000Z",
        },
      ],
      draftsWaiting: [
        { to: '["justin@example.com"]', subject: "Re: QUO-0002", at: now },
      ],
      emails: [
        {
          direction: "inbound",
          from: "Justin <justin@example.com>",
          to: "[]",
          subject: "Re: QUO-0002",
          authoredBy: null,
          hasAttachments: true,
          at: now,
        },
        {
          direction: "outbound",
          from: "sales@x.com",
          to: "[]",
          subject: "Re: QUO-0002",
          authoredBy: "assistant:quote-follow-up",
          hasAttachments: false,
          at: now,
        },
      ],
      whatsapp: { messages: 3, chats: 2, waitingForPerson: 1 },
    });
    expect(briefing.needsYou).toEqual([
      "Justin Kim accepted QUO-0003 ($79.00 AUD): arrange the next steps and payment.",
      "Email reply waiting for approval to justin@example.com: Re: QUO-0002",
      "1 WhatsApp chat(s) waiting for a person.",
      "Draft quote QUO-0004 for Justin Kim ($79.00 AUD) hasn't been sent.",
      "QUO-0002 for Justin Kim expires 2026-09-20 with no answer yet.",
    ]);
    expect(briefing.happened).toContain(
      "Email from Justin <justin@example.com>: Re: QUO-0002 (with photos or documents).",
    );
    expect(briefing.happened).toContain("1 quote follow-up email(s) sent.");
    expect(briefing.waitingOnCustomers[0]).toContain(
      "QUO-0002 · Justin Kim · $79.00 AUD · sent 1 day(s) ago · 1 follow-up(s) sent",
    );
  });
});
