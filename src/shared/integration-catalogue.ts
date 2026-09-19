/* oxlint-disable max-lines */
/**
 * Presentation metadata for the Integrations marketplace, ported from the
 * legacy CRM so a merchant sees the same catalogue they were shown there.
 *
 * Credentials are NOT part of this data. The legacy app stored provider
 * secrets in the database; Digital Urgency stores only a reference and reads the real
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
  /**
   * Offer a button that fills this field with a fresh random value. Only for
   * secrets this app chooses itself — never for one another service issues,
   * where a generated value would simply be wrong.
   */
  generate?: boolean;
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
    state: "connectable",
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
        placeholder: "From Dev Dashboard → App settings",
        help: "The public Client ID for the installed Dev Dashboard app.",
      },
      {
        key: "CLIENT_SECRET",
        label: "Client secret",
        type: "secret",
        required: true,
        placeholder: "Paste the app secret",
        help: "Stored encrypted. Digital Urgency exchanges it for a short-lived Shopify access token automatically.",
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
        "A Dev Dashboard app installed on a store in the same Shopify organization.",
        "Read access to products and inventory. We never request write access, customers or orders.",
      ],
    },
    howToConnect: [
      "In Shopify Dev Dashboard, create a version with only read_products and read_inventory, then release it.",
      "Install the app on the store from the app's Installs section.",
      "Open App settings and copy the Client ID and Client secret.",
      "Paste those credentials below with the store's .myshopify.com domain.",
    ],
    notes: [
      "You own and install the app from Shopify's Dev Dashboard, so you can revoke access at any time.",
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
    key: "elevenlabs",
    name: "ElevenLabs",
    tagline:
      "Phone calls answered by your AI voice agent, straight into the CRM",
    description:
      "When a call to your ElevenLabs agent ends, the transcript, summary and everything the agent captured arrive here. The caller becomes a CRM contact with a lead, returning callers are matched by phone number, and first-time callers can get a WhatsApp welcome.",
    category: "channels",
    state: "connectable",
    credentialFields: [
      {
        key: "WEBHOOK_SECRET",
        label: "Webhook secret",
        type: "secret",
        required: true,
        help: "Shown once when you create the post-call webhook in ElevenLabs (Settings → Webhooks).",
      },
      {
        key: "WELCOME_TEMPLATE",
        label: "WhatsApp welcome template (optional)",
        type: "text",
        required: false,
        placeholder: "HX… Content SID, or a Meta template name",
        help: "Sent once to first-time callers from your connected WhatsApp number. Must be an approved template: Twilio uses the Content SID, Meta the template name.",
      },
      {
        key: "CALLER_LOOKUP_SECRET",
        label: "Caller recognition secret (optional)",
        type: "secret",
        required: false,
        generate: true,
        help: "Click Generate, then copy it into ElevenLabs as the x-openseo-secret header of the conversation initiation webhook, so returning callers are greeted by name. This one is yours to choose — unlike the webhook secret above, which ElevenLabs issues.",
      },
    ],
    capabilities: [
      "post-call transcripts",
      "CRM contact and lead per caller",
      "WhatsApp welcome",
      "returning callers greeted by name",
    ],
    howToConnect: [
      "Type any placeholder in Webhook secret and click Connect. The webhook address then appears on this page; copy it.",
      "In ElevenLabs, open Settings → Webhooks, create a webhook with that address and HMAC authentication, and copy the secret it shows.",
      "Back here, replace the placeholder with that secret and save.",
      "In ElevenLabs, open your agent → Security → post-call webhook override, choose the new webhook and tick Transcript. Use the agent override, not the workspace default, so other agents' calls don't land in this business.",
      "Optionally add an approved WhatsApp template so first-time callers get a welcome.",
      "Optionally, to greet returning callers by name: click Generate beside the Caller recognition secret and save, then in ElevenLabs set the conversation initiation webhook to the caller recognition address on this page with header x-openseo-secret set to that value, and turn on fetching initiation data in the agent's Security tab.",
      "If you turn that on, also switch on the First message override in the same Security tab. A recognised caller is greeted by name, which replaces the agent's opening line, and ElevenLabs ends the call at zero seconds — \"Override for field 'first_message' is not allowed by config\" — if the agent does not allow it.",
    ],
  },
  {
    key: "deepgram",
    name: "Deepgram",
    tagline: "Calls to your website voice agent, straight into the CRM",
    description:
      "When a visitor finishes a call with the voice agent on your website, the transcript arrives here. The call is summarised, the caller becomes a CRM contact with a lead when they left a name, number or email, and the call appears in the Voice module next to your phone calls, labelled with the website agent's name.",
    category: "channels",
    state: "connectable",
    credentialFields: [
      {
        key: "WEBHOOK_SECRET",
        label: "Call log secret",
        type: "secret",
        required: true,
        generate: true,
        help: "Click Generate and save. Your website signs every call it sends with this value, so it goes into the website's settings too.",
      },
      {
        key: "WELCOME_TEMPLATE",
        label: "WhatsApp welcome template (optional)",
        type: "text",
        required: false,
        placeholder: "HX… Content SID, or a Meta template name",
        help: "Sent once to first-time callers who gave a mobile number. Must be an approved template: Twilio uses the Content SID, Meta the template name.",
      },
    ],
    capabilities: [
      "website call transcripts",
      "AI call summary",
      "CRM contact and lead per caller",
      "recap email and WhatsApp welcome",
    ],
    howToConnect: [
      "Click Generate beside Call log secret, then Connect. The call log address appears on this page.",
      "In your website's hosting settings (Lovable → Secrets), add VOICE_LOG_URL set to that address and VOICE_LOG_SECRET set to the same secret.",
      "Make a short test call on the website. It appears under Voice within a minute of hanging up.",
      "Calls where the visitor gave no name, number or email are logged but do not create a contact or lead.",
    ],
  },
  {
    key: "lovable",
    name: "Lovable site",
    tagline: "Send approved blog posts, with images, to your Lovable website",
    description:
      "Blog posts approved in Content Optimization are committed to this site's GitHub repository with a generated hero image and any in-article images. They appear in the Lovable editor straight away and go live when you click Publish in Lovable. Sending again updates the same post.",
    category: "channels",
    state: "connectable",
    credentialFields: [
      {
        key: "SITE_URL",
        label: "Live site address",
        type: "url",
        required: true,
        placeholder: "https://digitalurgency.com.au",
        help: "The address the blog is read at. A .lk address makes the images Sri Lankan; anything else, Australian.",
      },
      {
        key: "REPOSITORY",
        label: "GitHub repository",
        type: "text",
        required: true,
        placeholder: "WalidN1989/sprout-reach-studio",
        help: "The repository Lovable syncs this project with (Lovable → GitHub).",
      },
      {
        key: "BRANCH",
        label: "Branch (optional)",
        type: "text",
        required: false,
        placeholder: "main",
        help: "Leave empty for main.",
      },
      {
        key: "GITHUB_TOKEN",
        label: "GitHub token",
        type: "secret",
        required: true,
        help: "A fine-grained personal access token limited to this repository, with Contents: Read and write.",
      },
    ],
    capabilities: [
      "send approved blog posts",
      "generate hero and in-article images",
      "update existing posts",
    ],
    howToConnect: [
      "On GitHub: Settings → Developer settings → Fine-grained tokens → Generate new token.",
      "Repository access: Only select repositories → pick this site's repository. Permissions: Contents → Read and write. Generate and copy it.",
      "Here, enter the live site address, the repository (owner/name) and the token, then click Connect.",
      "Click Check now: it should count the posts already on the blog.",
      "Each project connects its own site, so an Australian post can never land on the Sri Lankan site.",
    ],
  },
  {
    key: "wordpress",
    name: "WordPress",
    tagline: "Publish approved articles to your site in one click",
    description:
      "Articles approved in Content Optimization go live on this WordPress site as posts, with their title, SEO description and web address. Publishing again updates the same post instead of making a copy.",
    category: "channels",
    state: "connectable",
    credentialFields: [
      {
        key: "SITE_URL",
        label: "Site address",
        type: "url",
        required: true,
        placeholder: "https://bookshopnearme.lk",
        help: "Your WordPress site, starting with https://.",
      },
      {
        key: "USERNAME",
        label: "WordPress username",
        type: "text",
        required: true,
        help: "An administrator or editor account.",
      },
      {
        key: "APPLICATION_PASSWORD",
        label: "Application Password",
        type: "secret",
        required: true,
        help: "WordPress admin → Users → Profile → Application Passwords: name it OpenSEO, click Add, and paste the password shown. It is not your login password.",
      },
    ],
    capabilities: ["publish approved articles", "update existing posts"],
    howToConnect: [
      "In WordPress admin, open Users → Profile → Application Passwords.",
      "Type OpenSEO as the name and click Add New Application Password; copy it.",
      "Here, enter the site address, your WordPress username and that password, then click Connect.",
      "Click Check now: it should say who you are logged in as.",
    ],
  },
  {
    key: "twilio_sms",
    name: "Twilio SMS",
    tagline: "Two-way texts from your Twilio number, inside the CRM",
    description:
      "Texts customers send to your Twilio number arrive in the SMS inbox, linked to their CRM contact, and your team (or an agent, within daily limits) can text back. STOP replies are honoured.",
    category: "channels",
    state: "connectable",
    credentialFields: [
      {
        key: "ACCOUNT_SID",
        label: "Account SID",
        type: "text",
        required: true,
        placeholder: "AC…",
        help: "Twilio Console → Account info, for the account that owns the number.",
      },
      {
        key: "AUTH_TOKEN",
        label: "Auth Token",
        type: "secret",
        required: true,
        help: "Twilio Console → Account info. Used to send texts and to check Twilio really sent each webhook.",
      },
      {
        key: "PHONE_NUMBER",
        label: "SMS number",
        type: "text",
        required: true,
        placeholder: "+19412974258",
        help: "The Twilio number texts go from, in international format.",
      },
    ],
    capabilities: [
      "two-way SMS inbox",
      "texts on the CRM lead page",
      "STOP opt-outs",
    ],
    howToConnect: [
      "Enter the Account SID, Auth Token and number, then click Connect.",
      "Copy the SMS webhook address shown on this page.",
      "In Twilio, open the number → Messaging configuration → A message comes in: paste the address, method HTTP POST, and save.",
      "Click Check now here to confirm the credentials, then text the number to test.",
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
