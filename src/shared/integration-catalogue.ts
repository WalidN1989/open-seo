/**
 * Presentation metadata for the Integrations marketplace, ported from the
 * legacy CRM so a merchant sees the same catalogue they were shown there.
 *
 * Credentials are NOT part of this data. The legacy app stored provider
 * secrets in the database; OpenSEO stores only a reference and reads the real
 * value from the deployment environment, so an entry declares the environment
 * suffixes it needs and the connect flow asks for the reference instead of the
 * secret. Porting the old credential forms verbatim would undo that.
 */

export const integrationCategories = [
  { key: "all", label: "All" },
  { key: "channels", label: "Channels" },
  { key: "ecommerce", label: "Ecommerce" },
  { key: "payments", label: "Payments" },
  { key: "crm", label: "CRM" },
  { key: "automations", label: "Automations" },
  { key: "data", label: "Data" },
] as const;

export type IntegrationCategory = Exclude<
  (typeof integrationCategories)[number]["key"],
  "all"
>;

/**
 * `connectable` — a tenant can connect it today.
 * `built_in`   — already part of the product, nothing to connect.
 * `planned`    — on the roadmap; shown so the catalogue reads honestly rather
 *                than implying the list is everything we will ever support.
 */
export type IntegrationState = "connectable" | "built_in" | "planned";

export type IntegrationCredentialField = {
  /** Also the environment suffix, e.g. CONSUMER_SECRET. */
  key: string;
  label: string;
  /** "secret" is write-only: never sent back to the browser once stored. */
  type: "text" | "url" | "secret";
  required: boolean;
  placeholder?: string;
  help?: string;
};

export type IntegrationFeature = {
  title: string;
  bullets: readonly string[];
};

export type IntegrationCatalogueEntry = {
  key: string;
  name: string;
  tagline: string;
  description: string;
  category: IntegrationCategory;
  state: IntegrationState;
  /**
   * What this provider needs to authenticate. Rendered as real inputs the
   * tenant fills in; the key doubles as the environment suffix appended to a
   * credential reference for self-hosters using the deployment instead.
   */
  credentialFields?: readonly IntegrationCredentialField[];
  capabilities?: readonly string[];
  howToConnect?: readonly string[];
  notes?: readonly string[];
  /** Long-form context shown on the provider's own page. */
  detail?: {
    headline: string;
    intro: string;
    features: readonly IntegrationFeature[];
    requirements: readonly string[];
  };
  /** Only providers that can pull a catalogue show sync controls. */
  supportsCatalogueSync?: boolean;
};

