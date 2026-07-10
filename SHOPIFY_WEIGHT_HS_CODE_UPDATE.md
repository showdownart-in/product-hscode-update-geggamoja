# Updating Product Weight & HS Code via Shopify Admin API

This guide explains how to programmatically update a product's **weight** and **HS (Harmonized System) code** in your Shopify store for:

- Products with **no variants** (single default variant)
- Products with **multiple variants**

> **Important:** In Shopify, both `weight` and `harmonizedSystemCode` are stored on the **InventoryItem** (which is linked to a variant), **not** directly on the product or variant itself. This guide uses the **GraphQL Admin API** (recommended). The REST Product/Variant endpoints have been deprecated since API version `2024-04` for product/variant write operations — all writes should go through GraphQL.

---

## 1. Prerequisites

### 1.1 Credentials — Already Provisioned

> **The custom app has already been created and installed on both Geggamoja Shopify stores. Your team does not need to set anything up in the Shopify admin.**

Geggamoja runs **two separate Shopify stores**. The same custom app is installed on each, but each store has its **own store handle and Admin API access token**. You must always pair the correct token with the correct store URL — a B2C token will not work against the B2B endpoint, and vice versa.

| Store | Purpose | Store handle | Token env variable |
| --- | --- | --- | --- |
| **B2C** | Consumer storefront | `geggamoja` | `SHOPIFY_ADMIN_TOKEN` |
| **B2B** | Wholesale / B2B | `geggamojab2b` | `SHOPIFY_ADMIN_TOKEN_B2B` |

You will receive a `.env` file over a **secure channel** containing all four values:

```env
SHOPIFY_STORE=geggamoja
SHOPIFY_ADMIN_TOKEN=shpat_...

SHOPIFY_STORE_B2B=geggamojab2b
SHOPIFY_ADMIN_TOKEN_B2B=shpat_...

SHOPIFY_API_VERSION=2025-01
```

**Handling the tokens safely:**

- Store them in environment variables or a secret manager — **never** commit them to git, Slack, Jira, screenshots, or logs.
- If a token is ever exposed, request a new one immediately (the old one will be revoked).
- Once integration work is done, ask for the tokens to be rotated or the app to be uninstalled.

The custom app has already been configured with the **minimum required scopes** on both stores:

- `read_products`
- `write_products`
- `read_inventory`
- `write_inventory`

> If at any point the API returns `403 Access denied` for a request, it means a scope is missing — let us know and we'll re-issue the token with the correct scope.

