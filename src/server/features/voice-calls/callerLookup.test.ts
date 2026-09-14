import { describe, expect, it } from "vitest";
import { CALLER_DEFAULTS, emailHint, initiationResponse } from "./callerLookup";

describe("initiationResponse", () => {
  it("answers an unknown number with the defaults and no greeting override", () => {
    expect(initiationResponse(null)).toEqual({
      type: "conversation_initiation_client_data",
      dynamic_variables: CALLER_DEFAULTS,
    });
  });

  it("greets a known caller by name without exposing their full email", () => {
    const response = initiationResponse({
      firstName: "Walid",
      email: "walid@example.com",
      leadTitle: "Website build — Walid Nazmi",
    });
    expect(response.dynamic_variables).toEqual({
      caller_known: "yes",
      caller_first_name: "Walid",
      caller_email_hint: "w…@example.com",
      caller_last_enquiry: "Website build",
    });
    expect(response.conversation_config_override?.agent.first_message).toBe(
      "[warmly] Hi Walid, welcome back to Digital Urgency, it's Shifa. How can I help you today?",
    );
  });

  it("never speaks the 'Caller' placeholder or markup from a CRM name", () => {
    const placeholder = initiationResponse({
      firstName: "Caller",
      email: null,
      leadTitle: null,
    });
    expect(placeholder.dynamic_variables.caller_first_name).toBe("");
    expect(
      placeholder.conversation_config_override?.agent.first_message,
    ).toMatch(/^\[warmly\] Hi, welcome back/);
    expect(
      initiationResponse({
        firstName: "{{x}} [Zoë]",
        email: null,
        leadTitle: null,
      }).dynamic_variables.caller_first_name,
    ).toBe("x Zoë");
    expect(emailHint(null)).toBe("");
  });
});
