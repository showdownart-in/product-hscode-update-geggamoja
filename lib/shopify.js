import "dotenv/config";

const VERSION = process.env.SHOPIFY_API_VERSION || "2025-01";

const STORES = {
  b2c: {
    key: "b2c",
    label: "B2C",
    store: process.env.SHOPIFY_STORE,
    token: process.env.SHOPIFY_ADMIN_TOKEN,
  },
  b2b: {
    key: "b2b",
    label: "B2B",
    store: process.env.SHOPIFY_STORE_B2B,
    token: process.env.SHOPIFY_ADMIN_TOKEN_B2B,
  },
};

/**
 * Resolve credentials for a store. Defaults to B2C.
 * @param {'b2c'|'b2b'} storeKey
 */
export function getStoreConfig(storeKey = "b2c") {
  const key = String(storeKey).toLowerCase();
  const entry = STORES[key];
  if (!entry) {
    throw new Error(`Unknown store "${storeKey}". Use: b2c, b2b`);
  }
  if (!entry.store || !entry.token) {
    const vars =
      key === "b2b"
        ? "SHOPIFY_STORE_B2B and SHOPIFY_ADMIN_TOKEN_B2B"
        : "SHOPIFY_STORE and SHOPIFY_ADMIN_TOKEN";
    throw new Error(`Missing ${vars} in .env for the ${entry.label} store.`);
  }
  return {
    ...entry,
    version: VERSION,
    endpoint: `https://${entry.store}.myshopify.com/admin/api/${VERSION}/graphql.json`,
  };
}

/**
 * Strip --store=b2c|b2b from argv; returns { store, argv }.
 */
export function parseStoreArg(argv) {
  let store = "b2c";
  const rest = [];
  for (const a of argv) {
    if (a.startsWith("--store=")) store = a.slice("--store=".length).toLowerCase();
    else rest.push(a);
  }
  return { store, argv: rest };
}

/**
 * Run a GraphQL query / mutation against the Shopify Admin API.
 * @param {string} storeKey - 'b2c' (default) or 'b2b'
 */
export async function gql(query, variables = {}, storeKey = "b2c") {
  const cfg = getStoreConfig(storeKey);
  const res = await fetch(cfg.endpoint, {
    method: "POST",
    headers: {
      "X-Shopify-Access-Token": cfg.token,
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

export function toProductGid(input) {
  if (!input) throw new Error("Product id is required");
  const str = String(input).trim();
  if (str.startsWith("gid://shopify/Product/")) return str;
  const urlMatch = str.match(/\/products\/(\d+)/);
  if (urlMatch) return `gid://shopify/Product/${urlMatch[1]}`;
  if (/^\d+$/.test(str)) return `gid://shopify/Product/${str}`;
  throw new Error(`Cannot parse product id from "${input}"`);
}

export function toVariantGid(input) {
  if (!input) throw new Error("Variant id is required");
  const str = String(input).trim();
  if (str.startsWith("gid://shopify/ProductVariant/")) return str;
  const urlMatch = str.match(/\/variants\/(\d+)/);
  if (urlMatch) return `gid://shopify/ProductVariant/${urlMatch[1]}`;
  if (/^\d+$/.test(str)) return `gid://shopify/ProductVariant/${str}`;
  throw new Error(`Cannot parse variant id from "${input}"`);
}

export function toInventoryItemGid(input) {
  if (!input) throw new Error("Inventory item id is required");
  const str = String(input).trim();
  if (str.startsWith("gid://shopify/InventoryItem/")) return str;
  if (/^\d+$/.test(str)) return `gid://shopify/InventoryItem/${str}`;
  throw new Error(`Cannot parse inventory item id from "${input}"`);
}

export async function getInventoryItemIdForVariant(variantGid, storeKey = "b2c") {
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
    { id: variantGid },
    storeKey
  );
  return data.productVariant || null;
}

/** @deprecated Use getStoreConfig('b2c') — kept for backward compat in scripts */
export const config = getStoreConfig("b2c");
