import { describe, expect, it, vi } from "vitest";

vi.mock("../repositories/EmailRepository", () => ({
  EmailRepository: {},
}));
vi.mock("@/server/features/crm/repositories/CrmRepository", () => ({
  CrmRepository: {},
}));
vi.mock("@/server/features/crm/services/CrmService", () => ({
  CrmService: {},
}));

import {
  identifyCustomer,
  parseWebsiteInquiry,
  type IngestMessage,
} from "./EmailCrmIngestParser";

const message = (overrides: Partial<IngestMessage> = {}): IngestMessage => ({
  direction: "inbound",
  fromAddress: "Customer <customer@example.com>",
  toAddresses: '["info@southsidefencing.com.au"]',
  subject: "Fence quote",
  textBody: "Could I get a quote for a timber fence?",
  ...overrides,
});

describe("email customer identification", () => {
  it("extracts website inquiry fields even when project details start on the next line", () => {
    expect(
      parseWebsiteInquiry(`
Name: Alison Mcmillan
Phone: 0414340714
Email: alisonmc232003@yahoo.com.au
Suburb / Area: Brisbane
Service: Timber Fencing
Project details:

10m treated pine paling fence 1.8m high
`),
    ).toEqual({
      email: "alisonmc232003@yahoo.com.au",
      firstName: "Alison",
      lastName: "Mcmillan",
      phone: "0414340714",
      suburb: "Brisbane",
      service: "Timber Fencing",
      requirements: "10m treated pine paling fence 1.8m high",
    });
  });

  it("uses a real external sender for a normal customer thread", () => {
    expect(
      identifyCustomer(
        "Colorbond fence quote",
        [message({ fromAddress: "Justin Kim <justin@example.com>" })],
        "info@southsidefencing.com.au",
      ),
    ).toMatchObject({
      email: "justin@example.com",
      firstName: "Justin",
      lastName: "Kim",
    });
  });

  it("ignores system, test and unsolicited non-customer mail", () => {
    expect(
      identifyCustomer(
        "Invoice INV-0035",
        [message({ fromAddress: "messaging-service@post.xero.com" })],
        "info@southsidefencing.com.au",
      ),
    ).toBeNull();
    expect(
      identifyCustomer(
        "Grow your business",
        [
          message({
            fromAddress: "Shannon <shannon@example.com>",
            textBody: "We provide lead generation services.",
          }),
        ],
        "info@southsidefencing.com.au",
      ),
    ).toBeNull();
  });
});