export const integrationCatalogue: readonly IntegrationCatalogueEntry[] = [
  {
    key: "webhooks",
    name: "Webhooks",
    tagline: "Push events to any system you run",
    description:
      "Send a signed JSON POST to your own endpoint whenever something happens — a customer messages you, a campaign lands, an order is captured. Every request carries an HMAC signature so you can verify it came from us.",
    category: "automations",
    state: "built_in",
    notes: [
      "Destinations must be HTTPS, cannot point at private-network hosts, and redirects are not followed.",
      "Failed deliveries are retried automatically on a backoff.",
    ],
  },
  {
    key: "make",
    name: "Make",
    tagline: "Connect anything to your scenarios",
    description:
      "Trigger Make scenarios from workspace events and let Make drive work back into the workspace. Validated through its signing secret.",
    category: "automations",
    state: "connectable",
    credentialFields: [
      {
        key: "SIGNING_SECRET",
        label: "Signing secret",
        type: "secret",
        required: true,
        help: "From the Make webhook you want us to sign requests for.",
      },
    ],
    capabilities: ["scenarios", "signed webhooks", "app automation"],
  },
  {
    key: "woocommerce",
    name: "WooCommerce",
    tagline: "Bring your WooCommerce store into the workspace",
    description:
      "Connect your store with REST API keys you generate yourself — no app review and no waiting for approval. Products, prices and stock stay current for the assistant.",
    category: "ecommerce",
    state: "connectable",
    credentialFields: [
      {
        key: "BASE_URL",
        label: "Store URL",
        type: "url",
        required: true,
        placeholder: "https://your-store.com",
      },
      {
        key: "CONSUMER_KEY",
        label: "Consumer key",
        type: "text",
        required: true,
        placeholder: "ck_...",
      },
      {
        key: "CONSUMER_SECRET",
        label: "Consumer secret",
        type: "secret",
        required: true,
        placeholder: "cs_...",
        help: "WooCommerce, Settings, Advanced, REST API, Add key.",
      },
    ],
    capabilities: ["customers", "orders", "products"],
    supportsCatalogueSync: true,
    detail: {
      headline: "Your WooCommerce catalogue, inside the workspace",
      intro:
        "Connect your store and its products become the catalogue the whole workspace works from — searchable in chat, priced on orders, and counted in inventory. Authentication is REST API keys you generate in your own admin: no app review and no waiting for approval.",
      features: [
        {
          title: "Products stay current",
          bullets: [
            "Names, prices, descriptions and categories come from your store.",
            "Later syncs ask only for what changed since the last run.",
          ],
        },
        {
          title: "Stock arrives as movements",
          bullets: [
            "A stock difference is written to the ledger, not assigned over the top.",
            "A sync that agrees with your store writes nothing at all.",
          ],
        },
        {
          title: "Keeps itself current",
          bullets: [
            "Choose an interval and the workspace syncs on its own.",
            "Edit a price in WooCommerce and it appears here without anyone pressing a button.",
          ],
        },
      ],
      requirements: [
        "A WooCommerce store served over HTTPS.",
        "REST API keys with at least read permission.",
        "Read permission is enough; write is only needed to push changes back.",
      ],
    },
    howToConnect: [
      "In WooCommerce, go to Settings, Advanced, REST API and add a key with read access.",
      "Copy the store URL, consumer key and consumer secret into the form below.",
      "Connect; the keys are verified with a real authenticated request to your store before they are accepted.",
    ],
  },
  {
    key: "shopify",
    name: "Shopify",
    tagline: "Bring your Shopify store into the workspace",
    description:
      "Connect a Shopify store with keys the merchant creates in Shopify's own dashboard — nothing to install from us and no app-store review to wait for. Each variant syncs as its own row so per-variant prices and stock stay accurate.",
    category: "ecommerce",
    state: "planned",
    credentialFields: [
      {
        key: "SHOP_DOMAIN",
        label: "Store domain",
        type: "text",
        required: true,
        placeholder: "your-shop.myshopify.com",
        help: "The .myshopify.com domain, not your custom domain.",
      },
      {
        key: "CLIENT_ID",
        label: "Client ID",
        type: "text",
        required: true,
        help: "Shopify shows this under Settings once you have created the app.",
      },
      {
        key: "CLIENT_SECRET",
        label: "Client secret",
        type: "secret",
        required: true,
        placeholder: "From the same Settings page",
        help: "Stored server-side and never shown again after you save.",
      },
    ],
    capabilities: ["products", "variants", "inventory"],
    supportsCatalogueSync: true,
    detail: {
      headline: "Your Shopify catalogue, inside the workspace",
      intro:
        "Connect Shopify and the assistant answers from your real catalogue — titles, variants, prices, stock and a link straight to the product page. You create a small app on your own Shopify account and paste its two keys here; we never ask for your Shopify password, and you can revoke our access from your side whenever you like.",
      features: [
        {
          title: "Variants handled properly",
          bullets: [
            "Each variant syncs as its own row with its own SKU, price and stock.",
            "The assistant can tell a customer which size or edition is actually available.",
          ],
        },
        {
          title: "Live catalogue in chat",
          bullets: [
            "Product search answers from your synced Shopify products.",
            "Every reply carries the product link so customers can buy immediately.",
          ],
        },
        {
          title: "Stays current on its own",
          bullets: [
            "Scheduled syncs fetch only what changed since the last check.",
            "Edit a price in Shopify and it appears here without anyone pressing a button.",
          ],
        },
      ],
      requirements: [
        "A Shopify store you administer, signed in with the account that owns it.",
        "The app must be created from that same account — Shopify only issues keys when the app and the store belong to the same organisation.",
        "Read access to products and inventory. We never request write access, customers or orders.",
      ],
    },
    howToConnect: [
      "At dev.shopify.com, sign in with the account that owns your store and create an app.",
      "Give it any name. Under scopes add read_products and read_inventory, then click Release.",
      "Click Install app and choose your store.",
      "Open Settings, copy the Client ID and Client secret, and paste both below with your store domain.",
    ],
    notes: [
      "You create the app on your own Shopify account, so you stay in control of it and can revoke it at any time.",
      "Each Shopify variant becomes its own row, so per-variant prices and stock stay accurate.",
    ],
  },
  {
    key: "hunter",
    name: "Hunter.io",
    tagline: "Find and verify business email addresses",
    description:
      "Run a bounded domain search from the Leads workspace, import discovered people as CRM contacts, and create deduplicated pipeline leads carrying source and confidence context.",
    category: "data",
    state: "connectable",
    credentialFields: [
      { key: "API_KEY", label: "API key", type: "secret", required: true },
    ],
    capabilities: ["email finder", "email verifier", "domain search"],
    notes: ["Requires active Leads, CRM and Integrations access together."],
  },
  {
    key: "apify",
    name: "Apify",
    tagline: "Run actors and collect datasets",
    description:
      "Run an Apify actor with validated JSON input and inspect a bounded result preview, without the provider credential ever reaching the browser.",
    category: "data",
    state: "connectable",
    credentialFields: [
      {
        key: "API_TOKEN",
        label: "API token",
        type: "secret",
        required: true,
      },
    ],
    capabilities: ["actors", "datasets", "lead enrichment"],
  },
  {
    key: "firecrawl",
    name: "Firecrawl",
    tagline: "Scrape and extract from any page",
    description:
      "Scrape an HTTPS page through Firecrawl and retain a tenant audit record of what was run and by whom.",
    category: "data",
    state: "connectable",
    credentialFields: [
      { key: "API_KEY", label: "API key", type: "secret", required: true },
    ],
    capabilities: ["scrape", "crawl", "extract"],
  },
  {
    key: "claude_haiku",
    name: "Claude Haiku",
    tagline: "The conversation engine for WhatsApp",
    description:
      "Opt a tenant into AI replies. The assistant is forbidden from inventing business facts, can create order enquiries and flag conversations for staff, keeps replying after tool calls, and falls back to deterministic rules when the model is unavailable.",
    category: "channels",
    state: "connectable",
    credentialFields: [
      { key: "API_KEY", label: "API key", type: "secret", required: true },
    ],
    notes: [
      "Deployment alone does not enable it: a tenant needs a connected claude_haiku integration.",
      "Falls back to the platform ANTHROPIC_API_KEY when the connection sets no reference.",
    ],
  },
  {
    key: "custom",
    name: "Custom API",
    tagline: "Bring your own adapter",
    description:
      "A generic connection for a service with no first-class adapter yet, so a tenant can still store an API key and sign outbound webhooks.",
    category: "automations",
    state: "connectable",
    credentialFields: [
      { key: "API_KEY", label: "API key", type: "secret", required: true },
    ],
  },
  {
    key: "instagram",
    name: "Instagram",
    tagline: "Manage Instagram DMs and comments",
    description:
      "Handle Instagram direct messages and comments in the same shared inbox as WhatsApp, through the Meta Graph API already in use.",
    category: "channels",
    state: "planned",
    notes: [
      "Unlocked by Meta business verification and App Review for instagram_manage_messages.",
    ],
  },
  {
    key: "messenger",
    name: "Facebook Messenger",
    tagline: "Messenger conversations in the shared inbox",
    description:
      "Bring Facebook Page conversations into the same inbox as WhatsApp, using the same Meta app and webhook.",
    category: "channels",
    state: "planned",
    notes: ["Gated on App Review for pages_messaging."],
  },
  {
    key: "google_sheets",
    name: "Google Sheets",
    tagline: "Sync contacts and orders to a spreadsheet",
    description:
      "Mirror contacts, orders and campaign results into a Google Sheet the team already works in.",
    category: "data",
    state: "planned",
  },
  {
    key: "zoho",
    name: "Zoho CRM",
    tagline: "Keep contacts in sync with Zoho",
    description:
      "Two-way contact sync between Zoho CRM and the workspace, so sales and support see the same customer record.",
    category: "crm",
    state: "planned",
  },
  {
    key: "hubspot",
    name: "HubSpot",
    tagline: "Keep contacts in sync with HubSpot",
    description: "Two-way contact sync between HubSpot and the workspace.",
    category: "crm",
    state: "planned",
  },
  {
    key: "payhere",
    name: "PayHere",
    tagline: "Sri Lankan payment links in chat",
    description:
      "Generate PayHere payment links inside a conversation and mark the order paid when the callback lands.",
    category: "payments",
    state: "planned",
    notes: ["Needs a PayHere merchant account."],
  },
  {
    key: "stripe",
    name: "Stripe",
    tagline: "Card payments for international customers",
    description:
      "Take card payments through Stripe Checkout links shared in a conversation, reconciled against the order.",
    category: "payments",
    state: "planned",
  },
] as const;
