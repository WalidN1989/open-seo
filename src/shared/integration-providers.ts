export const integrationProviders = [
  {
    key: "apify",
    name: "Apify",
    capabilities: ["actors", "datasets", "lead enrichment"],
    credentialSuffixes: ["API_TOKEN"],
  },
  {
    key: "firecrawl",
    name: "Firecrawl",
    capabilities: ["scrape", "crawl", "extract"],
    credentialSuffixes: ["API_KEY"],
  },
  {
    key: "hunter",
    name: "Hunter.io",
    capabilities: ["email finder", "email verifier", "domain search"],
    credentialSuffixes: ["API_KEY"],
  },
  {
    key: "make",
    name: "Make",
    capabilities: ["scenarios", "signed webhooks", "app automation"],
    credentialSuffixes: ["SIGNING_SECRET"],
  },
  {
    key: "woocommerce",
    name: "WooCommerce",
    capabilities: ["customers", "orders", "products"],
    credentialSuffixes: ["BASE_URL", "CONSUMER_KEY", "CONSUMER_SECRET"],
  },
  {
    key: "custom",
    name: "Custom API",
    capabilities: ["signed webhooks", "custom adapter"],
    credentialSuffixes: ["API_KEY"],
  },
] as const;
