# Nova Market

China-sourced product platform built through NovaForge. **Affiliate-first, dropshipping-ready** (protocol §0s).

- **"We do nothing → they ship → we take %"** = the affiliate model (AliExpress affiliate, 3–9% commission).
- The €1→€3 markup is dropshipping and requires us to be the merchant; it's a later opt-in, not "do nothing".

## Status (honest)

- **LIVE preview** — `https://nova-market.broken-rain-2495.workers.dev`
- **PARTIAL** — full storefront (homepage + top-nav category hubs + category/product/search pages, server-rendered
  for SEO), affiliate redirect, D1 schema + 10 category hubs seeded, and the §0p AI-visibility stack (sitemaps,
  `catalog.json`, `ai-summary.json`, `ai/index.json`, `llms.txt`, `robots.txt`, `feed.xml`) served **dynamically**
  from live D1 counts.
- The **catalog is empty by design** (truth order §0e — no fake products). It fills only when the Owner's affiliate
  keys land and `/api/sync` pulls real items.

## Brand

Not finalized. Working name **Nova Market**. Owner is leaning toward `buduhub.com` (available; `baduhub.com` is taken).
Brand/domain are a one-line change in `src/config.js` + `wrangler.jsonc` `vars` — nothing else.

## Structure

```
categories.json            category tree (English, from badu.gr taxonomy; 10 top-level hubs)
products.json              normalized product catalog (feed output; empty until keys land)
src/config.js              brand + provider registry (one-line rename)
src/feed/adapter.mjs       feed adapter: AliExpress affiliate client (HMAC-signed) + normalizer + markup engine
scripts/generate-static-seo.mjs   §0p AI-visibility generator (build-time fallback; worker serves live)
scripts/seed-categories.mjs       seeds D1 categories from categories.json
public/                    storefront: index.html, styles.css (Aurora), app.js
worker/index.js            Cloudflare Worker: routes + server-side SEO + affiliate redirect + /api/sync ingest
worker/migrations/         D1 schema (categories, products, clicks)
wrangler.jsonc            worker + D1 + assets config
```

## Next (Owner action)

1. Apply for the AliExpress affiliate program at `portals.aliexpress.com` (account + ID + live domain).
2. Provide App Key + App Secret + Tracking ID → they go into Cloudflare Worker Secrets (never the repo).
3. Pick a domain + name → wire into Cloudflare like `novaaiapps.com` (I take it from there).

All other work is reversible and proceeds autonomously.
