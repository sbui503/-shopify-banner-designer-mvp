# Asset Host Audit - 2026-07-05

## Cause

The earlier asset migration moved the primary product and design-tool asset URLs, but historical metadata fields were still shipped in public manifests. Those fields included legacy source-host provenance and closed storefront product-page links. The designer also treated `__source_svg_vector_background__` as a white locked shape, so products without a separated background asset could render with a blank background.

## Scope

- `public/team-banner-products.json`: 7,535 product links rewritten to app-local designer links.
- `public/team-banner-source-svg-map.json`: 7,535 source-map product links rewritten to app-local designer links.
- `public/svg-layer-templates.json`: 399 source template references rewritten to local template paths.
- Runtime checkout defaults no longer generate links to a closed storefront.
- Image proxy no longer allows the closed storefront host.

## Background Failure Class

- 250 products use `__source_svg_vector_background__`.
- Shape split: 164 triangle, 48 rectangle, 33 pole-pocket, 5 home-plate.
- 189 of those have live product-image fallbacks.
- 61 have missing product-image URLs, but all 61 have local SVG template fallbacks.

## Runtime Fix

- Product handles in app-local query links are now recognized by the loader.
- Exact product image is used first for vector-background products when it loads.
- If the product image is unavailable and a local SVG template exists, the loader falls through to SVG layers instead of retrying the same broken image.
- Template preview fallback now accepts local SVG templates even when the product image is missing.

## Verification

- `node --check public/team-banner-designer.js`
- `node --check api/image-proxy.js`
- JSON parse check passed for products, source maps, and SVG template manifests.
- Host-reference scan returned zero matches for retired source hosts and the closed storefront domain across changed runtime files.
- `git diff --check`
