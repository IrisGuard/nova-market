// Nova Market — static homepage renderer (local preview, Owner 2026-09-14).
//
// The Worker renders the homepage server-side from D1. For the local Nova Devs
// preview (which serves only static files) this script bakes the SAME homepage
// into public/index.html — real categories from categories.json, honest empty
// product state (0 products until the Owner's affiliate keys land and ingest
// runs). Truth order: no fake data, ever.
//
// Run: node scripts/render-homepage.mjs   (or via `npm run build` after wiring)

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const INDEX = join(ROOT, "public", "index.html");
const SITE = process.env.SITE_URL || "https://novamarket.live";

const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const CAT_ICONS = {
  "bags-shoes": "👜", "babies-kids": "🧸", "home-garden": "🪴", "watches-jewelry": "⌚",
  "auto-moto": "🚗", "tv-audio-gaming": "🎧", "health-beauty": "✨", "clothing": "👕",
  "sports": "🏃", "electronics": "🔌",
};

function load(p) {
  try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; }
}

const catNavLinks = (cats) =>
  `<a href="/" class="active">Home</a>` +
  cats.map((c) => `<a href="/category/${esc(c.slug)}">${esc(c.name)}</a>`).join("");

const catCards = (cats) =>
  cats.map((c) => `
    <a class="cat-card" href="/category/${esc(c.slug)}">
      <span class="ic" style="background:var(--bg-soft)">${CAT_ICONS[c.id] || "📦"}</span>
      <h3>${esc(c.name)}</h3>
      <p>Explore now</p>
    </a>`).join("");

const productCards = (prods) => {
  if (!prods.length) {
    return `<div style="grid-column:1/-1;color:var(--muted);padding:40px 0;text-align:center">Products are loading — the catalog opens as soon as our sourcing partners are connected.</div>`;
  }
  return prods.map((p) => {
    const was = p.original_price && p.original_price > p.price ? p.original_price : null;
    const fmt = (v, cur) => {
      if (v == null || isNaN(v)) return "—";
      return new Intl.NumberFormat("en", { style: "currency", currency: cur || "EUR" }).format(v);
    };
    return `
  <a class="prod-card" href="/product/${esc(p.slug)}">
    <span class="img">
      ${p.image ? `<img src="${esc(p.image)}" alt="${esc(p.title)}" loading="lazy" />` : `<span style="color:var(--faint)">no image</span>`}
      ${p.sales_volume > 500 ? `<span class="badge hot">HOT</span>` : ""}
    </span>
    <span class="body">
      <span class="title">${esc(p.title)}</span>
      <span class="price">${fmt(p.price, p.price_currency)}${was ? `<span class="was">${fmt(was, p.price_currency)}</span>` : ""}</span>
      <span class="meta"><span>${esc(p.provider)}</span><span>★ ${p.seller_rating || "—"}</span></span>
      <span class="ship">${p.stock_status === "in_stock" ? "In stock · ships worldwide" : "Check availability"}</span>
    </span>
  </a>`;
  }).join("");
};

export function renderHomepage() {
  if (!existsSync(INDEX)) return { ok: false, reason: "public/index.html not found" };
  const categories = load(join(ROOT, "categories.json"))?.categories || [];
  const products = load(join(ROOT, "products.json"))?.products || [];

  let html = readFileSync(INDEX, "utf8");
  html = html.replace(/<div class="container" id="catnav-inner">[\s\S]*?<\/div>/, `<div class="container" id="catnav-inner">${catNavLinks(categories)}</div>`);
  html = html.replace(/<div class="cat-grid" id="cat-grid"><!-- injected --><\/div>/, `<div class="cat-grid" id="cat-grid">${catCards(categories)}</div>`);
  html = html.replace(/<div class="prod-grid" id="hot-grid"><!-- injected --><\/div>/, `<div class="prod-grid" id="hot-grid">${productCards(products)}</div>`);
  html = html.replace(/data-stat-products>([^<]*)</, `data-stat-products>${products.length.toLocaleString("en-US")}<`);
  html = html.replace(/data-stat-categories>([^<]*)</, `data-stat-categories>${categories.length.toLocaleString("en-US")}<`);
  html = html.replace(/data-stat-brands>([^<]*)</, `data-stat-brands>${products.length.toLocaleString("en-US")}<`);

  writeFileSync(INDEX, html, "utf8");
  return { ok: true, categories: categories.length, products: products.length, site: SITE };
}

// CLI entry
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const r = renderHomepage();
  console.log(`[nova-market render-homepage] ${r.ok ? `ok: ${r.categories} categories / ${r.products} products → public/index.html` : r.reason}`);
}
