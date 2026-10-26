import { describe, expect, it } from "vitest";
import {
  DEFAULT_WHATSAPP_RESPONSES,
  parseWhatsappResponses,
  renderWhatsappResponse,
  whatsappWritingSnapshot,
} from "./whatsapp-ai-configuration";
import { whatsappResponseMessagesSchema } from "@/types/schemas/whatsappResponseMessages";
describe("configurable WhatsApp wording", () => {
  it("returns visible defaults and preserves explicit custom text", () => {
    expect(parseWhatsappResponses(null)).toEqual(DEFAULT_WHATSAPP_RESPONSES);
    const custom = {
      ...DEFAULT_WHATSAPP_RESPONSES,
      imageUnavailable: "Describe your photo, please.",
    };
    expect(parseWhatsappResponses(JSON.stringify(custom))).toEqual(custom);
  });
  it("substitutes only declared placeholders without interpreting inserted text", () => {
    expect(
      renderWhatsappResponse("Hello {{displayName}}", {
        displayName: "Name {{remaining}}",
      }),
    ).toBe("Hello Name {{remaining}}");
    expect(
      whatsappResponseMessagesSchema.safeParse({
        ...DEFAULT_WHATSAPP_RESPONSES,
        verificationLocked: "{{secret}}",
      }).success,
    ).toBe(false);
  });
  it("snapshots raw unset values separately from effective defaults", () => {
    expect(whatsappWritingSnapshot(null)).toEqual({
      instructions: null,
      handoffMessage: null,
      replyStyle: null,
      responseMessages: null,
    });
  });
});
