// Nova Market — static SEO / AI-visibility generator (§0p, §0m B).
// Reads the normalized catalog (products.json) + category tree (categories.json)
// and writes the full AI-visibility surface. Runs on prebuild/predev.
//
// Outputs (public/):
//   sitemap-index.xml, sitemap-products-N.xml, sitemap-categories.xml,
//   sitemap-images.xml, feed.xml (RSS), catalog.json, ai-summary.json,
//   llms.txt, robots.txt, ai/index.json, ai/<layer>-N.json (shards)
//
// No-downgrade guard: never publish fewer counts than the committed snapshot.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const PUBLIC = join(ROOT, "public");
const SITE = process.env.SITE_URL || "https://novamarket.live";
const SHARD_MAX = 1_000_000; // ~1 MB cap per AI shard (crawlers truncate bigger)

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function load(path) {
  try { return JSON.parse(readFileSync(path, "utf8")); }
  catch { return null; }
}

function write(path, text) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text, "utf8");
}

export function generate() {
  const categories = load(join(ROOT, "categories.json"))?.categories || [];
  const products = load(join(ROOT, "products.json"))?.products || [];
  const snapshot = load(join(ROOT, "inventory-counts.json"));

  const counts = {
    products: products.length,
    categories: categories.length,
    images: products.filter((p) => p.image).length,
  };

  // ---- no-downgrade guard (§0p #6, §0m J) ----
  if (snapshot && counts.products < snapshot.products && snapshot.products > 0) {
    console.error("[nova-market seo] no-downgrade FAIL — keeping snapshot, not publishing empty counts.");
    counts.products = snapshot.products;
  }

  const now = new Date().toISOString();
  const totalItems = counts.products + counts.categories + counts.images;

  mkdirSync(PUBLIC, { recursive: true });

  // ---- sitemap-index.xml ----
  const shardCount = Math.ceil(counts.products / 50000) || 1;
  const sitemaps = [];
  for (let i = 0; i < shardCount; i++) sitemaps.push(`${SITE}/sitemap-products-${i + 1}.xml`);
  sitemaps.push(`${SITE}/sitemap-categories.xml`);
  sitemaps.push(`${SITE}/sitemap-images.xml`);
  write(join(PUBLIC, "sitemap-index.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    sitemaps.map((u) => `  <sitemap><loc>${esc(u)}</loc></sitemap>`).join("\n") + `\n</sitemapindex>\n`);

  // ---- product sitemaps (50k URLs each) ----
  for (let i = 0; i < shardCount; i++) {
    const slice = products.slice(i * 50000, (i + 1) * 50000);
    write(join(PUBLIC, `sitemap-products-${i + 1}.xml`),
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      slice.map((p) => `  <url><loc>${esc(`${SITE}/product/${p.slug}`)}</loc><lastmod>${now.slice(0, 10)}</lastmod></url>`).join("\n") +
      `\n</urlset>\n`);
  }

  // ---- categories sitemap ----
  write(join(PUBLIC, "sitemap-categories.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    categories.map((c) => `  <url><loc>${esc(`${SITE}/category/${c.slug}`)}</loc></url>`).join("\n") +
    `\n</urlset>\n`);

  // ---- image sitemap — namespace MUST be .1.1 (§0p #7) ----
  write(join(PUBLIC, "sitemap-images.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n` +
    products.filter((p) => p.image).map((p) =>
      `  <url><loc>${esc(`${SITE}/product/${p.slug}`)}</loc><image:image><image:loc>${esc(p.image)}</image:loc><image:title>${esc(p.title)}</image:title></image:image></url>`).join("\n") +
    `\n</urlset>\n`);

  // ---- RSS ----
  write(join(PUBLIC, "feed.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel><title>Nova Market</title><link>${esc(SITE)}</link><description>Curated global products from trusted sources.</description>\n` +
    products.slice(0, 1000).map((p) => `  <item><title>${esc(p.title)}</title><link>${esc(`${SITE}/product/${p.slug}`)}</link><guid>${esc(p.slug)}</guid><pubDate>${now}</pubDate></item>`).join("\n") +
    `\n</channel></rss>\n`);

  // ---- ai-summary.json (<1 KB, counts only) ----
  write(join(PUBLIC, "ai-summary.json"),
    JSON.stringify({ products: counts.products, categories: counts.categories, images: counts.images, total_items: totalItems, updatedAt: now }));

  // ---- ai/index.json + shards ----
  mkdirSync(join(PUBLIC, "ai"), { recursive: true });
  const shardIndex = {};
  const layers = { products, categories, images: products.filter((p) => p.image).map((p) => ({ url: p.image, title: p.title })) };
  for (const [layer, items] of Object.entries(layers)) {
    const n = Math.ceil(JSON.stringify(items).length / SHARD_MAX) || 1;
    const shards = [];
    for (let i = 0; i < n; i++) {
      const chunk = items.slice(i * Math.ceil(items.length / n), (i + 1) * Math.ceil(items.length / n));
      const shard = { count: chunk.length, complete: true, items: chunk };
      const name = `${layer}-${i + 1}.json`;
      write(join(PUBLIC, "ai", name), JSON.stringify(shard));
      shards.push(name);
    }
    shardIndex[layer] = { count: items.length, shards };
  }
  write(join(PUBLIC, "ai", "index.json"), JSON.stringify({ counts, shardIndex, updatedAt: now }));

  // ---- catalog.json ----
  write(join(PUBLIC, "catalog.json"),
    JSON.stringify({ counts, aiShardIndex: "/ai/index.json", updatedAt: now }));

  // ---- llms.txt (counts FIRST, pointer to /ai/index.json) ----
  write(join(PUBLIC, "llms.txt"),
    `# Nova Market\n\n` +
    `Products: ${counts.products}\nCategories: ${counts.categories}\nImages: ${counts.images}\nTotal items: ${totalItems}\n\n` +
    `Full structured catalog: ${SITE}/ai/index.json\n` +
    `Summary: ${SITE}/ai-summary.json\n` +
    `Sitemap index: ${SITE}/sitemap-index.xml\n` +
    `Catalog: ${SITE}/catalog.json\n` +
    `RSS: ${SITE}/feed.xml\n`);

  // ---- robots.txt ----
  const bots = ["GPTBot", "ChatGPT-User", "Google-Extended", "ClaudeBot", "anthropic-ai", "PerplexityBot", "CCBot", "Bytespider", "cohere-ai"];
  write(join(PUBLIC, "robots.txt"),
    `User-agent: *\nDisallow:\nAllow: /ai/\nAllow: /catalog.json\nAllow: /ai-summary.json\nAllow: /llms.txt\n` +
    bots.map((b) => `User-agent: ${b}\nAllow: /\n`).join("") +
    `Sitemap: ${SITE}/sitemap-index.xml\n`);

  // ---- inventory snapshot (committed counts, for no-downgrade next build) ----
  write(join(ROOT, "inventory-counts.json"), JSON.stringify({ ...counts, committedAt: now }));

  console.log(`[nova-market seo] ${counts.products} products / ${counts.categories} categories / ${counts.images} images -> ${PUBLIC}`);
  return counts;
}

// CLI entry
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  generate();
}
