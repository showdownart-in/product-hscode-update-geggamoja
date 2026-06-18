# Shopify Weight & HS Code Updater — Test Scripts

Small Node.js test scripts that update **weight** and **HS (Harmonized System) code** on Shopify products using the Admin GraphQL API. Works for **products with no variants** and **products with multiple variants**.

For the full API explanation, see [`SHOPIFY_WEIGHT_HS_CODE_UPDATE.md`](./SHOPIFY_WEIGHT_HS_CODE_UPDATE.md).

---

## 1. Setup

Requires **Node.js 18+** (uses the global `fetch`).

```bash
# 1. Install dependencies
npm install

# 2. Copy env template and paste in the credentials you were sent
cp .env.example .env
# then edit .env:
#   SHOPIFY_STORE=your-store          (the part before .myshopify.com)
#   SHOPIFY_ADMIN_TOKEN=shpat_xxxxx   (Admin API access token)
#   SHOPIFY_API_VERSION=2025-01
```

> **The custom app is already installed on the Shopify store** with the required scopes (`read_products`, `write_products`, `read_inventory`, `write_inventory`).
> You don't need to create or install anything in the Shopify admin — the **store handle** and **Admin API access token** will be shared with you over a **secure channel** (e.g. 1Password, Bitwarden, or an encrypted message — never plain email/chat). Paste them into `.env` and you're ready to go.

---

## 2. What the Scripts Do

| Script | Command | Purpose |
| --- | --- | --- |
| `scripts/inspect-product.js` | `npm run inspect` | Read-only — prints all variants of a product with their current weight, HS code, country, and inventory-item IDs. |
| `scripts/update-product.js` | `npm run update` | Updates weight and/or HS code for a single product. Supports targeting one variant by SKU, or all variants. |
| `scripts/bulk-update.js` | `npm run bulk` | Updates many products/variants from a CSV file. |

All scripts support a `--dry-run` flag where applicable so you can preview without writing.

---

## 3. Usage

### 3.1 Inspect a product first (recommended)

```bash
npm run inspect -- 1234567890
# or with the full GID
npm run inspect -- gid://shopify/Product/1234567890
# or with the admin URL
npm run inspect -- https://admin.shopify.com/store/your-store/products/1234567890
```

This prints a table showing every variant's current weight, HS code, country, and `InventoryItem` ID. Use it to confirm you've got the right product before updating.

### 3.2 Update a single product

Update **all** variants of a product (works for both no-variant and multi-variant products):

```bash
npm run update -- --product=1234567890 --weight=0.25 --hs=610910
```

Update with a different unit and a country of origin:

```bash
npm run update -- --product=1234567890 --weight=250 --unit=GRAMS --country=SE --hs=610910
```

Update **only one variant** by SKU:

```bash
npm run update -- --product=1234567890 --sku=TSHIRT-S-RED --weight=0.20
```

Update **a variant that has no SKU** by variant id (get the id from `npm run inspect` — it's the `gid://shopify/ProductVariant/...` value, or just the trailing number):

```bash
npm run update -- --variant=9876543210 --weight=0.20 --hs=610910
```

Update an inventory item directly (advanced — useful if you already have the inventory-item id):

```bash
npm run update -- --inventory-item=55667788 --weight=0.20 --hs=610910
```

Preview what would change without writing:

```bash
npm run update -- --product=1234567890 --weight=0.30 --hs=610910 --dry-run
```

**Flags:**

| Flag | Required | Notes |
| --- | --- | --- |
| `--product=<id\|gid\|url>` | one of product/variant/inventory-item | Update all variants on a product (or one when combined with `--sku`) |
| `--variant=<id\|gid\|url>` | one of product/variant/inventory-item | Update one variant by variant id — **works even if the variant has no SKU** |
| `--inventory-item=<id\|gid>` | one of product/variant/inventory-item | Update one inventory item directly |
| `--sku=<sku>` | no | Used with `--product` to pick one variant |
| `--weight=<number>` | one of weight/hs/country | Weight value, e.g. `0.25` |
| `--hs=<code>` | one of weight/hs/country | HS code, e.g. `610910` |
| `--country=<ISO2>` | one of weight/hs/country | e.g. `SE`, `IN`, `US` |
| `--unit=<KILOGRAMS\|GRAMS\|POUNDS\|OUNCES>` | no | Default `KILOGRAMS` |
| `--dry-run` | no | Don't write, just print |

> **Tip — finding the variant id.** Run `npm run inspect -- <product-id>`. The first column shows each variant's full GID, e.g. `gid://shopify/ProductVariant/9876543210`. You can pass that GID, the bare number, or even a Shopify admin URL that contains `/variants/9876543210`.

### 3.3 Bulk update from CSV

CSV format (header required, column order doesn't matter) — see [`sample-products.csv`](./sample-products.csv):

```csv
product_id,sku,variant_id,inventory_item_id,weight,unit,hs_code,country
1234567890,,,,0.25,KILOGRAMS,610910,SE
1234567890,TSHIRT-S-RED,,,0.20,KILOGRAMS,610910,SE
,,9876543210,,0.30,KILOGRAMS,610910,SE
,,,55667788,300,GRAMS,420212,IN
```

**Targeting rules** (highest priority first — each row picks ONE):

1. `inventory_item_id` set → update that inventory item directly
2. `variant_id` set → update that one variant (**works for variants without a SKU**)
3. `product_id` + `sku` → update the variant with that SKU on that product
4. `product_id` only → update **all** variants of the product

**Update fields** — leave any of these blank to skip:

- `weight` — numeric, e.g. `0.25`
- `unit` — `KILOGRAMS` (default), `GRAMS`, `POUNDS`, `OUNCES`
- `hs_code` — e.g. `610910`
- `country` — ISO-2 code, e.g. `SE`

Run:

```bash
npm run bulk -- ./sample-products.csv --dry-run   # preview
npm run bulk -- ./sample-products.csv             # actually write
```

---

## 4. Safety Notes

- **Always run `--dry-run` first**, especially for bulk updates.
- **Test on one product** before running across the catalog.
- Scripts add a small 200 ms delay between calls to stay under Shopify's GraphQL cost limit. If you still hit `THROTTLED`, increase the delay in the script.
- `.env` is in `.gitignore` — never commit your access token.
- The token has full write access to products and inventory. **Revoke it from the Shopify admin when testing is done.**

---

## 5. Troubleshooting

| Message | Likely cause |
| --- | --- |
| `Missing SHOPIFY_STORE or SHOPIFY_ADMIN_TOKEN` | `.env` not created or values blank |
| `HTTP 401` / `Invalid API key or access token` | Wrong/expired token, or app not installed |
| `HTTP 403` / `Access denied` | Custom app is missing `write_inventory` scope |
| `Product not found` | Wrong product id, or product is in a different store |
| `THROTTLED` | Increase the `setTimeout(... , 200)` delay, or run in smaller batches |
| `harmonizedSystemCode` still `null` after update | Make sure you passed it correctly; rerun `npm run inspect` to confirm |
# shopify-weight-hs-code-updater
# shopify-weight-hs-code-updater
