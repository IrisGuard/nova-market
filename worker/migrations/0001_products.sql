-- Nova Market — D1 schema (Cloudflare D1, SQLite)
-- Affiliate-hub marketplace. Products are normalized from multiple providers
-- (AliExpress / Amazon / Awin / Impact / PartnerStack) via src/feed/adapter.mjs.
-- Truth order: no fake data — the catalog stays empty until the Owner's affiliate
-- keys land and ingest runs for real.

CREATE TABLE IF NOT EXISTS categories (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  slug         TEXT NOT NULL UNIQUE,
  parent_id    TEXT,
  sort         INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS products (
  id              TEXT PRIMARY KEY,
  slug            TEXT NOT NULL UNIQUE,
  title           TEXT NOT NULL,
  description     TEXT,
  provider        TEXT NOT NULL,
  provider_id     TEXT NOT NULL,
  category_id     TEXT,
  image           TEXT,
  images          TEXT DEFAULT '[]',
  price           REAL,
  price_currency  TEXT DEFAULT 'EUR',
  original_price  REAL,
  commission_rate TEXT,
  affiliate_url   TEXT,
  seller_rating   REAL,
  sales_volume    INTEGER DEFAULT 0,
  stock_status    TEXT DEFAULT 'in_stock',
  shipping        TEXT,
  created_date    TEXT,
  updated_date    TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_products_slug ON products(slug);
CREATE UNIQUE INDEX IF NOT EXISTS ux_products_provider ON products(provider, provider_id);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_created ON products(created_date DESC);

-- click/out tracking (honest affiliate attribution log)
CREATE TABLE IF NOT EXISTS clicks (
  id           TEXT PRIMARY KEY,
  product_slug TEXT,
  provider     TEXT,
  created_date TEXT
);
