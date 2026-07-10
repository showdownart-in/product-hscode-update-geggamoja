import {
  gql,
  toProductGid,
  toVariantGid,
  toInventoryItemGid,
  getInventoryItemIdForVariant,
  getStoreConfig,
  parseStoreArg,
} from "../lib/shopify.js";

const PRODUCT_QUERY = /* GraphQL */ `
  query getProduct($id: ID!) {
    product(id: $id) {
      id
      title
      variants(first: 100) {
        edges {
          node {
            id
            title
            sku
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
      inventoryItem {
        id
        harmonizedSystemCode
        countryCodeOfOrigin
        measurement { weight { value unit } }
      }
      userErrors { field message }
    }
  }
`;

const VALID_UNITS = new Set(["GRAMS", "KILOGRAMS", "OUNCES", "POUNDS"]);

function parseArgs(argv) {
  const { store, argv: rest } = parseStoreArg(argv.slice(2));
  const out = { store, unit: "KILOGRAMS" };
  for (const a of rest) {
    if (a.startsWith("--product=")) out.product = a.slice("--product=".length);
    else if (a.startsWith("--variant=")) out.variant = a.slice("--variant=".length);
    else if (a.startsWith("--inventory-item=")) out.inventoryItem = a.slice("--inventory-item=".length);
    else if (a.startsWith("--weight=")) out.weight = Number(a.slice("--weight=".length));
    else if (a.startsWith("--unit=")) out.unit = a.slice("--unit=".length).toUpperCase();
    else if (a.startsWith("--hs=")) out.hs = a.slice("--hs=".length);
    else if (a.startsWith("--country=")) out.country = a.slice("--country=".length).toUpperCase();
    else if (a.startsWith("--sku=")) out.sku = a.slice("--sku=".length);
    else if (a === "--dry-run") out.dryRun = true;
  }
  return out;
}

function printHelp() {
  console.log(`Usage: npm run update -- <target> [options]

Target (pick ONE):
  --product=<id|gid|url>          Update every variant on a product
  --product=<...> --sku=<sku>     Update one variant on a product, matched by SKU
  --variant=<id|gid|url>          Update one variant by variant id (no SKU needed)
  --inventory-item=<id|gid>       Update one inventory item directly (advanced)

Required (at least one of):
  --weight=<number>               Weight value (e.g. 0.25)
  --hs=<code>                     Harmonized System code (e.g. 610910)

Options:
  --store=<b2c|b2b>               Store to use (default: b2c)
  --unit=<KILOGRAMS|GRAMS|POUNDS|OUNCES>   Weight unit (default: KILOGRAMS)
  --country=<ISO2>                Country of origin (e.g. SE, IN, US)
  --dry-run                       Show what would change without writing

Examples:
  npm run update -- --product=1234567890 --weight=0.25 --hs=610910
  npm run update -- --store=b2b --product=1234567890 --weight=0.25 --hs=610910
  npm run update -- --variant=9876543210 --weight=0.20 --hs=610910 --dry-run
`);
}

function buildInput(args) {
  const input = {};
  if (args.hs) input.harmonizedSystemCode = args.hs;
  if (args.country) input.countryCodeOfOrigin = args.country;
  if (args.weight !== undefined) {
    input.measurement = { weight: { value: args.weight, unit: args.unit } };
  }
  return input;
}

async function resolveTargets(args) {
  const { store } = args;

  if (args.inventoryItem) {
    const id = toInventoryItemGid(args.inventoryItem);
    return [{ label: `inventory-item ${id}`, inventoryItemId: id }];
  }

  if (args.variant) {
    const variantGid = toVariantGid(args.variant);
    const v = await getInventoryItemIdForVariant(variantGid, store);
    if (!v) throw new Error(`Variant not found: ${variantGid}`);
    const label = `${v.sku || "(no sku)"} — ${v.title}  [${v.product.title}]`;
    return [{ label, inventoryItemId: v.inventoryItem.id }];
  }

  if (args.product) {
    const productId = toProductGid(args.product);
    const data = await gql(PRODUCT_QUERY, { id: productId }, store);
    if (!data.product) throw new Error("Product not found.");
    console.log(`Title:     ${data.product.title}`);

    let variants = data.product.variants.edges.map((e) => e.node);
    if (args.sku) {
      variants = variants.filter((v) => v.sku === args.sku);
      if (!variants.length) {
        throw new Error(`No variant with SKU "${args.sku}" found on this product.`);
      }
    }
    return variants.map((v) => ({
      label: `${v.sku || "(no sku)"} — ${v.title}`,
      inventoryItemId: v.inventoryItem.id,
    }));
  }

  throw new Error("You must pass one of: --product, --variant, --inventory-item.");
}

async function main() {
  const args = parseArgs(process.argv);
  const hasTarget = args.product || args.variant || args.inventoryItem;
  if (!hasTarget || (args.weight === undefined && !args.hs && !args.country)) {
    printHelp();
    process.exit(1);
  }
  if (args.weight !== undefined && !VALID_UNITS.has(args.unit)) {
    console.error(`Invalid --unit "${args.unit}". Must be one of: ${[...VALID_UNITS].join(", ")}`);
    process.exit(1);
  }

  const cfg = getStoreConfig(args.store);
  console.log(`Store:     ${cfg.label} — ${cfg.store}.myshopify.com`);
  console.log(`API ver:   ${cfg.version}`);
  console.log(`Dry run:   ${args.dryRun ? "YES" : "no"}\n`);

  let targets;
  try {
    targets = await resolveTargets(args);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
  console.log(`Targets to update: ${targets.length}\n`);

  const input = buildInput(args);
  let ok = 0;
  let failed = 0;

  for (const t of targets) {
    if (args.dryRun) {
      console.log(`[dry-run] would update ${t.label} :: ${JSON.stringify(input)}`);
      ok++;
      continue;
    }

    try {
      const res = await gql(UPDATE_MUTATION, { id: t.inventoryItemId, input }, args.store);
      const errs = res.inventoryItemUpdate.userErrors;
      if (errs.length) {
        console.error(`✗ ${t.label} — ${JSON.stringify(errs)}`);
        failed++;
      } else {
        const item = res.inventoryItemUpdate.inventoryItem;
        const w = item.measurement?.weight;
        console.log(
          `✓ ${t.label} — weight: ${w?.value ?? "—"} ${w?.unit ?? ""}, hs: ${
            item.harmonizedSystemCode ?? "—"
          }, country: ${item.countryCodeOfOrigin ?? "—"}`
        );
        ok++;
      }
    } catch (err) {
      console.error(`✗ ${t.label} — ${err.message}`);
      failed++;
    }

    await new Promise((r) => setTimeout(r, 200));
  }

  console.log(`\nDone. ${ok} updated, ${failed} failed.`);
  if (failed > 0) process.exit(2);
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
