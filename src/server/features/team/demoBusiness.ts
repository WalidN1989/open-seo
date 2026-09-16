import { demoProfileFor, type DemoProfile } from "./demoProfiles";
import { demoRegionFor, type DemoRegion } from "./demoRegions";

/**
 * A worked example of a business, generated rather than stored.
 *
 * Nothing here is written to the database, which is the whole point: the
 * switch that turns it on changes what one person is shown and nothing else,
 * so turning it off restores the workspace exactly, and a workspace with real
 * data in it can never be confused with this.
 *
 * The figures are drawn from a seeded generator, so the same workspace sees
 * the same business every time. A client who reloads and finds different
 * numbers learns that none of it is real; a stable example reads like a shop.
 *
 * It opens on the phone and the messages rather than the pipeline, because
 * that is what the system does that a spreadsheet cannot: answer the call
 * nobody was there for, take the order, and write down what it could not sell.
 */

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

function person(random: Random, region: DemoRegion) {
  return `${pick(random, region.firstNames)} ${pick(random, region.lastNames)}`;
}

/** A mobile number written the way it is written in that country. */
function phone(random: Random, region: DemoRegion) {
  const prefix = pick(random, region.mobilePrefixes);
  const digits = region.key === "LK" ? 7 : 8;
  const body = Array.from({ length: digits }, () => between(random, 0, 9)).join(
    "",
  );
  const spaced = body.replace(/(\d{3})(?=\d)/g, "$1 ");
  return `${region.dialCode} ${prefix} ${spaced}`;
}

function money(cents: number, region: DemoRegion) {
  return `${region.currency} ${(cents / 100).toLocaleString("en-AU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Local money, from a price written in the trade profile's base units. */
function local(baseCents: number, region: DemoRegion) {
  return baseCents * region.priceFactor;
}

function leads(
  random: Random,
  profile: DemoProfile,
  region: DemoRegion,
  now: Date,
) {
  return Array.from({ length: 8 }, () => ({
    name: person(random, region),
    wants: pick(random, profile.enquiries),
    stage: pick(random, STAGES),
    suburb: pick(random, region.suburbs),
    createdAt: daysAgo(between(random, 0, 21), now),
  }));
}

function contacts(random: Random, region: DemoRegion, now: Date) {
  return Array.from({ length: 6 }, () => ({
    name: person(random, region),
    phone: phone(random, region),
    lastContactedAt: daysAgo(between(random, 0, 30), now),
    orders: between(random, 0, 12),
  }));
}

function meetings(random: Random, region: DemoRegion, now: Date) {
  const kinds = ["Call back", "Site visit", "Showroom fitting", "Video call"];
  return Array.from({ length: 4 }, () => ({
    with: person(random, region),
    kind: pick(random, kinds),
    at: daysAgo(-between(random, 1, 9), now),
  }));
}

function quotations(random: Random, region: DemoRegion, now: Date) {
  const statuses = ["Sent", "Sent", "Accepted", "Draft", "Expired"];
  return Array.from({ length: 6 }, (_, index) => ({
    number: `Q-10${20 + index}`,
    client: person(random, region),
    totalCents: local(between(random, 180, 900) * 10_000, region) / 100,
    status: pick(random, statuses),
    sentAt: daysAgo(between(random, 1, 18), now),
  }));
}

/**
 * The inbox as it actually looks in Sri Lanka: some of it in Sinhala or
 * Tamil, because that is what customers write. The English gloss travels with
 * the message so the page is readable by whoever is being shown it.
 */
function messages(
  random: Random,
  profile: DemoProfile,
  region: DemoRegion,
  now: Date,
) {
  return Array.from({ length: 6 }, (_, index) => {
    const localMessage =
      region.localMessages.length > 0 && index % 2 === 0
        ? pick(random, region.localMessages)
        : null;
    return {
      from: person(random, region),
      text: localMessage?.text ?? pick(random, profile.enquiries),
      language: localMessage?.language ?? null,
      meaning: localMessage?.meaning ?? null,
      channel: pick(random, ["SMS", "WhatsApp", "WhatsApp"]),
      at: daysAgo(between(random, 0, 6), now),
    };
  });
}

function products(random: Random, profile: DemoProfile, region: DemoRegion) {
  return profile.products.map((product) => {
    const onHand = between(random, 0, 90);
    return {
      name: product.name,
      price: money(local(product.priceCents, region), region),
      onHand,
      status: onHand === 0 ? "Out of stock" : onHand < 10 ? "Low" : "In stock",
      soldThisMonth: between(random, 20, 180),
    };
  });
}

function orders(random: Random, region: DemoRegion, now: Date) {
  const statuses = ["Paid", "Packing", "Shipped", "Delivered", "Refunded"];
  const placedBy = ["Voice agent", "WhatsApp", "Website", "In store"];
  return Array.from({ length: 8 }, (_, index) => ({
    number: `#${1400 + index}`,
    customer: person(random, region),
    total: money(local(between(random, 40, 320) * 1_000, region), region),
    status: pick(random, statuses),
    placedVia: pick(random, placedBy),
    placedAt: daysAgo(between(random, 0, 12), now),
  }));
}

function traffic(random: Random, profile: DemoProfile, now: Date) {
  const days = Array.from({ length: 14 }, (_, index) => ({
    date: daysAgo(13 - index, now).slice(0, 10),
    sessions: between(random, 280, 900),
  }));
  const total = days.reduce((sum, day) => sum + day.sessions, 0);
  let left = 100;
  const channels = profile.channels.map((channel, index) => {
    const share =
      index === profile.channels.length - 1 ? left : between(random, 8, 30);
    left = Math.max(0, left - share);
    return { channel, share };
  });
  return { days, totalSessions: total, channels };
}

