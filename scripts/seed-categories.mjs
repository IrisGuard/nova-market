// Seed the D1 categories table from categories.json (top-level hubs).
// Run: node scripts/seed-categories.mjs | wrangler d1 execute nova-market-db --remote --command -  (via --file)
// Simpler: this writes a .sql file then we execute it with wrangler.
import { readFileSync, writeFileSync } from "node:fs";

const cats = JSON.parse(readFileSync(new URL("../categories.json", import.meta.url), "utf8")).categories;

const lines = [];
for (let i = 0; i < cats.length; i++) {
  const c = cats[i];
  const id = c.id;
  const name = c.name.replace(/'/g, "''");
  const slug = c.slug.replace(/'/g, "''");
  lines.push(`INSERT INTO categories (id, name, slug, parent_id, sort) VALUES ('${id}', '${name}', '${slug}', NULL, ${i});`);
}
writeFileSync(new URL("../seed-categories.sql", import.meta.url), lines.join("\n") + "\n");
console.log(`wrote ${lines.length} category INSERTs to seed-categories.sql`);
