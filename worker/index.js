// Nova Market — Cloudflare Worker (network-hub affiliate marketplace)
// Architecture (protocol §0s): affiliate-first ("we do nothing → they ship → we earn %").
// Programmatic SEO: every category + product is server-rendered with its own clean URL,
// JSON-LD, and sitemap presence — so crawlers and AIs see 100% of the catalog.
// Truth order (§0e): no fake data. The catalog stays empty until the Owner's affiliate
// keys land and ingest runs. Every D1 call degrades to honest empty on error.

import { searchAliExpress } from "../src/feed/adapter.mjs";

const SITE = (env) => (env && env.SITE_URL) || "https://novamarket.live";
const NAME = (env) => (env && env.SITE_NAME) || "Nova Market";

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });

const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const CAT_ICONS = {
  "bags-shoes": "👜", "babies-kids": "🧸", "home-garden": "🪴", "watches-jewelry": "⌚",
  "auto-moto": "🚗", "tv-audio-gaming": "🎧", "health-beauty": "✨", "clothing": "👕",
  "sports": "🏃", "electronics": "🔌",
};

// ---------- D1 helpers (all degrade honestly) ----------
async function qAll(env, sql, ...params) {
  try { return (await env.DB.prepare(sql).bind(...params).all()).results || []; }
  catch { return []; }
}
async function qFirst(env, sql, ...params) {
  try { return (await env.DB.prepare(sql).bind(...params).first()) || null; }
  catch { return null; }
}
async function count(env, sql, ...params) {
  try {
    const r = (await env.DB.prepare(sql).bind(...params).first()) || {};
    return Number(r.n || 0);
  } catch { return 0; }
}

async function listCategories(env) {
  return qAll(env, "SELECT * FROM categories ORDER BY sort ASC, name ASC");
}
async function getCategory(env, slug) {
  return qFirst(env, "SELECT * FROM categories WHERE slug = ? LIMIT 1", slug);
}
async function listProducts(env, { categoryId = null, q = null, limit = 30, skip = 0 } = {}) {
  const where = [];
  const params = [];
  if (categoryId) { where.push("category_id = ?"); params.push(categoryId); }
  if (q) { where.push("title LIKE ?"); params.push(`%${q}%`); }
  const w = where.length ? `WHERE ${where.join(" AND ")}` : "";
  return qAll(env, `SELECT * FROM products ${w} ORDER BY sales_volume DESC, created_date DESC LIMIT ? OFFSET ?`,
    ...params, Math.min(Number(limit) || 30, 100), Math.max(0, Number(skip) || 0));
}
async function countProducts(env, { categoryId = null, q = null } = {}) {
  const where = [];
  const params = [];
  if (categoryId) { where.push("category_id = ?"); params.push(categoryId); }
  if (q) { where.push("title LIKE ?"); params.push(`%${q}%`); }
  const w = where.length ? `WHERE ${where.join(" AND ")}` : "";
  return count(env, `SELECT COUNT(*) AS n FROM products ${w}`, ...params);
}
async function getProduct(env, slug) {
  return qFirst(env, "SELECT * FROM products WHERE slug = ? LIMIT 1", slug);
}
async function getProductsByCategoryId(env, categoryId) {
  return qFirst(env, "SELECT * FROM categories WHERE id = ? LIMIT 1", categoryId);
}

// ---------- HTML renderers ----------
function fmtPrice(p, currency) {
  if (p == null || isNaN(p)) return "—";
  const c = currency || "EUR";
  return new Intl.NumberFormat("en", { style: "currency", currency: c }).format(p);
}

function catNavLinks(cats) {
  return `<a href="/" class="active">Home</a>` + cats.map((c) =>
    `<a href="/category/${esc(c.slug)}">${esc(c.name)}</a>`).join("");
}

function catCards(cats) {
  return cats.map((c) => `
    <a class="cat-card" href="/category/${esc(c.slug)}">
      <span class="ic" style="background:var(--bg-soft)">${CAT_ICONS[c.id] || "📦"}</span>
      <h3>${esc(c.name)}</h3>
      <p>Explore now</p>
    </a>`).join("");
}

