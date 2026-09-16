import { demoProfileFor, type DemoProfile } from "./demoProfiles";

/**
 * A worked example of a business, generated rather than stored.
 *
 * Nothing here is written to the database, which is the whole point: the
 * switch that turns it on changes what one person is shown and nothing else,
 * so turning it off restores the workspace exactly, and a workspace with real
 * data in it can never be confused with this.
 *
 * The numbers are drawn from a seeded generator, so the same workspace sees
 * the same sample every time. A client who reloads and finds different figures
 * learns that none of it is real; a stable example reads like a business.
 */

const FIRST = [
  "Nadia",
  "Tom",
  "Priya",
  "Marcus",
  "Ella",
  "Hassan",
  "Grace",
  "Liam",
  "Yasmin",
  "Dev",
  "Chloe",
  "Omar",
  "Sofia",
  "Ben",
  "Aisha",
];
const LAST = [
  "Fernando",
  "Walsh",
  "Nguyen",
  "Perera",
  "Silva",
  "Brooks",
  "Khan",
  "Ratnayake",
  "Doyle",
  "Mendis",
  "Carter",
  "Jayawardena",
];
const SUBURBS = [
  "Dehiwala",
  "Nugegoda",
  "Colombo 5",
  "Mount Lavinia",
  "Rajagiriya",
  "Battaramulla",
  "Kotte",
  "Moratuwa",
];
const STAGES = ["New", "Contacted", "Quoted", "Negotiating", "Won"];

/** Deterministic from a string: the same workspace always sees the same shop. */
function seeded(text: string) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  let state = hash >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Random = () => number;

function pick<T>(random: Random, values: readonly T[]): T {
  return values[Math.floor(random() * values.length)];
}

function between(random: Random, low: number, high: number) {
  return low + Math.floor(random() * (high - low + 1));
}

function daysAgo(days: number, now: Date) {
  return new Date(now.getTime() - days * 86_400_000).toISOString();
}

function person(random: Random) {
  return `${pick(random, FIRST)} ${pick(random, LAST)}`;
}

function money(cents: number, currency: string) {
  return `${currency} ${(cents / 100).toLocaleString("en-AU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function leads(random: Random, profile: DemoProfile, now: Date) {
  return Array.from({ length: 6 }, () => ({
    name: person(random),
    wants: pick(random, profile.enquiries),
    stage: pick(random, STAGES),
    valueCents: between(random, 3, 30) * 10_000,
    suburb: pick(random, SUBURBS),
    createdAt: daysAgo(between(random, 0, 21), now),
  }));
}

function contacts(random: Random, now: Date) {
  return Array.from({ length: 6 }, () => ({
    name: person(random),
    phone: `+61 4${between(random, 10, 99)} ${between(random, 100, 999)} ${between(random, 100, 999)}`,
    lastContactedAt: daysAgo(between(random, 0, 30), now),
    orders: between(random, 0, 7),
  }));
}

function meetings(random: Random, now: Date) {
  const kinds = ["Call back", "Site visit", "Showroom fitting", "Video call"];
  return Array.from({ length: 4 }, () => ({
    with: person(random),
    kind: pick(random, kinds),
    at: daysAgo(-between(random, 1, 9), now),
  }));
}

function quotations(random: Random, profile: DemoProfile, now: Date) {
  const statuses = ["Sent", "Sent", "Accepted", "Draft", "Expired"];
  return Array.from({ length: 5 }, (_, index) => ({
    number: `Q-10${20 + index}`,
    client: person(random),
    totalCents: between(random, 5, 45) * 10_000,
    status: pick(random, statuses),
    sentAt: daysAgo(between(random, 1, 18), now),
    currency: profile.currency,
  }));
}

function messages(random: Random, profile: DemoProfile, now: Date) {
  return Array.from({ length: 5 }, () => ({
    from: person(random),
    text: pick(random, profile.enquiries),
    channel: pick(random, ["SMS", "WhatsApp"]),
    at: daysAgo(between(random, 0, 6), now),
  }));
}

function products(random: Random, profile: DemoProfile) {
  return profile.products.map((product) => {
    const onHand = between(random, 0, 60);
    return {
      name: product.name,
      price: money(product.priceCents, profile.currency),
      onHand,
      status: onHand === 0 ? "Out of stock" : onHand < 8 ? "Low" : "In stock",
      soldThisMonth: between(random, 0, 40),
    };
  });
}

function orders(random: Random, profile: DemoProfile, now: Date) {
  const statuses = ["Paid", "Packing", "Shipped", "Delivered", "Refunded"];
  return Array.from({ length: 6 }, (_, index) => ({
    number: `#${1400 + index}`,
    customer: person(random),
    total: money(between(random, 2, 24) * 10_000, profile.currency),
    status: pick(random, statuses),
    placedAt: daysAgo(between(random, 0, 12), now),
  }));
}

function traffic(random: Random, profile: DemoProfile, now: Date) {
  const days = Array.from({ length: 14 }, (_, index) => ({
    date: daysAgo(13 - index, now).slice(0, 10),
    sessions: between(random, 40, 260),
  }));
  const total = days.reduce((sum, day) => sum + day.sessions, 0);
  let left = 100;
  const channels = profile.channels.map((channel, index) => {
    const share =
      index === profile.channels.length - 1 ? left : between(random, 8, 34);
    left = Math.max(0, left - share);
    return { channel, share };
  });
  return { days, totalSessions: total, channels };
}

/**
 * Everything the sample overview shows, built from one seed so the figures
 * agree with each other: the headline numbers are counted off the same rows
 * the tables below them list.
 */
export function buildDemoOverview(input: {
  seed: string;
  workspace: string;
  domain?: string | null;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const profile = demoProfileFor(input.workspace, input.domain);
  const random = seeded(input.seed);

  const leadRows = leads(random, profile, now);
  const quoteRows = quotations(random, profile, now);
  const orderRows = orders(random, profile, now);
  const productRows = products(random, profile);
  const messageRows = messages(random, profile, now);
  const contactRows = contacts(random, now);
  const meetingRows = meetings(random, now);
  const trafficRows = traffic(random, profile, now);

  const quotedCents = quoteRows.reduce(
    (sum, quote) => sum + quote.totalCents,
    0,
  );
  const wonCents = quoteRows
    .filter((quote) => quote.status === "Accepted")
    .reduce((sum, quote) => sum + quote.totalCents, 0);

  return {
    workspace: input.workspace,
    trade: profile.trade,
    currency: profile.currency,
    headline: [
      { label: "Open leads", value: String(leadRows.length) },
      { label: "Quotes out", value: money(quotedCents, profile.currency) },
      { label: "Won this month", value: money(wonCents, profile.currency) },
      { label: "Orders", value: String(orderRows.length) },
      {
        label: "Website visits (14 days)",
        value: String(trafficRows.totalSessions),
      },
      { label: "Messages waiting", value: String(messageRows.length) },
    ],
    leads: leadRows,
    contacts: contactRows,
    inquiries: profile.enquiries,
    meetings: meetingRows,
    quotations: quoteRows.map((quote) => ({
      ...quote,
      total: money(quote.totalCents, profile.currency),
    })),
    messages: messageRows,
    traffic: trafficRows,
    products: productRows,
    orders: orderRows,
  };
}
