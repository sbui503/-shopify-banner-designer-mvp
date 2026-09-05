# Owned Product Asset Recovery - Production QA

Date: 2026-09-05

## Incident and root cause

The Shopify product page supplied the correct All-Star product image and the product
catalog selected the correct owned template. During editor startup, an older secondary
source-map catalog then replaced that verified selection with a different All-Star
layout. This was the wrong-design fallback seen by customers.

Commit `0d4f727` prevents a verified owned product from being overridden by the legacy
source map. It also moves customer startup to compact owned-only runtime catalogs and
loads the full Assets and Templates catalogs only when those panels are opened.

## Production deployment

- Customer URL: https://teamsportbanners.vercel.app
- Deployment: `dpl_977X13ithPLXMrHdPjVBac3PqhYC`
- Deployment URL: https://shopify-banner-designer-66dx9fhvq-sbui503s-projects.vercel.app
- Product fix commit: `0d4f727`
- Owned asset recovery commit: `4de7c79`

## Exact product verification

### All-Star - Baseball Banner

- Shopify product: https://teamsportbanners.com/products/all-star-baseball-banner
- Exact template: `/svg-layer-templates/1641354165414.svg`
- Result: exact red, white, and blue Shopify artwork loaded
- Editable layers: 27
- Text test: Player text 1 changed from `Player` to `Sia` on the live canvas

Evidence:

- `android-live-storefront-all-star-product.png`
- `android-live-storefront-all-star-customize.png`
- `android-live-all-star-correct-art.png`
- `android-live-all-star-27-layers.png`
- `android-live-all-star-player-sia.png`

### Alligators - Softball Banner

- Exact template: `/svg-layer-templates/1640157147372.svg`
- Result: exact Alligators artwork loaded
- Editable layers: 28

Evidence:

- `android-live-alligators-correct-art.png`
- `android-live-alligators-28-layers.png`

## Owned-source policy

- Runtime product, asset, mapping, and template catalogs contain no legacy host URLs.
- SVG image references are resolved through the owned asset map and sanitized before
  the SVG is parsed by Fabric or rendered on the canvas.
- Direct legacy-host proxy requests return HTTP 400.
- Owned Vercel Blob image proxy requests return HTTP 200.
- The exact All-Star runtime template and all four runtime catalogs return HTTP 200.

Approved runtime sources are the Team Sport Banners app origin, Team Sport Banners
Shopify/CDN origins, and the owned Vercel Blob store. The blocked legacy sources are
the LCT S3 hosts, `sv.lct.vn`, and `teambannersports.com`.

## Catalog coverage

- Products: 7,535
- Assets: 9,488
- Exact recovered assets: 7,982
- Recreated owned substitutes where the original was unavailable: 1,506
- Owned mapping keys: 19,062
- Product SVG templates: 5,866
- Historical SVG image paths with an owned replacement: 41,877

## Automated verification

Passed:

- `npm run qa:owned-assets` (6/6)
- `npm run build`
- `npm run qa:design-save` (9/9)
- `npm run qa:open-editable` (9/9)
- `npm run qa:cart-source` (7,535 products)
- `npm run qa:mobile-text`
- `npm run qa:layered-svg` (3/3)
- `npm run qa:illustrator-svg` (2/2)
- `npm run qa:svg-delivery` (2/2)
- `npm run qa:generator-layout` (2/2)
- `node --check public/team-banner-designer.js`
- `git diff --check`

## Remaining disclosure

The 1,506 unavailable original asset records use owned recreated substitutes. They do
not contact a legacy source. The All-Star and Alligators products verified in this
incident use exact recovered artwork, not recreated substitutes.
