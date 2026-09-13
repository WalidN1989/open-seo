import { describe, expect, it } from "vitest";
import {
  bareAddress,
  normalizeMessageId,
  referencedMessageIds,
  replySubject,
} from "./threading";

describe("email threading helpers", () => {
  it("strips angle brackets and whitespace from message ids", () => {
    expect(normalizeMessageId(" <abc@x.com> ")).toBe("abc@x.com");
    expect(normalizeMessageId("abc@x.com")).toBe("abc@x.com");
    expect(normalizeMessageId("")).toBeNull();
    expect(normalizeMessageId(null)).toBeNull();
  });

  it("lists the answered message first, then references newest first", () => {
    expect(
      referencedMessageIds({
        inReplyTo: "<c@x>",
        references: ["<a@x>", "<b@x>", "<c@x>"],
      }),
    ).toEqual(["c@x", "b@x", "a@x"]);
  });

  it("prefixes Re: once", () => {
    expect(replySubject("Your report")).toBe("Re: Your report");
    expect(replySubject("RE: Your report")).toBe("RE: Your report");
    expect(replySubject(null)).toBe("Re:");
  });

  it("reduces a display-name address to the bare address", () => {
    expect(bareAddress("Jane Doe <Jane@X.com>")).toBe("jane@x.com");
    expect(bareAddress("  jane@x.com ")).toBe("jane@x.com");
  });
});
