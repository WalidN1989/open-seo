/**
 * What a sample business sells, and who buys it.
 *
 * A new client's workspace is empty on the day it is made, and empty screens
 * teach nobody what they have bought. These profiles give the sample data a
 * shape that matches the client's own trade: a shoe shop is shown shoes.
 *
 * Matching is by keyword against the workspace name and domain. The generic
 * profile is not a failure case — most businesses land there and it reads
 * perfectly well.
 */

export type DemoProfile = {
  key: string;
  /** What the business does, in the words a person would use. */
  trade: string;
  /** Catalogue lines: name, unit price in cents. */
  products: { name: string; priceCents: number }[];
  /** The things customers ask about. */
  enquiries: string[];
  /** Where the customers come from, for the sample traffic breakdown. */
  channels: string[];
  /** What people ring the voice agent about. */
  voiceIntents: string[];
  /**
   * What this trade will actually find in its workspace, in its own words.
   * A footwear shop does not send quotations, and telling one it can see its
   * quotes is the first sentence of the relationship being wrong.
   */
  workspaceShows: string;
};

const FASHION: DemoProfile = {
  key: "fashion",
  trade: "footwear and fashion",
  products: [
    { name: "Women's Leather Slippers", priceCents: 4900 },
    { name: "Canvas Sneakers — White", priceCents: 7900 },
    { name: "Suede Ankle Boots", priceCents: 14900 },
    { name: "Everyday Sandals", priceCents: 3900 },
    { name: "Kids' School Shoes", priceCents: 5900 },
  ],
  enquiries: [
    "Do you have size 39 in the leather slippers?",
    "Is the white sneaker available in wide fit?",
    "How long does delivery take to Colombo?",
    "Can I exchange a pair bought last week?",
    "Do you do wholesale pricing for 20 pairs?",
  ],
  channels: ["Google search", "Instagram", "Direct", "Facebook", "Referral"],
  workspaceShows:
    "the orders coming in, the styles and sizes customers ask for, and every call and WhatsApp message your shop receives",
  voiceIntents: [
    "Checking a size before coming in",
    "Placing a repeat order",
    "Asking about delivery",
    "Asking if a style is back in stock",
    "Booking a fitting",
  ],
};

const BOOKS: DemoProfile = {
  key: "books",
  trade: "books and stationery",
  products: [
    { name: "Paperback Fiction — New Release", priceCents: 2500 },
    { name: "Children's Picture Book", priceCents: 1800 },
    { name: "Academic Textbook", priceCents: 7500 },
    { name: "Hardcover Gift Edition", priceCents: 5500 },
    { name: "Notebook & Pen Set", priceCents: 1200 },
  ],
  enquiries: [
    "Do you have the new release in stock?",
    "Can you order a title you don't carry?",
    "Do you post to other cities?",
    "Is there a discount for school orders?",
    "What time do you close on Sunday?",
  ],
  channels: ["Google search", "Direct", "Facebook", "Referral", "Instagram"],
  workspaceShows:
    "the orders coming in, the titles customers ask for, and every call and WhatsApp message your shop receives",
  voiceIntents: [
    "Asking whether a title is in stock",
    "Ordering a title to be brought in",
    "Asking about opening hours",
    "Placing a school order",
    "Asking about delivery",
  ],
};

const TRADES: DemoProfile = {
  key: "trades",
  trade: "fencing and outdoor work",
  products: [
    { name: "Colorbond Fencing — per metre", priceCents: 12500 },
    { name: "Timber Paling Fence — per metre", priceCents: 9800 },
    { name: "Gate Installation", priceCents: 68000 },
    { name: "Old Fence Removal — per metre", priceCents: 3500 },
    { name: "Site Measure & Quote", priceCents: 0 },
  ],
  enquiries: [
    "Can you quote 18 metres of Colorbond?",
    "How soon could you start?",
    "Do you remove the old fence as well?",
    "Is council approval needed for 1.8m?",
    "Do you cover the northern suburbs?",
  ],
  channels: ["Google search", "Google Maps", "Referral", "Direct", "Facebook"],
  workspaceShows:
    "your enquiries and quotes, the jobs you have booked, and every call and WhatsApp message that comes in",
  voiceIntents: [
    "Asking for a quote",
    "Booking a site measure",
    "Asking when work could start",
    "Checking on a job already booked",
    "Asking about materials",
  ],
};

const SERVICES: DemoProfile = {
  key: "services",
  trade: "services",
  products: [
    { name: "Starter Package", priceCents: 29900 },
    { name: "Standard Package", priceCents: 79900 },
    { name: "Premium Package", priceCents: 149900 },
    { name: "Monthly Support", priceCents: 19900 },
    { name: "Consultation", priceCents: 0 },
  ],
  enquiries: [
    "What's included in the standard package?",
    "Can we start this month?",
    "Do you offer a payment plan?",
    "How long before we see results?",
    "Can you send a quote by email?",
  ],
  channels: ["Google search", "Referral", "Direct", "LinkedIn", "Facebook"],
  workspaceShows:
    "your leads and quotes, your customers, and every call and message that comes in",
  voiceIntents: [
    "Asking what a package includes",
    "Asking for a quote",
    "Booking a consultation",
    "Chasing an existing job",
    "Asking about payment terms",
  ],
};

const PROFILES = [FASHION, BOOKS, TRADES, SERVICES];

const KEYWORDS: Record<string, string[]> = {
  fashion: [
    "shoe",
    "footwear",
    "slipper",
    "sneaker",
    "fashion",
    "trend",
    "boutique",
    "apparel",
    "clothing",
    "style",
  ],
  books: ["book", "read", "stationery", "library", "print", "paper"],
  trades: [
    "fenc",
    "build",
    "landscap",
    "roof",
    "plumb",
    "electric",
    "concret",
    "paint",
    "carpent",
  ],
};

/** The profile whose trade best matches a workspace name and domain. */
export function demoProfileFor(...hints: (string | null | undefined)[]) {
  const text = hints.filter(Boolean).join(" ").toLowerCase();
  for (const [key, words] of Object.entries(KEYWORDS)) {
    if (words.some((word) => text.includes(word))) {
      const match = PROFILES.find((profile) => profile.key === key);
      if (match) return match;
    }
  }
  return SERVICES;
}