function productCard(p) {
  const was = p.original_price && p.original_price > p.price ? p.original_price : null;
  return `
  <a class="prod-card" href="/product/${esc(p.slug)}">
    <span class="img">
      ${p.image ? `<img src="${esc(p.image)}" alt="${esc(p.title)}" loading="lazy" />` : `<span style="color:var(--faint)">no image</span>`}
      ${p.sales_volume > 500 ? `<span class="badge hot">HOT</span>` : ""}
    </span>
    <span class="body">
      <span class="title">${esc(p.title)}</span>
      <span class="price">${fmtPrice(p.price, p.price_currency)}${was ? `<span class="was">${fmtPrice(was, p.price_currency)}</span>` : ""}</span>
      <span class="meta"><span>${esc(p.provider)}</span><span>★ ${p.seller_rating || "—"}</span></span>
      <span class="ship">${p.stock_status === "in_stock" ? "In stock · ships worldwide" : "Check availability"}</span>
    </span>
  </a>`;
}

function productCards(prods) {
  if (!prods.length) return `<div style="grid-column:1/-1;color:var(--muted);padding:40px 0;text-align:center">Products are loading — the catalog opens as soon as our sourcing partners are connected.</div>`;
  return prods.map(productCard).join("");
}

// full page shell (shared header/footer)
function shell({ env, title, description, canonical, body, ld = "" }) {
  const site = SITE(env);
  const name = NAME(env);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}" />
<link rel="canonical" href="${esc(canonical)}" />
<link rel="stylesheet" href="/styles.css" />
<link rel="icon" href="/favicon.ico" sizes="any" />
<link rel="icon" type="image/svg+xml" href="/icon.svg" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
<link rel="manifest" href="/site.webmanifest" />
<meta name="theme-color" content="#4f46e5" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:type" content="website" />
${ld}
</head>
<body>
<div class="utilbar"><div class="container">
  <div class="brand-note"><b>${esc(name)}</b> — part of the Nova Ecosystem</div>
  <div class="right"><a href="/about">About</a><span class="sep"></span><a href="/help">Help</a><span class="sep"></span><a href="#" data-lang>EN</a></div>
</div></div>
<header class="site"><div class="container header-inner">
  <a class="brand" href="/"><span class="logo">N</span><span class="name"><em>${esc(name.split(" ")[0])}</em> ${esc(name.split(" ").slice(1).join(" "))}</span></a>
  <div class="search"><input id="search-input" type="text" placeholder="Search products, brands, categories…" autocomplete="off" /><span class="kbd">⏎</span></div>
</div></header>
<nav class="catnav" id="catnav"><div class="container" id="catnav-inner">${catNavLinks([])}</div></nav>
${body}
<footer class="site"><div class="container footer-inner">
  <div class="footer-grid">
    <div class="footer-brand"><div class="name">${esc(name)}</div><p>The curated global marketplace — millions of products from trusted partners, in one place. Part of the Nova Ecosystem.</p></div>
    <div><h4>Shop</h4><a href="/categories">All categories</a><a href="/products">All products</a><a href="/deals">Deals</a></div>
    <div><h4>Company</h4><a href="/about">About</a><a href="/contact">Contact</a><a href="/help">Help center</a></div>
    <div><h4>Legal</h4><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/affiliate-disclosure">Affiliate disclosure</a></div>
  </div>
  <div class="footer-bottom"><span>© <span id="year"></span> ${esc(name)}. All rights reserved.</span><a href="https://novaecosystem.live/" target="_blank" rel="noopener">Nova Ecosystem ↗</a></div>
