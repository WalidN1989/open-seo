import { describe, expect, it } from "vitest";
import { isPersonalMoneyRequest } from "./whatsapp-reply-policy";

describe("personal money solicitation", () => {
  it.each([
    "Please give me some money brother 🥺",
    "I am from India, I am a student, the financial condition of my family is very bad, please help me sir.",
    "Can you help me financially?",
    "Please send me money",
  ])("silences clear solicitation: %s", (body) => {
    expect(isPersonalMoneyRequest(body)).toBe(true);
  });
  it.each([
    "How much money does a website cost?",
    "Please refund my money for order 123",
    "Please give me some money back for my cancelled order",
    "Can you send me the payment link?",
    "We need a donation website for our charity",
    "I need help paying my invoice",
  ])("allows business enquiries: %s", (body) => {
    expect(isPersonalMoneyRequest(body)).toBe(false);
  });
});
