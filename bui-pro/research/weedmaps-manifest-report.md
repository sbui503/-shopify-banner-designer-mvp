# Weedmaps Brand And Strain Manifest Report

## Recommendation

Use a licensed manifest workflow instead of scraping Weedmaps pages. BUI Pro can import brand logos and strain hero backgrounds from JSON, but each asset row should include source URL, license status, and attribution. Weedmaps brands are likely future users, so the clean path is partner-provided brand kits or an authorized API/export.

Official Weedmaps integration notes:
- Weedmaps authorization uses OAuth2 Client Credentials and requires authorization from a Listing Owner before accessing resources: https://developer.weedmaps.com/docs/oauth
- Weedmaps access tokens are requested from `POST https://api-g.weedmaps.com/auth/token` and can include scopes such as `taxonomy:read`, `brands:read`, and `products:read`: https://developer.weedmaps.com/docs/obtaining-an-access-token
- Weedmaps documents `GET https://api-g.weedmaps.com/wm/2025-07/partners/strains` for syncing the Strains catalog, with `page_size` up to 150: https://developer.weedmaps.com/reference/get_strains
- Weedmaps documents `GET https://api-g.weedmaps.com/wm/2025-07/partners/brands` for syncing the Universal Brand Catalog, with filters for name, published state, and updated time: https://developer.weedmaps.com/reference/get_brands
- Weedmaps image docs show image URLs are managed as API fields for menu items, so BUI Pro should treat image/logo URLs as licensed external inputs rather than copied page assets: https://developer.weedmaps.com/docs/working-with-images

## Brand Asset Manifest

Use `data/brand-assets.schema.json` and `data/brand-assets.sample.json`.

Required fields:
- `slug`
- `name`
- `logo.url`
- `licenseStatus`

Recommended fields:
- `sourceUrl`
- `colors`
- `categories`
- `logo.transparent`
- `logo.format`

## Strain Hero Manifest

Use `data/strain-hero-manifest.schema.json` and `data/strain-hero-manifest.sample.json`.

The user-requested page range is represented as:
- `sourceRange.pageStart: 1`
- `sourceRange.pageEnd: 588`
- `sourceRange.pageSize`

The generator script `scripts/build-weedmaps-strain-manifest.mjs` converts an authorized API/export JSON into the BUI import format.

The fetch helper `scripts/fetch-weedmaps-catalog-export.mjs` can pull an authorized export into `data/weedmaps-strains-export.json` when `WEEDMAPS_ACCESS_TOKEN` is set. It defaults to the user-requested page range:
- page 1
- page 588
- page size 20

After the export exists, run `npm run manifest:strain -- data/weedmaps-strains-export.json data/strain-hero-manifest.generated.json`.

## Authorized Brand Export

Use `scripts/fetch-weedmaps-catalog-export.mjs` for `brands`, then convert the raw export with `scripts/build-weedmaps-brand-manifest.mjs`.

Token-safe command shape:
- `WEEDMAPS_ACCESS_TOKEN=... npm run weedmaps:fetch:brands`
- `npm run manifest:brand -- data/weedmaps-brands-export.json data/brand-assets.generated.json`

Do not commit generated files that contain unlicensed third-party URLs unless the license status is confirmed and the source is approved.

## Blockers

- Do not scrape or copy protected Weedmaps imagery without permission.
- A 588-page harvest needs rate limiting, retries, and written source approval.
- Weedmaps API onboarding and Listing Owner authorization are external prerequisites.
- The public Weedmaps website is not a safe source of bulk image extraction for a production sales demo.
- Some image URLs may block canvas export/3D texture use unless CORS headers allow it.
- Imported external URLs can disappear; production should eventually proxy/cache licensed files in owned storage.

## Next Step

Get either a Weedmaps-approved export/API feed or a partner-provided brand kit folder. Then run the manifest builder and import the resulting JSON through the BUI Pro Assets panel.