<details>
<summary>Reference: how the custom app was created (for your records only — you don't need to do this)</summary>

1. Shopify Admin → **Settings** → **Apps and sales channels** → **Develop apps**.
2. **Create an app** → name it (e.g. `Product Update API`).
3. **Configuration** → **Admin API integration** → **Configure** → enable the four scopes listed above → **Save**.
4. **Install app** → copy the Admin API access token (shown only once, starts with `shpat_`).

</details>

### 1.2 API Endpoints

Each store has its own endpoint. Replace the token with the one that matches that store.

**B2C (consumer):**

```
POST https://geggamoja.myshopify.com/admin/api/2025-01/graphql.json
Header: X-Shopify-Access-Token: <SHOPIFY_ADMIN_TOKEN>
```

**B2B (wholesale):**

```
POST https://geggamojab2b.myshopify.com/admin/api/2025-01/graphql.json
Header: X-Shopify-Access-Token: <SHOPIFY_ADMIN_TOKEN_B2B>
```

Use the latest stable API version (currently `2025-01`). The GraphQL mutation and query examples in this document are identical for both stores — only the endpoint URL and token change.

### 1.3 Required Request Headers

| Header                   | Value                |
| ------------------------ | -------------------- |
| `X-Shopify-Access-Token` | `shpat_xxxxxxxxxxxx` |
| `Content-Type`           | `application/json`   |

---

## 2. Understanding the Data Model

```
Product
 └── ProductVariant (one or many — identified by Variant ID and optionally a SKU)
      └── InventoryItem
           ├── measurement.weight     ← product weight lives here
           ├── harmonizedSystemCode   ← HS code lives here
           └── countryCodeOfOrigin    ← (optional) country of origin
```

So to update weight / HS code you always need:

1. The **InventoryItem ID** of each variant (format: `gid://shopify/InventoryItem/123456789`).
2. Call the `inventoryItemUpdate` GraphQL mutation.

There are **three ways** to obtain that InventoryItem ID (covered in detail in §7):

| Starting point                            | Lookup needed                                                                                                      |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| You have the **Product ID**               | Query the product → get every variant's `inventoryItem.id` (also exposes the SKU so you can filter to one variant) |
| You have a **Variant ID**                 | Query the variant → get its `inventoryItem.id` (works **even if the variant has no SKU**)                          |
| You already have the **InventoryItem ID** | No lookup — call the mutation directly                                                                             |

---

## 3. Step 1 — Fetch Variants & InventoryItem IDs for a Product

Use the product's handle or ID to fetch all variants and their inventory item IDs.

### GraphQL Query

```graphql
query getProductVariants($id: ID!) {
  product(id: $id) {
    id
    title
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
```

### Variables

```json
{
  "id": "gid://shopify/Product/1234567890"
}
```

### cURL Example

```bash
curl -X POST \
  https://your-store.myshopify.com/admin/api/2025-01/graphql.json \
  -H "X-Shopify-Access-Token: shpat_xxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "query getProductVariants($id: ID!) { product(id: $id) { id title variants(first: 100) { edges { node { id title sku inventoryItem { id harmonizedSystemCode measurement { weight { value unit } } } } } } } }",
    "variables": { "id": "gid://shopify/Product/1234567890" }
  }'
```

### Sample Response

```json
{
  "data": {
    "product": {
      "id": "gid://shopify/Product/1234567890",
      "title": "T-Shirt",
      "variants": {
        "edges": [
          {
            "node": {
              "id": "gid://shopify/ProductVariant/111",
              "title": "Small / Red",
              "sku": "TSHIRT-S-RED",
              "inventoryItem": {
                "id": "gid://shopify/InventoryItem/9991",
                "harmonizedSystemCode": null,
                "measurement": {
                  "weight": { "value": 0.0, "unit": "KILOGRAMS" }
                }
              }
            }
          }
        ]
      }
    }
  }
}
```

> A product with **no variants** still has exactly **one default variant** — the query returns it the same way.

---

## 4. Step 2 — Update Weight & HS Code (`inventoryItemUpdate`)

### GraphQL Mutation

```graphql
mutation updateInventoryItem($id: ID!, $input: InventoryItemInput!) {
  inventoryItemUpdate(id: $id, input: $input) {
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
    userErrors {
      field
      message
    }
  }
}
```

### Variables

```json
{
  "id": "gid://shopify/InventoryItem/9991",
  "input": {
    "harmonizedSystemCode": "610910",
    "countryCodeOfOrigin": "SE",
    "measurement": {
      "weight": {
        "value": 0.25,
        "unit": "KILOGRAMS"
      }
    }
  }
}
```

| Field                      | Notes                                                     |
| -------------------------- | --------------------------------------------------------- |
| `harmonizedSystemCode`     | 6 or 10-digit HS code string, e.g. `"610910"`             |
| `measurement.weight.value` | Float, e.g. `0.25`                                        |
| `measurement.weight.unit`  | One of `GRAMS`, `KILOGRAMS`, `OUNCES`, `POUNDS`           |
| `countryCodeOfOrigin`      | Optional. 2-letter ISO code (e.g. `"SE"`, `"IN"`, `"US"`) |
| `tracked`                  | Optional boolean — set `true` to track inventory          |

### cURL Example

```bash
curl -X POST \
  https://your-store.myshopify.com/admin/api/2025-01/graphql.json \
  -H "X-Shopify-Access-Token: shpat_xxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "mutation updateInventoryItem($id: ID!, $input: InventoryItemInput!) { inventoryItemUpdate(id: $id, input: $input) { inventoryItem { id harmonizedSystemCode measurement { weight { value unit } } } userErrors { field message } } }",
    "variables": {
      "id": "gid://shopify/InventoryItem/9991",
      "input": {
        "harmonizedSystemCode": "610910",
        "countryCodeOfOrigin": "SE",
        "measurement": { "weight": { "value": 0.25, "unit": "KILOGRAMS" } }
      }
    }
  }'
```

### Successful Response

```json
{
  "data": {
    "inventoryItemUpdate": {
      "inventoryItem": {
        "id": "gid://shopify/InventoryItem/9991",
        "harmonizedSystemCode": "610910",
        "countryCodeOfOrigin": "SE",
        "measurement": { "weight": { "value": 0.25, "unit": "KILOGRAMS" } }
      },
      "userErrors": []
    }
  }
}
```

> Always check `userErrors`. An empty array means success.

---

## 5. Case A — Product With **No Variants** (Single Default Variant)

A product without variants still has one default variant. The flow is:

1. Query the product → get the single variant's `inventoryItem.id`.
2. Call `inventoryItemUpdate` once with the new weight and HS code.

### Node.js Example

```js
import fetch from "node-fetch";

const SHOP = "your-store";
const TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;
const API = `https://${SHOP}.myshopify.com/admin/api/2025-01/graphql.json`;

async function gql(query, variables) {
  const res = await fetch(API, {
    method: "POST",
    headers: {
      "X-Shopify-Access-Token": TOKEN,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

async function updateSingleProduct(
  productId,
  { weightKg, hsCode, countryCode },
) {
  const data = await gql(
    `query($id: ID!) {
      product(id: $id) {
        variants(first: 1) { edges { node { inventoryItem { id } } } }
      }
    }`,
    { id: productId },
  );

  const inventoryItemId = data.product.variants.edges[0].node.inventoryItem.id;

  const result = await gql(
    `mutation($id: ID!, $input: InventoryItemInput!) {
      inventoryItemUpdate(id: $id, input: $input) {
        inventoryItem { id harmonizedSystemCode measurement { weight { value unit } } }
        userErrors { field message }
      }
    }`,
    {
      id: inventoryItemId,
      input: {
        harmonizedSystemCode: hsCode,
        countryCodeOfOrigin: countryCode,
        measurement: { weight: { value: weightKg, unit: "KILOGRAMS" } },
      },
    },
  );

  if (result.inventoryItemUpdate.userErrors.length) {
    throw new Error(JSON.stringify(result.inventoryItemUpdate.userErrors));
  }
  return result.inventoryItemUpdate.inventoryItem;
}

await updateSingleProduct("gid://shopify/Product/1234567890", {
  weightKg: 0.25,
  hsCode: "610910",
  countryCode: "SE",
});
```

---

## 6. Case B — Product With **Multiple Variants**

Every variant has its **own** InventoryItem, so weight and HS code can differ per variant. There are two ways to update them:

- **Option 1:** Loop over all variants and call `inventoryItemUpdate` for each (simple, fine for small catalogs).
- **Option 2:** Use `bulkOperationRunMutation` with `inventoryItemUpdate` (recommended for large catalogs — single async job, no rate-limit juggling).

### 6.1 Option 1 — Loop Over Variants

```js
async function updateAllVariants(productId, { weightKg, hsCode, countryCode }) {
  const data = await gql(
    `query($id: ID!) {
      product(id: $id) {
        variants(first: 100) {
          edges { node { id sku inventoryItem { id } } }
        }
      }
    }`,
    { id: productId },
  );

  const variants = data.product.variants.edges.map((e) => e.node);

  for (const v of variants) {
    const result = await gql(
      `mutation($id: ID!, $input: InventoryItemInput!) {
        inventoryItemUpdate(id: $id, input: $input) {
          userErrors { field message }
        }
      }`,
      {
        id: v.inventoryItem.id,
        input: {
          harmonizedSystemCode: hsCode,
          countryCodeOfOrigin: countryCode,
          measurement: { weight: { value: weightKg, unit: "KILOGRAMS" } },
        },
      },
    );

    if (result.inventoryItemUpdate.userErrors.length) {
      console.error(
        `Variant ${v.sku} failed`,
        result.inventoryItemUpdate.userErrors,
      );
    } else {
      console.log(`Variant ${v.sku} updated`);
    }

    // Respect Shopify's GraphQL cost-based rate limit — add a tiny delay if needed.
    await new Promise((r) => setTimeout(r, 200));
  }
}
```

### 6.2 Per-Variant Different Values

If each variant needs a **different** weight or HS code, build a map and update accordingly:

```js
const variantUpdates = {
  "SKU-S": { weightKg: 0.2, hsCode: "610910" },
  "SKU-M": { weightKg: 0.25, hsCode: "610910" },
  "SKU-L": { weightKg: 0.3, hsCode: "610910" },
};

for (const v of variants) {
  const cfg = variantUpdates[v.sku];
  if (!cfg) continue;
  await gql(
    `mutation($id: ID!, $input: InventoryItemInput!) {
      inventoryItemUpdate(id: $id, input: $input) { userErrors { field message } }
    }`,
    {
      id: v.inventoryItem.id,
      input: {
        harmonizedSystemCode: cfg.hsCode,
        measurement: { weight: { value: cfg.weightKg, unit: "KILOGRAMS" } },
      },
    },
  );
}
```

### 6.3 Option 2 — Bulk Update (Large Catalogs)

For thousands of products/variants, use `bulkOperationRunMutation`:

1. Prepare a **JSONL** file where each line is one mutation input:

```jsonl
{"input":{"id":"gid://shopify/InventoryItem/9991","harmonizedSystemCode":"610910","measurement":{"weight":{"value":0.25,"unit":"KILOGRAMS"}}}}
{"input":{"id":"gid://shopify/InventoryItem/9992","harmonizedSystemCode":"610910","measurement":{"weight":{"value":0.30,"unit":"KILOGRAMS"}}}}
```

2. Upload it via `stagedUploadsCreate` → `bulkOperationRunMutation`. Full reference: <https://shopify.dev/docs/api/usage/bulk-operations/imports>

---

## 7. Targeting a Specific Variant (by SKU or Variant ID)

When you need to update **only one variant** of a multi-variant product — not all variants — Shopify gives you three ways to identify which variant to update. All three ultimately resolve to an **InventoryItem ID**, which is what `inventoryItemUpdate` actually requires.

| Approach                | Use when                                                       | API calls per update         |
| ----------------------- | -------------------------------------------------------------- | ---------------------------- |
| **By SKU**              | The variant has a unique SKU                                   | 2 (product query + mutation) |
| **By Variant ID**       | The variant has **no SKU**, or you already know the variant id | 2 (variant query + mutation) |
| **By InventoryItem ID** | You already have the inventory-item id cached                  | 1 (mutation only)            |

> **Important — both `weight` and `harmonizedSystemCode` are stored on the InventoryItem, not on the variant.** So even though you "target by SKU" or "target by variant id", you always end up calling `inventoryItemUpdate` against the variant's underlying InventoryItem GID.

### 7.1 By SKU

This is the most common approach when SKUs are configured properly.

**Flow:**

1. Query the product → it returns every variant with its SKU and InventoryItem ID.
2. Filter the result client-side to the variant whose `sku` matches.
3. Call `inventoryItemUpdate` using that variant's `inventoryItem.id`.

#### GraphQL Query

```graphql
query getProductVariantsBySku($id: ID!) {
  product(id: $id) {
    id
    title
    variants(first: 100) {
      edges {
        node {
          id
          title
          sku
          inventoryItem {
            id
          }
        }
      }
    }
  }
}
```

#### cURL Example (lookup, then update)

Step A — find the InventoryItem ID for SKU `TSHIRT-S-RED`:

```bash
curl -X POST \
  https://your-store.myshopify.com/admin/api/2025-01/graphql.json \
  -H "X-Shopify-Access-Token: shpat_xxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "query($id: ID!) { product(id: $id) { variants(first: 100) { edges { node { id sku inventoryItem { id } } } } } }",
    "variables": { "id": "gid://shopify/Product/1234567890" }
  }'
```

Pick the edge where `node.sku == "TSHIRT-S-RED"` → grab its `inventoryItem.id` (e.g. `gid://shopify/InventoryItem/9991`).

Step B — update that one InventoryItem:

```bash
curl -X POST \
  https://your-store.myshopify.com/admin/api/2025-01/graphql.json \
  -H "X-Shopify-Access-Token: shpat_xxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "mutation($id: ID!, $input: InventoryItemInput!) { inventoryItemUpdate(id: $id, input: $input) { userErrors { field message } } }",
    "variables": {
      "id": "gid://shopify/InventoryItem/9991",
      "input": {
        "harmonizedSystemCode": "610910",
        "measurement": { "weight": { "value": 0.20, "unit": "KILOGRAMS" } }
      }
    }
  }'
```

#### Node.js Example

```js
async function updateVariantBySku(productId, sku, { weightKg, hsCode }) {
  const data = await gql(
    `query($id: ID!) {
      product(id: $id) {
        variants(first: 100) {
          edges { node { sku inventoryItem { id } } }
        }
      }
    }`,
    { id: productId },
  );

  const match = data.product.variants.edges
    .map((e) => e.node)
    .find((v) => v.sku === sku);

  if (!match) throw new Error(`No variant with SKU "${sku}" on this product`);

  const result = await gql(
    `mutation($id: ID!, $input: InventoryItemInput!) {
      inventoryItemUpdate(id: $id, input: $input) {
        userErrors { field message }
      }
    }`,
    {
      id: match.inventoryItem.id,
      input: {
        harmonizedSystemCode: hsCode,
        measurement: { weight: { value: weightKg, unit: "KILOGRAMS" } },
      },
    },
  );

  if (result.inventoryItemUpdate.userErrors.length) {
    throw new Error(JSON.stringify(result.inventoryItemUpdate.userErrors));
  }
}

await updateVariantBySku("gid://shopify/Product/1234567890", "TSHIRT-S-RED", {
  weightKg: 0.2,
  hsCode: "610910",
});
```

> **Note on duplicate SKUs.** Shopify does **not** enforce SKU uniqueness. If the same SKU exists on multiple variants, the client-side `.find()` only returns the first match. Either de-duplicate your SKUs in Shopify, or target by Variant ID (see §7.2).

### 7.2 By Variant ID — works for variants WITHOUT a SKU

If a variant doesn't have a SKU (blank, missing, or you just don't want to depend on it), target the variant directly using its **ProductVariant GID**. This is also the safest approach when SKUs are duplicated.

#### Where to find a Variant ID

There are two easy ways:

1. **From the Shopify Admin URL.** Open the product, click the variant you want. The URL contains the variant's numeric id:

   ```
   https://admin.shopify.com/store/your-store/products/1234567890/variants/9876543210
                                                                            ─────────────
                                                                            Variant ID
   ```

2. **From an inspection query.** Run a product query (see §3) — every variant edge already has an `id` field in GID form, e.g. `gid://shopify/ProductVariant/9876543210`.

The full GID format is:

```
gid://shopify/ProductVariant/<numeric-id>
```

#### GraphQL Query

```graphql
query getVariantInventoryItem($id: ID!) {
  productVariant(id: $id) {
    id
    sku
    title
    product {
      id
      title
    }
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
```

#### Variables

```json
{ "id": "gid://shopify/ProductVariant/9876543210" }
```

This works **whether or not the variant has a SKU** — `sku` may come back as `null` and the call still succeeds.

#### cURL Example (lookup, then update)

Step A — find the InventoryItem ID for a given Variant ID:

```bash
curl -X POST \
  https://your-store.myshopify.com/admin/api/2025-01/graphql.json \
  -H "X-Shopify-Access-Token: shpat_xxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "query($id: ID!) { productVariant(id: $id) { sku title inventoryItem { id } } }",
    "variables": { "id": "gid://shopify/ProductVariant/9876543210" }
  }'
```

Sample response:

```json
{
  "data": {
    "productVariant": {
      "sku": null,
      "title": "Default Title",
      "inventoryItem": { "id": "gid://shopify/InventoryItem/9991" }
    }
  }
}
```

Step B — update the InventoryItem just like before:

```bash
curl -X POST \
  https://your-store.myshopify.com/admin/api/2025-01/graphql.json \
  -H "X-Shopify-Access-Token: shpat_xxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "mutation($id: ID!, $input: InventoryItemInput!) { inventoryItemUpdate(id: $id, input: $input) { inventoryItem { id harmonizedSystemCode measurement { weight { value unit } } } userErrors { field message } } }",
    "variables": {
      "id": "gid://shopify/InventoryItem/9991",
      "input": {
        "harmonizedSystemCode": "610910",
        "measurement": { "weight": { "value": 0.20, "unit": "KILOGRAMS" } }
      }
    }
  }'
```

#### Node.js Example

```js
async function updateVariantById(variantId, { weightKg, hsCode, countryCode }) {
  // 1. Resolve the variant id → inventory item id
  const data = await gql(
    `query($id: ID!) {
      productVariant(id: $id) {
        sku
        title
        inventoryItem { id }
      }
    }`,
    { id: variantId },
  );

  if (!data.productVariant) throw new Error(`Variant not found: ${variantId}`);
  const inventoryItemId = data.productVariant.inventoryItem.id;

  // 2. Update weight + HS code on the inventory item
  const result = await gql(
    `mutation($id: ID!, $input: InventoryItemInput!) {
      inventoryItemUpdate(id: $id, input: $input) {
        inventoryItem {
          id
          harmonizedSystemCode
          countryCodeOfOrigin
          measurement { weight { value unit } }
        }
        userErrors { field message }
      }
    }`,
    {
      id: inventoryItemId,
      input: {
        harmonizedSystemCode: hsCode,
        countryCodeOfOrigin: countryCode,
        measurement: { weight: { value: weightKg, unit: "KILOGRAMS" } },
      },
    },
  );

  if (result.inventoryItemUpdate.userErrors.length) {
    throw new Error(JSON.stringify(result.inventoryItemUpdate.userErrors));
  }
  return result.inventoryItemUpdate.inventoryItem;
}

// Works even though this variant has no SKU
await updateVariantById("gid://shopify/ProductVariant/9876543210", {
  weightKg: 0.2,
  hsCode: "610910",
  countryCode: "SE",
});
```

### 7.3 By InventoryItem ID (Direct — Skip the Lookup)

If you already have the InventoryItem ID — for example because you cached it from a previous inspection, or your ERP exports inventory-item IDs — you can call `inventoryItemUpdate` straight away with no lookup query at all. This is the cheapest path: **one API call per update**.

```js
const inventoryItemId = "gid://shopify/InventoryItem/9991";

await gql(
  `mutation($id: ID!, $input: InventoryItemInput!) {
    inventoryItemUpdate(id: $id, input: $input) {
      userErrors { field message }
    }
  }`,
  {
    id: inventoryItemId,
    input: {
      harmonizedSystemCode: "610910",
      measurement: { weight: { value: 0.25, unit: "KILOGRAMS" } },
    },
  },
);
```

### 7.4 Decision Tree — Which Targeting Method Should You Use?

```
Do you already have the InventoryItem ID cached?
├── YES → use it directly (§7.3)              [1 API call]
└── NO  → Do you have a Variant ID?
         ├── YES → look up by Variant ID (§7.2)  [2 calls, works without SKU]
         └── NO  → Do all your variants have unique SKUs?
                  ├── YES → look up by SKU (§7.1)        [2 calls]
                  └── NO  → look up by Variant ID (§7.2) [2 calls, safer]
```

### 7.5 Common Targeting Mistakes

| Mistake                                            | Why it fails                                       | Fix                                                                         |
| -------------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------- |
| Passing a Product ID to `productVariant(id:)`      | Wrong object type                                  | Use `gid://shopify/ProductVariant/...`, not `gid://shopify/Product/...`     |
| Passing a Variant ID to `inventoryItemUpdate(id:)` | The mutation expects an InventoryItem ID           | Always look up `inventoryItem.id` first, then pass that                     |
| Filtering by SKU with case mismatch                | SKU match is case-sensitive                        | Compare exact strings, or `.toLowerCase()` both sides if your data is messy |
| Two variants share a SKU                           | `.find()` only returns the first match             | De-dupe SKUs in Shopify, or target by Variant ID                            |
| Trimmed/whitespaced SKU values                     | Common when SKUs are copy-pasted from spreadsheets | `sku.trim()` before comparing                                               |

---

## 8. Common Pitfalls & Tips

| Issue                                                                         | Fix                                                                                      |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Using REST `PUT /variants/{id}.json` with `weight` / `harmonized_system_code` | Deprecated for `2024-04+`. Use GraphQL `inventoryItemUpdate`.                            |
| `null` HS code in response                                                    | The field was never set — your update should populate it.                                |
| Wrong weight unit                                                             | Always pass `unit` explicitly. Shopify will not convert silently.                        |
| `Throttled` / `MAX_COST_EXCEEDED` errors                                      | Add a 200–500ms delay between calls, or switch to bulk operations.                       |
| ID format errors                                                              | Always use full GIDs like `gid://shopify/InventoryItem/12345`, not bare numeric IDs.     |
| Updating tracked inventory                                                    | Set `tracked: true` in `InventoryItemInput` if you also want inventory tracking enabled. |

---

## 9. Quick Reference

### Endpoints

**B2C:** `POST https://geggamoja.myshopify.com/admin/api/2025-01/graphql.json` — token: `SHOPIFY_ADMIN_TOKEN`

**B2B:** `POST https://geggamojab2b.myshopify.com/admin/api/2025-01/graphql.json` — token: `SHOPIFY_ADMIN_TOKEN_B2B`

The queries and mutations below are identical for both stores — only the URL and token differ.

### Lookup A — Product → All Variants' InventoryItem IDs (filter by SKU client-side)

```graphql
query ($id: ID!) {
  product(id: $id) {
    variants(first: 100) {
      edges {
        node {
          id
          sku
          title
          inventoryItem {
            id
          }
        }
      }
    }
  }
}
```

Variables: `{ "id": "gid://shopify/Product/1234567890" }`

### Lookup B — Variant ID → InventoryItem ID (works without a SKU)

```graphql
query ($id: ID!) {
  productVariant(id: $id) {
    id
    sku
    title
    inventoryItem {
      id
    }
  }
}
```

Variables: `{ "id": "gid://shopify/ProductVariant/9876543210" }`

### Mutation — Update Weight & HS Code

```graphql
mutation ($id: ID!, $input: InventoryItemInput!) {
  inventoryItemUpdate(id: $id, input: $input) {
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
    userErrors {
      field
      message
    }
  }
}
```

### Minimal Input

```json
{
  "id": "gid://shopify/InventoryItem/9991",
  "input": {
    "harmonizedSystemCode": "610910",
    "measurement": { "weight": { "value": 0.25, "unit": "KILOGRAMS" } }
  }
}
```

### Targeting Cheat-Sheet

| Goal                                                      | Path                                   |
| --------------------------------------------------------- | -------------------------------------- |
| Update **all variants** of a product                      | Lookup A → loop → Mutation per variant |
| Update **one variant**, you know the SKU                  | Lookup A → filter by SKU → Mutation    |
| Update **one variant**, no SKU available                  | Lookup B (by Variant ID) → Mutation    |
| Update **one variant**, you already have InventoryItem ID | Mutation only — no lookup              |

---

## 10. Official Docs

- InventoryItem object: <https://shopify.dev/docs/api/admin-graphql/latest/objects/InventoryItem>
- `inventoryItemUpdate` mutation: <https://shopify.dev/docs/api/admin-graphql/latest/mutations/inventoryItemUpdate>
- Product object: <https://shopify.dev/docs/api/admin-graphql/latest/objects/Product>
- Bulk operations (imports): <https://shopify.dev/docs/api/usage/bulk-operations/imports>
- Authentication (custom app tokens): <https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens>
