import { gql, toProductGid, getStoreConfig, parseStoreArg } from "../lib/shopify.js";

const PRODUCT_QUERY = /* GraphQL */ `
  query getProduct($id: ID!) {
    product(id: $id) {
      id
      title
      handle
      status
      variants(first: 100) {
        edges {
          node {
            id
            title
            sku
            inventoryItem {
              id
              harmonizedSystemCode
              countryCodeOfOrigin
              measurement {
                weight {
                  value
                  unit
                }
              }
            }
          }
        }
      }
    }
  }
`;

async function main() {
  const { store, argv } = parseStoreArg(process.argv.slice(2));
  const productInput = argv[0];

  if (!productInput) {
    console.error(
      "Usage: npm run inspect -- [--store=b2c|b2b] <productId|productGid|adminUrl>\n" +
        "Examples:\n" +
        "  npm run inspect -- 1234567890\n" +
        "  npm run inspect -- --store=b2b 1234567890"
    );
    process.exit(1);
  }

  const cfg = getStoreConfig(store);
  const id = toProductGid(productInput);
  console.log(`Store:     ${cfg.label} — ${cfg.store}.myshopify.com`);
  console.log(`API ver:   ${cfg.version}`);
  console.log(`Product:   ${id}\n`);

  const data = await gql(PRODUCT_QUERY, { id }, store);
  if (!data.product) {
    console.error("Product not found.");
    process.exit(1);
  }

  const p = data.product;
  console.log(`Title:     ${p.title}`);
  console.log(`Handle:    ${p.handle}`);
  console.log(`Status:    ${p.status}`);
  console.log(`Variants:  ${p.variants.edges.length}\n`);

  const rows = p.variants.edges.map(({ node: v }) => ({
    Variant: v.title,
    SKU: v.sku || "—",
    "Inventory Item ID": v.inventoryItem.id,
    "HS Code": v.inventoryItem.harmonizedSystemCode || "—",
    Country: v.inventoryItem.countryCodeOfOrigin || "—",
    Weight: `${v.inventoryItem.measurement?.weight?.value ?? 0} ${
      v.inventoryItem.measurement?.weight?.unit ?? ""
    }`,
  }));
  console.table(rows);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
