import fs from "node:fs";
import path from "node:path";
import {
  gql,
  toProductGid,
  toVariantGid,
  toInventoryItemGid,
  getInventoryItemIdForVariant,
  getStoreConfig,
  parseStoreArg,
} from "../lib/shopify.js";

/**
 * Bulk-update weight & HS code from a CSV.
 *
 * CSV columns (header required — column order doesn't matter):
 *   product_id, sku, variant_id, inventory_item_id, weight, unit, hs_code, country
 *
 * Targeting rules (highest priority first):
 *   1. inventory_item_id set → update that inventory item directly
 *   2. variant_id set        → update that single variant (works even if it has NO sku)
 *   3. product_id + sku set  → update the one variant with that sku on the product
 *   4. product_id only       → update ALL variants of the product
 *
 * Other columns:
 *   - weight   : numeric, e.g. 0.25 — leave blank to skip
 *   - unit     : KILOGRAMS|GRAMS|POUNDS|OUNCES (default KILOGRAMS)
 *   - hs_code  : HS code string — leave blank to skip
 *   - country  : ISO-2 country code — leave blank to skip
 */

const PRODUCT_QUERY = /* GraphQL */ `
  query getProduct($id: ID!) {
    product(id: $id) {
      id
      title
      variants(first: 100) {
        edges {
          node {
            id
            sku
            title
            inventoryItem { id }
          }
        }
      }
    }
  }
`;

const UPDATE_MUTATION = /* GraphQL */ `
  mutation updateInventoryItem($id: ID!, $input: InventoryItemInput!) {
    inventoryItemUpdate(id: $id, input: $input) {
      userErrors { field message }
    }
  }
`;

function parseCsv(filePath) {
  const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) throw new Error("CSV must have a header and at least one row.");

  const split = (line) => {
    // very small CSV splitter that supports quoted fields
    const out = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQ) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') inQ = false;
        else cur += ch;
      } else {
        if (ch === '"') inQ = true;
        else if (ch === ",") { out.push(cur); cur = ""; }
        else cur += ch;
      }
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };

  const header = split(lines[0]).map((h) => h.toLowerCase());
  return lines.slice(1).map((line, idx) => {
    const cells = split(line);
    const row = {};
    header.forEach((h, i) => (row[h] = cells[i] ?? ""));
    row.__line = idx + 2;
    return row;
  });
}

function buildInput(row) {
  const input = {};
  if (row.hs_code) input.harmonizedSystemCode = row.hs_code;
  if (row.country) input.countryCodeOfOrigin = row.country.toUpperCase();
  if (row.weight !== "" && row.weight !== undefined) {
    const value = Number(row.weight);
    if (Number.isNaN(value)) throw new Error(`Invalid weight "${row.weight}"`);
    const unit = (row.unit || "KILOGRAMS").toUpperCase();
    input.measurement = { weight: { value, unit } };
  }
  return input;
}

async function main() {
  const { store, argv } = parseStoreArg(process.argv.slice(2));
  const csvPath = argv.find((a) => !a.startsWith("--"));
  const dryRun = argv.includes("--dry-run");
  if (!csvPath) {
    console.error(
      "Usage: npm run bulk -- [--store=b2c|b2b] <path-to-csv> [--dry-run]\n" +
        "See scripts/bulk-update.js for the CSV format."
    );
    process.exit(1);
  }
  const absPath = path.resolve(csvPath);
  if (!fs.existsSync(absPath)) {
    console.error(`File not found: ${absPath}`);
    process.exit(1);
  }

  const cfg = getStoreConfig(store);
  console.log(`Store:     ${cfg.label} — ${cfg.store}.myshopify.com`);
  console.log(`API ver:   ${cfg.version}`);
  console.log(`CSV:       ${absPath}`);
  console.log(`Dry run:   ${dryRun ? "YES" : "no"}\n`);

  const rows = parseCsv(absPath);
  console.log(`Rows: ${rows.length}\n`);

  const variantCache = new Map(); // productGid -> variants[]
  let ok = 0;
  let failed = 0;

  const rowLabel = (row) => {
    if (row.inventory_item_id) return `[line ${row.__line}] inv=${row.inventory_item_id}`;
    if (row.variant_id) return `[line ${row.__line}] variant=${row.variant_id}`;
    return `[line ${row.__line}] product=${row.product_id}${row.sku ? ` sku=${row.sku}` : ""}`;
  };

  for (const row of rows) {
    const label = rowLabel(row);
    try {
      // Decide which inventory items to update.
      let targets = []; // [{ inventoryItemId, displayName }]

      if (row.inventory_item_id) {
        targets.push({
          inventoryItemId: toInventoryItemGid(row.inventory_item_id),
          displayName: `inv ${row.inventory_item_id}`,
        });
      } else if (row.variant_id) {
        const v = await getInventoryItemIdForVariant(toVariantGid(row.variant_id), store);
        if (!v) throw new Error(`Variant not found: ${row.variant_id}`);
        targets.push({
          inventoryItemId: v.inventoryItem.id,
          displayName: `${v.sku || "(no sku)"} — ${v.title}`,
        });
      } else if (row.product_id) {
        const productId = toProductGid(row.product_id);
        let variants = variantCache.get(productId);
        if (!variants) {
          const data = await gql(PRODUCT_QUERY, { id: productId }, store);
          if (!data.product) throw new Error("Product not found");
          variants = data.product.variants.edges.map((e) => e.node);
          variantCache.set(productId, variants);
        }
        const filtered = row.sku ? variants.filter((v) => v.sku === row.sku) : variants;
        if (!filtered.length) {
          throw new Error(`No matching variant${row.sku ? ` for SKU ${row.sku}` : ""}`);
        }
        targets = filtered.map((v) => ({
          inventoryItemId: v.inventoryItem.id,
          displayName: `${v.sku || "(no sku)"} — ${v.title}`,
        }));
      } else {
        throw new Error("Row needs one of: inventory_item_id, variant_id, or product_id");
      }

      const input = buildInput(row);
      if (Object.keys(input).length === 0) {
        console.warn(`! ${label} — nothing to update (no weight / hs_code / country)`);
        continue;
      }

      for (const t of targets) {
        if (dryRun) {
          console.log(`[dry-run] ${label} → ${t.displayName} :: ${JSON.stringify(input)}`);
          ok++;
          continue;
        }
        const res = await gql(UPDATE_MUTATION, { id: t.inventoryItemId, input }, store);
        const errs = res.inventoryItemUpdate.userErrors;
        if (errs.length) {
          console.error(`✗ ${label} → ${t.displayName} — ${JSON.stringify(errs)}`);
          failed++;
        } else {
          console.log(`✓ ${label} → ${t.displayName}`);
          ok++;
        }
        await new Promise((r) => setTimeout(r, 200));
      }
    } catch (err) {
      console.error(`✗ ${label} — ${err.message}`);
      failed++;
    }
  }

  console.log(`\nDone. ${ok} updated, ${failed} failed.`);
  if (failed > 0) process.exit(2);
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