/** Recent calls the agent took, with what it did about each. */
function voiceCalls(
  random: Random,
  profile: DemoProfile,
  region: DemoRegion,
  now: Date,
) {
  const outcomes = [
    "Order placed",
    "Order placed",
    "Booked a call back",
    "Out of stock — logged",
    "Answered, no action",
  ];
  return Array.from({ length: 6 }, () => ({
    caller: person(random, region),
    number: phone(random, region),
    location: pick(random, region.locations),
    intent: pick(random, profile.voiceIntents),
    outcome: pick(random, outcomes),
    minutes: between(random, 1, 7),
    at: daysAgo(between(random, 0, 5), now),
  }));
}

/**
 * What the agent could not sell.
 *
 * A call that ends in "we don't have it" is the one a business never hears
 * about. The agent writes the item down and the CRM hands it to whoever
 * orders stock, which is the whole argument for having it answer the phone.
 */
function restockQueue(
  random: Random,
  profile: DemoProfile,
  region: DemoRegion,
) {
  const states = [
    "Passed to purchasing",
    "Ordered from supplier",
    "Awaiting supplier",
    "Back in stock",
  ];
  return profile.products.slice(0, 4).map((product) => ({
    item: product.name,
    asked: between(random, 4, 26),
    lastAskedBy: person(random, region),
    state: pick(random, states),
  }));
}

function locations(random: Random, region: DemoRegion) {
  return region.locations.map((name) => ({
    name,
    calls: between(random, 60, 260),
    orders: between(random, 8, 60),
    afterHours: between(random, 10, 90),
  }));
}

/** Fourteen days of what the phone and WhatsApp did, as four lines. */
function communicationDays(random: Random, now: Date) {
  return Array.from({ length: 14 }, (_, index) => {
    const calls = between(random, 18, 52);
    return {
      date: daysAgo(13 - index, now).slice(0, 10),
      calls,
      voiceOrders: between(random, 2, Math.max(3, Math.round(calls * 0.35))),
      outOfStock: between(random, 0, 6),
      whatsapp: between(random, 20, 70),
    };
  });
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
  const region = demoRegionFor(input.domain);
  const random = seeded(input.seed);

  const days = communicationDays(random, now);
  const callsTaken = days.reduce((sum, day) => sum + day.calls, 0);
  const voiceOrders = days.reduce((sum, day) => sum + day.voiceOrders, 0);
  const outOfStock = days.reduce((sum, day) => sum + day.outOfStock, 0);
  const whatsappChats = days.reduce((sum, day) => sum + day.whatsapp, 0);
  const whatsappOrders = Math.round(whatsappChats * 0.28);

  const locationRows = locations(random, region);
  const callRows = voiceCalls(random, profile, region, now);
  const restockRows = restockQueue(random, profile, region);
  const leadRows = leads(random, profile, region, now);
  const quoteRows = quotations(random, region, now);
  const orderRows = orders(random, region, now);
  const productRows = products(random, profile, region);
  const messageRows = messages(random, profile, region, now);
  const contactRows = contacts(random, region, now);
  const meetingRows = meetings(random, region, now);
  const trafficRows = traffic(random, profile, now);

  const openLeads = between(random, 38, 62);
  const quotedCents = local(between(random, 1_000, 2_000) * 10_000, region);
  const wonCents = local(between(random, 5_000, 7_000) * 10_000, region);
  const monthOrders = between(random, 120, 260);

  return {
    workspace: input.workspace,
    trade: profile.trade,
    country: region.country,
    currency: region.currency,
    /**
     * The phone and the messages first: colour is a label here, not a scale,
     * so each tile carries its own words and the number stays in ink.
     */
    communication: [
      {
        label: "Calls answered by the voice agent",
        value: String(callsTaken),
        tone: "voice",
      },
      {
        label: "Orders placed through voice",
        value: String(voiceOrders),
        tone: "orders",
      },
      {
        label: "Out-of-stock inquiries captured",
        value: String(outOfStock),
        tone: "stock",
      },
      {
        label: "WhatsApp conversations",
        value: String(whatsappChats),
        tone: "whatsapp",
      },
      {
        label: "WhatsApp order placements",
        value: String(whatsappOrders),
        tone: "orders",
      },
      {
        label: "Answered after hours",
        value: String(
          locationRows.reduce((sum, row) => sum + row.afterHours, 0),
        ),
        tone: "afterHours",
      },
    ],
    communicationDays: days,
    locations: locationRows,
    voiceCalls: callRows,
    restockQueue: restockRows,
    headline: [
      { label: "Open leads", value: String(openLeads) },
      { label: "Quotes out", value: money(quotedCents, region) },
      { label: "Won this month", value: money(wonCents, region) },
      { label: "Orders this month", value: String(monthOrders) },
      {
        label: "Website visits (14 days)",
        value: String(trafficRows.totalSessions),
      },
      { label: "Messages waiting", value: String(between(random, 18, 40)) },
    ],
    leads: leadRows,
    contacts: contactRows,
    inquiries: profile.enquiries,
    meetings: meetingRows,
    quotations: quoteRows.map((quote) => ({
      ...quote,
      total: money(quote.totalCents, region),
    })),
    messages: messageRows,
    traffic: trafficRows,
    products: productRows,
    orders: orderRows,
  };
}