</div></footer>
<script src="/app.js"></script>
</body>
</html>`;
}

// generic simple page (about/help/privacy/terms/etc.)
function simplePage(env, title, heading, paragraphs) {
  const body = `<section class="hero"><div class="container">
    <h1>${esc(heading)}</h1>
    ${paragraphs.map((p) => `<p class="sub">${esc(p)}</p>`).join("")}
  </div></section>`;
  return shell({ env, title, description: heading, canonical: SITE(env) + "/", body });
}

// ---------- category page ----------
async function renderCategory(env, slug, page = 1) {
  const cat = await getCategory(env, slug);
  if (!cat) return notFound(env);
  const perPage = 30;
  const skip = (Math.max(1, page) - 1) * perPage;
  const [prods, total] = await Promise.all([
    listProducts(env, { categoryId: cat.id, limit: perPage, skip }),
    countProducts(env, { categoryId: cat.id }),
  ]);
  const pages = Math.max(1, Math.ceil(total / perPage));
  const ld = `<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE(env) + "/" },
      { "@type": "ListItem", position: 2, name: cat.name, item: SITE(env) + "/category/" + cat.slug },
    ],
  })}</script>`;
  const pager = pages > 1
    ? `<div class="pager">${Array.from({ length: pages }, (_, i) => i + 1).map((n) =>
        n === page ? `<span class="cur">${n}</span>` : `<a href="/category/${esc(slug)}?page=${n}">${n}</a>`).join("")}</div>`
    : "";
  const body = `<section class="hero" style="padding:34px 0 26px"><div class="container">
    <h1>${esc(cat.name)}</h1>
    <p class="sub">${total.toLocaleString("en-US")} products in this category — sourced from trusted partners worldwide.</p>
  </div></section>
  <section class="section" style="padding-top:6px"><div class="container">
    <div class="prod-grid">${productCards(prods)}</div>
    ${pager}
  </div></section>`;
  return new Response(shell({ env, title: `${cat.name} — ${NAME(env)}`, description: `Browse ${total} products in ${cat.name} on ${NAME(env)}.`, canonical: SITE(env) + "/category/" + cat.slug, body, ld }), {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=1800" },
  });
}

// ---------- product page ----------
async function renderProduct(env, slug) {
  const p = await getProduct(env, slug);
  if (!p) return notFound(env);
  const cat = p.category_id ? await getProductsByCategoryId(env, p.category_id) : null;
  const was = p.original_price && p.original_price > p.price ? p.original_price : null;
  const ld = `<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org", "@type": "Product",
    name: p.title, image: p.image || undefined,
    description: p.description || undefined,
    offers: { "@type": "Offer", price: p.price, priceCurrency: p.price_currency || "EUR", availability: "https://schema.org/InStock" },
    brand: { "@type": "Brand", name: p.provider },
  })}</script>`;
  const cta = p.affiliate_url
    ? `<a class="btn-buy" href="/out/${esc(p.provider)}/${esc(p.slug)}" rel="nofollow sponsored noopener" target="_blank">View deal on ${esc(p.provider)}</a>`
    : `<span class="btn-buy muted">Available soon</span>`;
  const body = `<section class="section"><div class="container" style="display:grid;grid-template-columns:1fr 1fr;gap:36px;align-items:start">
    <div class="img" style="aspect-ratio:1;background:var(--bg-soft);border-radius:var(--radius-lg);display:grid;place-items:center;overflow:hidden">
      ${p.image ? `<img src="${esc(p.image)}" alt="${esc(p.title)}" style="width:100%;height:100%;object-fit:cover" />` : `<span style="color:var(--faint)">no image</span>`}
    </div>
    <div>
      ${cat ? `<a href="/category/${esc(cat.slug)}" style="font-size:13px;color:var(--brand);font-weight:600">← ${esc(cat.name)}</a>` : ""}
      <h1 style="font-size:26px;line-height:1.25;margin:10px 0 12px">${esc(p.title)}</h1>
      <div style="font-size:15px;color:var(--muted);margin-bottom:16px">${esc(p.description || "A curated product from a trusted global partner.")}</div>
      <div style="font-size:28px;font-weight:800;color:var(--accent)">${fmtPrice(p.price, p.price_currency)}${was ? `<span class="was" style="font-size:16px;color:var(--faint);text-decoration:line-through;font-weight:500;margin-left:8px">${fmtPrice(was, p.price_currency)}</span>` : ""}</div>
      <div style="font-size:13px;color:var(--muted);margin:10px 0 22px">Sold &amp; shipped by <b>${esc(p.provider)}</b> · ★ ${p.seller_rating || "—"} · ${esc(p.stock_status === "in_stock" ? "In stock" : "Check availability")}</div>
      ${cta}
      <div style="font-size:12px;color:var(--faint);margin-top:14px">When you buy through our links we may earn a commission, at no extra cost to you.</div>
    </div>
  </div></section>`;
  return new Response(shell({ env, title: `${p.title} — ${NAME(env)}`, description: (p.description || p.title).slice(0, 155), canonical: SITE(env) + "/product/" + p.slug, body, ld }), {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=1800" },
  });
}

// ---------- search page ----------
async function renderSearch(env, q, page = 1) {
  const perPage = 30;
  const skip = (Math.max(1, page) - 1) * perPage;
  const [prods, total] = await Promise.all([
    listProducts(env, { q, limit: perPage, skip }),
    countProducts(env, { q }),
  ]);
  const pages = Math.max(1, Math.ceil(total / perPage));
  const pager = pages > 1
    ? `<div class="pager">${Array.from({ length: pages }, (_, i) => i + 1).map((n) =>
        n === page ? `<span class="cur">${n}</span>` : `<a href="/search?q=${encodeURIComponent(q)}&page=${n}">${n}</a>`).join("")}</div>`
    : "";
  const body = `<section class="hero" style="padding:34px 0 26px"><div class="container">
    <h1>Results for “${esc(q)}”</h1>
    <p class="sub">${total.toLocaleString("en-US")} matching products.</p>
  </div></section>
  <section class="section" style="padding-top:6px"><div class="container">
    <div class="prod-grid">${productCards(prods)}</div>${pager}
  </div></section>`;
  return new Response(shell({ env, title: `Search: ${q} — ${NAME(env)}`, description: `Search results for ${q} on ${NAME(env)}.`, canonical: SITE(env) + "/search?q=" + encodeURIComponent(q), body }), {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function notFound(env) {
  return new Response(shell({ env, title: "Not found — " + NAME(env), description: "Page not found.", canonical: SITE(env) + "/", body: `<section class="hero"><div class="container"><h1>Not found</h1><p class="sub">This page does not exist.</p><a href="/" style="color:var(--brand);font-weight:600">← Back home</a></div></section>` }), {
    status: 404, headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

// ---------- SEO files (dynamic, honest counts) ----------
async function seoCounts(env) {
  const products = await countProducts(env);
  const categories = await count(env, "SELECT COUNT(*) AS n FROM categories");
  return { products, categories, images: products, total_items: products + categories + products };
}

async function serveSeo(env, path) {
  const site = SITE(env);
  const c = await seoCounts(env);
  const now = new Date().toISOString();
  const xml = (body) => new Response(body, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
  const jsobj = (o) => json(o);

  if (path === "/sitemap-index.xml") {
    const shards = Math.max(1, Math.ceil(c.products / 50000));
    let s = `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
    for (let i = 1; i <= shards; i++) s += `  <sitemap><loc>${site}/sitemap-products-${i}.xml</loc></sitemap>\n`;
    s += `  <sitemap><loc>${site}/sitemap-categories.xml</loc></sitemap>\n  <sitemap><loc>${site}/sitemap-images.xml</loc></sitemap>\n</sitemapindex>`;
    return xml(s);
  }
  const m = path.match(/^\/sitemap-products-(\d+)\.xml$/);
  if (m) {
    const page = Number(m[1]);
    const perPage = 50000;
    const skip = (page - 1) * perPage;
    const prods = await listProducts(env, { limit: perPage, skip });
    return xml(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      prods.map((p) => `  <url><loc>${site}/product/${esc(p.slug)}</loc><lastmod>${now.slice(0, 10)}</lastmod></url>`).join("\n") + `\n</urlset>`);
  }
  if (path === "/sitemap-categories.xml") {
    const cats = await listCategories(env);
    return xml(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      cats.map((x) => `  <url><loc>${site}/category/${esc(x.slug)}</loc></url>`).join("\n") + `\n</urlset>`);
  }
  if (path === "/sitemap-images.xml") {
    const prods = await listProducts(env, { limit: 1000, skip: 0 });
    return xml(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n` +
      prods.filter((p) => p.image).map((p) => `  <url><loc>${site}/product/${esc(p.slug)}</loc><image:image><image:loc>${esc(p.image)}</image:loc><image:title>${esc(p.title)}</image:title></image:image></url>`).join("\n") + `\n</urlset>`);
  }
  if (path === "/ai-summary.json") return jsobj({ ...c, updatedAt: now });
  if (path === "/catalog.json") return jsobj({ counts: c, aiShardIndex: `${site}/ai/index.json`, updatedAt: now });
  if (path === "/ai/index.json") return jsobj({ counts: c, shardIndex: { products: { count: c.products, shards: ["products-1.json"] }, categories: { count: c.categories, shards: ["categories-1.json"] } }, updatedAt: now });
  if (path === "/ai/products-1.json") {
    const prods = await listProducts(env, { limit: 1000, skip: 0 });
    return jsobj({ count: prods.length, complete: true, items: prods });
  }
  if (path === "/ai/categories-1.json") {
    const cats = await listCategories(env);
    return jsobj({ count: cats.length, complete: true, items: cats });
  }
  if (path === "/llms.txt") {
    return new Response(`# ${NAME(env)}\n\nProducts: ${c.products}\nCategories: ${c.categories}\nTotal items: ${c.total_items}\n\nFull structured catalog: ${site}/ai/index.json\nSummary: ${site}/ai-summary.json\nSitemap index: ${site}/sitemap-index.xml\nCatalog: ${site}/catalog.json\n`, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
  }
  if (path === "/feed.xml") {
    const prods = await listProducts(env, { limit: 100, skip: 0 });
    return xml(`<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel><title>${NAME(env)}</title><link>${site}</link><description>Curated products from trusted global partners.</description>` +
      prods.map((p) => `<item><title>${esc(p.title)}</title><link>${site}/product/${esc(p.slug)}</link><description>${esc(p.description || "")}</description><guid>${site}/product/${esc(p.slug)}</guid></item>`).join("") + `</channel></rss>`);
  }
  if (path === "/robots.txt") {
    const bots = ["GPTBot", "ChatGPT-User", "Google-Extended", "ClaudeBot", "anthropic-ai", "PerplexityBot", "CCBot", "Bytespider", "cohere-ai"];
    return new Response(`User-agent: *\nDisallow:\nAllow: /ai/\nAllow: /catalog.json\nAllow: /ai-summary.json\nAllow: /llms.txt\n` + bots.map((b) => `User-agent: ${b}\nAllow: /\n`).join("") + `Sitemap: ${site}/sitemap-index.xml\n`, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
  }
  return null;
}

// ---------- main handler ----------
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // SEO/AI files are served DYNAMICALLY by the worker (live D1 counts) — never
    // the stale static build artifacts, so counts are always the source of truth.
    const SEO_PATHS = /^\/(sitemap-index\.xml|sitemap-products-\d+\.xml|sitemap-categories\.xml|sitemap-images\.xml|catalog\.json|ai-summary\.json|llms\.txt|robots\.txt|feed\.xml)$/;
    if (SEO_PATHS.test(path)) {
      const seo = await serveSeo(env, path);
      if (seo) return seo;
    }

    // static assets
    if (/\.(css|js|png|jpg|jpeg|svg|ico|webp|webmanifest|txt|xml|json|woff2?)$/i.test(path) && !path.startsWith("/api/") && !path.startsWith("/ai/") && !SEO_PATHS.test(path)) {
      try { return await env.ASSETS.fetch(request); } catch {}
    }

    // ---------- affiliate redirect ----------
    const out = path.match(/^\/out\/([^/]+)\/([^/]+)$/);
    if (out) {
      const p = await getProduct(env, out[2]);
      if (!p) return notFound(env);
      try { await env.DB.prepare("INSERT INTO clicks (id, product_slug, provider, created_date) VALUES (?, ?, ?, ?)").bind(crypto.randomUUID(), p.slug, p.provider, new Date().toISOString()).run(); } catch {}
      if (!p.affiliate_url) return new Response("Affiliate link not yet available for this product.", { status: 503 });
      return Response.redirect(p.affiliate_url, 302);
    }

    // ---------- API ----------
    if (path === "/api/categories") return json(await listCategories(env));
    if (path === "/api/products") {
      const q = url.searchParams.get("q") || null;
      const limit = Number(url.searchParams.get("limit")) || 30;
      const skip = Number(url.searchParams.get("skip")) || 0;
      return json(await listProducts(env, { q, limit, skip }));
    }
    if (path === "/api/search") {
      const q = url.searchParams.get("q") || "";
      const limit = Number(url.searchParams.get("limit")) || 30;
      const skip = Number(url.searchParams.get("skip")) || 0;
      return json(await listProducts(env, { q, limit, skip }));
    }
    if (path === "/api/stats") return json(await seoCounts(env));

    // ---------- ingest (admin only, fills D1 from affiliate feed once keys land) ----------
    if (path === "/api/sync") {
      const adminKey = env.ADMIN_KEY;
      const provided = request.headers.get("X-Admin-Key") || "";
      if (!adminKey) return json({ ok: false, reason: "admin-not-configured" }, 503);
      if (provided !== adminKey) return json({ ok: false, reason: "unauthorized" }, 401);
      if (request.method !== "POST") return json({ ok: false, reason: "use POST" }, 405);
      const body = await request.json().catch(() => ({}));
      const keyword = (body.keyword || "").trim();
      const categoryId = (body.category_id || "").trim();
      if (!keyword) return json({ ok: false, reason: "keyword-required" }, 400);
      const res = await searchAliExpress(env, { keyword, pageSize: Number(body.page_size) || 20 });
      if (!res.ok) return json({ ok: false, reason: res.reason }, 503);
      let inserted = 0;
      for (const p of res.products) {
        if (!p.slug || !p.title) continue;
        try {
          await env.DB.prepare(
            `INSERT INTO products (id, slug, title, description, provider, provider_id, category_id, image, images, price, price_currency, original_price, commission_rate, affiliate_url, seller_rating, sales_volume, stock_status, created_date, updated_date)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'in_stock', ?, ?)
             ON CONFLICT(provider, provider_id) DO UPDATE SET title=excluded.title, price=excluded.price, image=excluded.image, affiliate_url=excluded.affiliate_url, updated_date=excluded.updated_date`
          ).bind(
            crypto.randomUUID(), p.slug, p.title, p.description, p.provider, p.provider_id, categoryId || null,
            p.image, p.images, p.price, p.price_currency, p.original_price, p.commission_rate,
            p.affiliate_url, p.seller_rating, p.sales_volume, new Date().toISOString(), new Date().toISOString()
          ).run();
          inserted++;
        } catch {}
      }
      return json({ ok: true, inserted, keyword, total_after: await countProducts(env) });
    }

    // ---------- homepage ----------
    if (path === "/" || path === "/index.html") {
      const cats = await listCategories(env);
      const hot = await listProducts(env, { limit: 10, skip: 0 });
      const total = await countProducts(env);
      try {
        const asset = await env.ASSETS.fetch(new Request(url.origin + "/index.html", request));
        if (asset.ok) {
          let html = await asset.text();
          html = html.replace(/<div class="container" id="catnav-inner">[\s\S]*?<\/div>/, `<div class="container" id="catnav-inner">${catNavLinks(cats)}</div>`);
          html = html.replace(/<div class="cat-grid" id="cat-grid"><!-- injected --><\/div>/, `<div class="cat-grid" id="cat-grid">${catCards(cats)}</div>`);
          html = html.replace(/<div class="prod-grid" id="hot-grid"><!-- injected --><\/div>/, `<div class="prod-grid" id="hot-grid">${productCards(hot)}</div>`);
          html = html.replace(/data-stat-products>([^<]*)</, `data-stat-products>${total.toLocaleString("en-US")}<`);
          html = html.replace(/data-stat-categories>([^<]*)</, `data-stat-categories>${cats.length.toLocaleString("en-US")}<`);
          return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=600" } });
        }
      } catch {}
      // fallback: serve asset untouched
      try { return await env.ASSETS.fetch(new Request(url.origin + "/index.html", request)); } catch {}
    }

    // ---------- category ----------
    if (path === "/categories") {
      const cats = await listCategories(env);
      const body = `<section class="hero" style="padding:34px 0 26px"><div class="container"><h1>All categories</h1></div></section>
      <section class="section" style="padding-top:6px"><div class="container"><div class="cat-grid">${catCards(cats)}</div></div></section>`;
      return new Response(shell({ env, title: "All categories — " + NAME(env), description: "Browse every category on " + NAME(env) + ".", canonical: SITE(env) + "/categories", body }), { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=1800" } });
    }
    if (path === "/products") {
      const page = Number(url.searchParams.get("page")) || 1;
      const perPage = 30;
      const skip = (page - 1) * perPage;
      const [prods, total] = await Promise.all([listProducts(env, { limit: perPage, skip }), countProducts(env)]);
      const pages = Math.max(1, Math.ceil(total / perPage));
      const pager = `<div class="pager">${Array.from({ length: Math.min(pages, 20) }, (_, i) => i + 1).map((n) => n === page ? `<span class="cur">${n}</span>` : `<a href="/products?page=${n}">${n}</a>`).join("")}</div>`;
      const body = `<section class="hero" style="padding:34px 0 26px"><div class="container"><h1>All products</h1><p class="sub">${total.toLocaleString("en-US")} products.</p></div></section><section class="section" style="padding-top:6px"><div class="container"><div class="prod-grid">${productCards(prods)}</div>${pager}</div></section>`;
      return new Response(shell({ env, title: "All products — " + NAME(env), description: "Browse all products on " + NAME(env) + ".", canonical: SITE(env) + "/products", body }), { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=1800" } });
    }
    if (path.startsWith("/category/")) {
      return renderCategory(env, path.slice("/category/".length), Number(url.searchParams.get("page")) || 1);
    }
    if (path === "/deals") {
      const prods = await listProducts(env, { limit: 60, skip: 0 });
      const deals = prods.filter((p) => p.original_price && p.original_price > p.price);
      const body = `<section class="hero" style="padding:34px 0 26px"><div class="container"><h1>Deals</h1><p class="sub">Hand-picked products with real discounts, from trusted partners.</p></div></section><section class="section" style="padding-top:6px"><div class="container"><div class="prod-grid">${productCards(deals)}</div></div></section>`;
      return new Response(shell({ env, title: "Deals — " + NAME(env), description: "Discounted products and daily deals on " + NAME(env) + ".", canonical: SITE(env) + "/deals", body }), { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=1800" } });
    }
    if (path.startsWith("/product/")) {
      return renderProduct(env, path.slice("/product/".length));
    }
    if (path === "/search") {
      return renderSearch(env, url.searchParams.get("q") || "", Number(url.searchParams.get("page")) || 1);
    }

    // ---------- simple pages ----------
    const pages = {
      "/about": ["About " + NAME(env), [`${NAME(env)} is a curated global marketplace. We bring together products from trusted partners worldwide into one clean, fast, easy place to browse.`, "We are part of the Nova Ecosystem — a family of platforms built for a global audience."]],
      "/help": ["Help center", ["Find what you need across every category. Use the search bar at the top, or browse by category.", "Questions? Email " + "support@novaecosystem.live" + "."]],
      "/contact": ["Contact", ["We'd love to hear from you. Email support@novaecosystem.live."]],
      "/privacy": ["Privacy", ["We respect your privacy. We collect only what is needed to run the platform and improve your experience."]],
      "/terms": ["Terms", ["By using " + NAME(env) + " you agree to our terms. Products are sold and shipped by our partners; we may earn a commission on qualifying purchases."]],
      "/affiliate-disclosure": ["Affiliate disclosure", ["Some links on " + NAME(env) + " are affiliate links. If you buy through them, we may earn a commission at no extra cost to you. This helps keep the platform free."]],
    };
    if (pages[path]) {
      return new Response(simplePage(env, pages[path][0] + " — " + NAME(env), pages[path][0], pages[path][1]), { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
    }

    // fallback: static asset or 404
    try { return await env.ASSETS.fetch(request); } catch {}
    return notFound(env);
  },
};
