// Nova Market — brand + provider config (single source of truth).
// Rename the platform by editing SITE_NAME / SITE_URL here — nothing else.
// Product is English (§0d). Chat with the Owner is Greek.

export const BRAND = {
  // NOTE: name not finalized (Owner leaning "buduhub.com"). This is the one
  // line to change when he decides. Internal working name kept neutral.
  name: "Nova Market",
  tagline: "Everything, one marketplace.",
  domain: "nova-market.broken-rain-2495.workers.dev",          // live preview until Owner picks the domain
  siteUrl: "https://nova-market.broken-rain-2495.workers.dev", // live preview
  support: "support@novaecosystem.live",
};

// Providers (network-hub engine). Affiliate-first: "we do nothing → they ship →
// we earn %". Each provider is a module in src/feed/adapter.mjs. Keys live in
// Cloudflare Worker Secrets, never in the repo (§0m E).
export const PROVIDERS = [
  { id: "aliexpress", name: "AliExpress", model: "affiliate", commission: "3-9%", cookie: "3d" },
  { id: "amazon", name: "Amazon", model: "affiliate", commission: "0-10%", cookie: "24h" },
  { id: "awin", name: "Awin", model: "affiliate", commission: "varies", cookie: "30d" },
  { id: "impact", name: "Impact", model: "affiliate", commission: "10-15%", cookie: "30d" },
  { id: "partnerstack", name: "PartnerStack", model: "affiliate", commission: "recurring", cookie: "30d" },
];
