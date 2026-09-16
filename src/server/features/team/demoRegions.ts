/**
 * Where the sample business trades.
 *
 * The trade profile decides what is sold; this decides who buys it and in
 * what money. They are separate because a shoe shop in Colombo and one in
 * Brisbane sell the same shoes to different people at very different prices:
 * a Sri Lankan client shown +61 numbers and dollars learns nothing from the
 * example except that it was built for somebody else.
 */

export type DemoRegion = {
  key: string;
  country: string;
  currency: string;
  /** Mobile numbers as they are written locally, minus the subscriber part. */
  dialCode: string;
  mobilePrefixes: string[];
  /** Multiplies the trade profile's prices into local money. */
  priceFactor: number;
  suburbs: string[];
  /** Branches the voice agent answers for. */
  locations: string[];
  firstNames: string[];
  lastNames: string[];
  /**
   * What customers write in their own language, with an English gloss so the
   * page is readable by whoever is being shown it.
   */
  localMessages: { text: string; language: string; meaning: string }[];
};

const SRI_LANKA: DemoRegion = {
  key: "LK",
  country: "Sri Lanka",
  currency: "LKR",
  dialCode: "+94",
  mobilePrefixes: ["70", "71", "72", "75", "76", "77", "78"],
  priceFactor: 100,
  suburbs: [
    "Colombo 3",
    "Colombo 5",
    "Dehiwala",
    "Nugegoda",
    "Mount Lavinia",
    "Battaramulla",
    "Rajagiriya",
    "Moratuwa",
    "Kandy",
    "Negombo",
  ],
  locations: ["Colombo", "Kandy", "Galle", "Jaffna"],
  firstNames: [
    "Nimal",
    "Kasun",
    "Dilani",
    "Ishara",
    "Tharindu",
    "Amaya",
    "Ruwan",
    "Sachini",
    "Hasitha",
    "Nadeesha",
    "Priya",
    "Arun",
    "Vithya",
    "Mohamed",
    "Fathima",
    "Shanika",
    "Dinesh",
    "Kavitha",
  ],
  lastNames: [
    "Perera",
    "Fernando",
    "Silva",
    "Jayawardena",
    "Ratnayake",
    "Bandara",
    "Wickramasinghe",
    "Gunasekara",
    "Mendis",
    "Rajapaksa",
    "Selvarajah",
    "Thangaraj",
    "Ismail",
    "De Soysa",
  ],
  localMessages: [
    {
      text: "සයිස් 39 තියෙනවද?",
      language: "Sinhala",
      meaning: "Do you have size 39?",
    },
    {
      text: "අද කඩේ විවෘතද?",
      language: "Sinhala",
      meaning: "Is the shop open today?",
    },
    {
      text: "ඩෙලිවරි ගාස්තුව කීයද?",
      language: "Sinhala",
      meaning: "How much is the delivery charge?",
    },
    {
      text: "சைஸ் 39 இருக்கிறதா?",
      language: "Tamil",
      meaning: "Is size 39 available?",
    },
    {
      text: "இன்று கடை திறந்திருக்கிறதா?",
      language: "Tamil",
      meaning: "Is the shop open today?",
    },
    {
      text: "டெலிவரி கட்டணம் எவ்வளவு?",
      language: "Tamil",
      meaning: "How much is the delivery charge?",
    },
  ],
};

const AUSTRALIA: DemoRegion = {
  key: "AU",
  country: "Australia",
  currency: "AUD",
  dialCode: "+61",
  mobilePrefixes: ["4"],
  priceFactor: 1,
  suburbs: [
    "Chermside",
    "Carindale",
    "Toowong",
    "Springfield",
    "Logan",
    "Ipswich",
    "Redcliffe",
    "Sunnybank",
    "Ashgrove",
    "Cleveland",
  ],
  locations: ["Brisbane North", "Brisbane South", "Gold Coast"],
  firstNames: [
    "Tom",
    "Ella",
    "Marcus",
    "Grace",
    "Liam",
    "Chloe",
    "Ben",
    "Sofia",
    "Jack",
    "Amelia",
    "Hassan",
    "Priya",
    "Noah",
    "Ruby",
  ],
  lastNames: [
    "Walsh",
    "Brooks",
    "Doyle",
    "Carter",
    "Nguyen",
    "Kelly",
    "Murphy",
    "Hughes",
    "Bennett",
    "Fraser",
    "Mitchell",
    "O'Brien",
  ],
  localMessages: [],
};

const REGIONS = [SRI_LANKA, AUSTRALIA];

const TLDS: Record<string, string> = {
  lk: "LK",
  au: "AU",
};

/** The region a workspace trades in, read from its domain, Australia by default. */
export function demoRegionFor(domain?: string | null) {
  const host = (domain ?? "").trim().toLowerCase().replace(/\/+$/, "");
  const tld = host.split(".").filter(Boolean).at(-1) ?? "";
  const key = TLDS[tld] ?? "AU";
  return REGIONS.find((region) => region.key === key) ?? AUSTRALIA;
}
