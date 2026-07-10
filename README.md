# Shopify Weight & HS Code — API Access & Reference

This repository supports updating product **weight** and **HS (Harmonized System) code** on the Geggamoja Shopify stores via the **Shopify Admin GraphQL API**.

## What has been set up for you

The following is **already done** — your team does not need to create or install anything in Shopify admin:

| Item | Status |
| --- | --- |
| Custom Shopify app | ✅ Created and installed |
| Admin API access | ✅ Enabled with required scopes |
| API credentials | ✅ Shared separately over a secure channel |

> **Store scope:** The app is installed on **both** Geggamoja stores — **B2C** (consumer) and **B2B** (wholesale). Each store has its **own store handle and API token**. Always use the matching pair when calling the API.

| Store | Handle | Env variables |
| --- | --- | --- |
| **B2C** (consumer) | `geggamoja` | `SHOPIFY_STORE` + `SHOPIFY_ADMIN_TOKEN` |
| **B2B** (wholesale) | `geggamojab2b` | `SHOPIFY_STORE_B2B` + `SHOPIFY_ADMIN_TOKEN_B2B` |

**Required scopes (already configured on both stores):**

- `read_products`
- `write_products`
- `read_inventory`
- `write_inventory`

---

## Using the API credentials

You will receive a `.env` file over a **secure channel** (e.g. 1Password, Bitwarden, or an encrypted message — not plain email) containing:

```env
# B2C store
SHOPIFY_STORE=geggamoja
SHOPIFY_ADMIN_TOKEN=shpat_...

# B2B store
SHOPIFY_STORE_B2B=geggamojab2b
SHOPIFY_ADMIN_TOKEN_B2B=shpat_...

SHOPIFY_API_VERSION=2025-01
```

### API endpoints

Each store has its own endpoint — **never mix a token with the wrong store URL**:

| Store | Endpoint |
| --- | --- |
| B2C | `POST https://geggamoja.myshopify.com/admin/api/2025-01/graphql.json` |
| B2B | `POST https://geggamojab2b.myshopify.com/admin/api/2025-01/graphql.json` |

### Request headers

| Header | Value |
| --- | --- |
| `X-Shopify-Access-Token` | The token for the store you are calling (B2C or B2B) |
| `Content-Type` | `application/json` |

### Quick test (cURL)

**B2C:**

```bash
curl -X POST \
  "https://geggamoja.myshopify.com/admin/api/2025-01/graphql.json" \
  -H "X-Shopify-Access-Token: YOUR_B2C_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"{ shop { name } }"}'
```

**B2B:**

```bash
curl -X POST \
  "https://geggamojab2b.myshopify.com/admin/api/2025-01/graphql.json" \
  -H "X-Shopify-Access-Token: YOUR_B2B_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"{ shop { name } }"}'
```

A successful response confirms the token is valid for that store.

> **Security:** Treat both tokens like passwords. Do not commit them to git, paste them in chat, or share them outside your dev team. If either token is ever exposed, request a new one immediately.

---

## What's included in this repo

| File / folder | Purpose |
| --- | --- |
| **`SHOPIFY_WEIGHT_HS_CODE_UPDATE.md`** | **Primary documentation.** Full API guide — data model, GraphQL queries/mutations, cURL and Node.js examples. Covers B2C and B2B, products with no variants, multiple variants, targeting by SKU, and targeting by variant ID. **Use this to build your production integration.** |
| **`scripts/`** | Optional **test/demo scripts** (Node.js). Reference implementations to verify credentials and see a working update flow. Not required for production. |
| **`lib/shopify.js`** | Shared GraphQL client used by the demo scripts. Supports `--store=b2c` (default) and `--store=b2b`. |
| **`.env.example`** | Template showing the four credential variables for both stores. |
| **`sample-products.csv`** | Example CSV format for bulk updates (placeholder IDs — replace with real IDs from your store). |
| **`README.md`** | This file — overview and quick start. |

---

## Demo scripts (optional — for testing only)

These scripts are included **for demonstration and local testing**. They are **not** intended as a production tool.

**Requirements:** Node.js 18+

```bash
npm install
cp .env.example .env
# paste all four credential values into .env
```

| Command | What it does |
| --- | --- |
| `npm run inspect -- <product-id>` | Read-only on **B2C** (default) |
| `npm run inspect -- --store=b2b <product-id>` | Read-only on **B2B** |
| `npm run update -- --product=<id> --weight=0.25 --hs=610910 --dry-run` | Preview update on B2C |
| `npm run update -- --store=b2b --product=<id> --weight=0.25 --hs=610910 --dry-run` | Preview update on B2B |
| `npm run bulk -- --store=b2b ./your-file.csv --dry-run` | Preview bulk updates on B2B |

For full script usage and flags, run:

```bash
npm run update
```

For production, follow **`SHOPIFY_WEIGHT_HS_CODE_UPDATE.md`** and integrate the GraphQL calls into your own system. In your integration, store the B2C and B2B credentials separately and route each request to the correct store endpoint.

---

## Where to start

1. Read **`SHOPIFY_WEIGHT_HS_CODE_UPDATE.md`** — this is the main integration guide.
2. Confirm both tokens with the cURL tests above (or `npm run inspect -- --store=b2c` / `--store=b2b`).
3. Implement `inventoryItemUpdate` in your own application using the examples in the doc.

---

## Support

If you receive `401` (invalid token) or `403` (access denied), contact us — we can re-issue the token or adjust app scopes.
