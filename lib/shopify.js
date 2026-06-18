import "dotenv/config";

const STORE = process.env.SHOPIFY_STORE;
const TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;
const VERSION = process.env.SHOPIFY_API_VERSION || "2025-01";

if (!STORE || !TOKEN) {
  console.error(
    "Missing SHOPIFY_STORE or SHOPIFY_ADMIN_TOKEN in .env. Copy .env.example to .env and fill in your credentials."
  );
  process.exit(1);
}

const ENDPOINT = `https://${STORE}.myshopify.com/admin/api/${VERSION}/graphql.json`;

/**
 * Run a GraphQL query / mutation against the Shopify Admin API.
 * Throws on transport / GraphQL errors. Returns `data`.
 */
export async function gql(query, variables = {}) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "X-Shopify-Access-Token": TOKEN,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON response (HTTP ${res.status}): ${text.slice(0, 500)}`);
  }

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${JSON.stringify(json)}`);
  }
  if (json.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(json.errors, null, 2)}`);
  }
  return json.data;
}

/**
 * Normalize whatever the user passes into a full Shopify Product GID.
 * Accepts:
 *   - "gid://shopify/Product/1234567890"
 *   - "1234567890"
 *   - "https://admin.shopify.com/store/foo/products/1234567890"
 */
export function toProductGid(input) {
  if (!input) throw new Error("Product id is required");
  const str = String(input).trim();
  if (str.startsWith("gid://shopify/Product/")) return str;
  const urlMatch = str.match(/\/products\/(\d+)/);
  if (urlMatch) return `gid://shopify/Product/${urlMatch[1]}`;
  if (/^\d+$/.test(str)) return `gid://shopify/Product/${str}`;
  throw new Error(`Cannot parse product id from "${input}"`);
}

/**
 * Normalize whatever the user passes into a full ProductVariant GID.
 * Accepts:
 *   - "gid://shopify/ProductVariant/9876543210"
 *   - "9876543210"
 *   - admin URLs that contain "/variants/9876543210"
 */
export function toVariantGid(input) {
  if (!input) throw new Error("Variant id is required");
  const str = String(input).trim();
  if (str.startsWith("gid://shopify/ProductVariant/")) return str;
  const urlMatch = str.match(/\/variants\/(\d+)/);
  if (urlMatch) return `gid://shopify/ProductVariant/${urlMatch[1]}`;
  if (/^\d+$/.test(str)) return `gid://shopify/ProductVariant/${str}`;
  throw new Error(`Cannot parse variant id from "${input}"`);
}

/**
 * Normalize whatever the user passes into a full InventoryItem GID.
 * Useful when you already have the inventory item id from `npm run inspect`
 * and want to skip the product lookup entirely.
 */
export function toInventoryItemGid(input) {
  if (!input) throw new Error("Inventory item id is required");
  const str = String(input).trim();
  if (str.startsWith("gid://shopify/InventoryItem/")) return str;
  if (/^\d+$/.test(str)) return `gid://shopify/InventoryItem/${str}`;
  throw new Error(`Cannot parse inventory item id from "${input}"`);
}

/**
 * Given a ProductVariant GID, look up its InventoryItem GID directly
 * (no product context required). Returns null if the variant doesn't exist.
 */
export async function getInventoryItemIdForVariant(variantGid) {
  const data = await gql(
    /* GraphQL */ `
      query($id: ID!) {
        productVariant(id: $id) {
          id
          sku
          title
          inventoryItem { id }
          product { id title }
        }
      }
    `,
    { id: variantGid }
  );
  return data.productVariant || null;
}

export const config = { store: STORE, version: VERSION, endpoint: ENDPOINT };
