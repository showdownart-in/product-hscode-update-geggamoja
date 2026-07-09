# Shopify Weight & HS Code — API Access & Reference

This repository supports updating product **weight** and **HS (Harmonized System) code** on the Geggamoja Shopify store via the **Shopify Admin GraphQL API**.

## What has been set up for you

The following is **already done** on the Shopify store — your team does not need to create or install anything in Shopify admin:

| Item | Status |
| --- | --- |
| Custom Shopify app | ✅ Created and installed |
| Admin API access | ✅ Enabled with required scopes |
| API credentials | ✅ Shared separately over a secure channel |

> **Store scope:** The app is installed on the **B2C store only**. It is **not** installed on the B2B store. Use the credentials provided for the B2C store when calling the API.

**Required scopes (already configured):**

- `read_products`
- `write_products`
- `read_inventory`
- `write_inventory`

---

## Using the API credentials

You will receive two values over a **secure channel** (e.g. 1Password, Bitwarden, or an encrypted message — not plain email):

| Variable | Description | Example |
| --- | --- | --- |
| `SHOPIFY_STORE` | Store handle (part before `.myshopify.com`) | `geggamoja` |
| `SHOPIFY_ADMIN_TOKEN` | Admin API access token | `shpat_...` |

### API endpoint

```
POST https://{SHOPIFY_STORE}.myshopify.com/admin/api/2025-01/graphql.json
```

### Request headers

| Header | Value |
| --- | --- |
| `X-Shopify-Access-Token` | Your Admin API access token |
| `Content-Type` | `application/json` |

### Quick test (cURL)

Replace placeholders with the credentials you received:

```bash
curl -X POST \
  "https://YOUR-STORE.myshopify.com/admin/api/2025-01/graphql.json" \
  -H "X-Shopify-Access-Token: YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"{ shop { name } }"}'
```

A successful response confirms the token is valid.

> **Security:** Treat the token like a password. Do not commit it to git, paste it in chat, or share it outside your dev team. If it is ever exposed, request a new token immediately.

---

## What's included in this repo

| File / folder | Purpose |
| --- | --- |
| **`SHOPIFY_WEIGHT_HS_CODE_UPDATE.md`** | **Primary documentation.** Full API guide — data model, GraphQL queries/mutations, cURL and Node.js examples. Covers products with no variants, multiple variants, targeting by SKU, and targeting by variant ID. **Use this to build your production integration.** |
| **`scripts/`** | Optional **test/demo scripts** (Node.js). Reference implementations to verify credentials and see a working update flow. Not required for production. |
| **`lib/shopify.js`** | Shared GraphQL client used by the demo scripts. |
| **`.env.example`** | Template for local testing — copy to `.env` and paste in the credentials you received. |
| **`sample-products.csv`** | Example CSV format for bulk updates (placeholder IDs — replace with real product/variant IDs from your store). |
| **`README.md`** | This file — overview and quick start. |

---

## Demo scripts (optional — for testing only)

These scripts are included **for demonstration and local testing**. Your team can use them to confirm the API credentials work before building your own integration. They are **not** intended as a production tool.

**Requirements:** Node.js 18+

```bash
npm install
cp .env.example .env
# paste SHOPIFY_STORE and SHOPIFY_ADMIN_TOKEN into .env
```

| Command | What it does |
| --- | --- |
| `npm run inspect -- <product-id>` | Read-only — shows current weight, HS code, and IDs for a product |
| `npm run update -- --product=<id> --weight=0.25 --hs=610910 --dry-run` | Preview an update without writing |
| `npm run bulk -- ./your-file.csv --dry-run` | Preview bulk updates from CSV |

For full script usage and flags, run:

```bash
npm run update
```

For production, follow **`SHOPIFY_WEIGHT_HS_CODE_UPDATE.md`** and integrate the GraphQL calls into your own system (ERP, middleware, cron job, etc.).

---

## Where to start

1. Read **`SHOPIFY_WEIGHT_HS_CODE_UPDATE.md`** — this is the main integration guide.
2. Confirm credentials with the cURL test above (or `npm run inspect` if using the demo scripts).
3. Implement `inventoryItemUpdate` in your own application using the examples in the doc.

---

## Support

If you receive `401` (invalid token) or `403` (access denied), contact us — we can re-issue the token or adjust app scopes.
