# Project Audit — Team Banner Designer

Generated: 2026-06-03

## Executive summary

The repository contains a Vercel-hosted custom team banner designer plus Shopify theme/app packaging. The core public designer is functional and has strong template and asset depth, but production readiness is limited by deployment configuration gaps, duplicate/unsynced Shopify package assets, a failing product-layout validation script, and a few UX/accessibility issues.

This pass applied safe, minimal improvements only:

- Added buyer-facing SEO/meta copy to the public designer and landing page.
- Added accessible canvas/status/search markup to the public designer and Shopify section.
- Kept mobile status feedback visible instead of hiding important save/error messages.
- Added visible keyboard focus outlines for key controls.
- Added bounded Fabric.js startup failure handling so the app no longer retries forever if the CDN is blocked.
- Made asset labels render with DOM text nodes instead of raw label HTML.
- Made add-to-cart/checkout flows more resilient when proof email fails after a design is already saved.

## Current architecture

- `public/index.html` is the standalone designer shell.
- `public/team-banner-designer.js` is the current full-featured browser designer runtime.
- `public/team-banner-designer.css` is the public designer stylesheet.
- `api/designs.js` saves design JSON/PNG payloads to Vercel Blob when `BLOB_READ_WRITE_TOKEN` is configured.
- `api/send-proof-email.js` sends proof emails through Resend when `RESEND_API_KEY` is configured.
- `api/image-proxy.js` proxies allowed image hosts for canvas-safe loading.
- `shopify-banner-designer/` contains the packaged Shopify theme section/assets.
- `scripts/` contains source-map, SVG, product, and QA automation utilities.

## Bugs fixed in this pass

1. **Infinite startup retry when Fabric.js is blocked**
   - Before: the runtime retried `init()` every 80ms forever if Fabric.js was unavailable.
   - After: the runtime retries for a bounded period, then shows a clear status error.

2. **Proof-email failure could make a saved cart item look unsaved**
   - Before: proof email failure after local cart persistence could show a generic save failure and encourage duplicate retries.
   - After: the cart is opened after a successful save, proof-email failures are messaged as non-blocking, and checkout can continue.

3. **Asset label HTML injection risk**
   - Before: asset cards inserted manifest labels into `innerHTML`.
   - After: image and label nodes are created explicitly, with label text assigned through `textContent`.

4. **Mobile status feedback hidden**
   - Before: mobile CSS hid `.tbd__status`, preventing users from seeing save/load/error feedback.
   - After: status messages remain visible near the mobile bottom bar.

5. **Basic accessibility gaps**
   - Added accessible labels to the asset search and canvas.
   - Added status role/atomic live-region semantics.
   - Added visible focus states for common controls.

## Remaining missing features

| Impact | Missing feature | Notes |
| --- | --- | --- |
| High | Per-line Shopify cart design metadata for multi-design carts | Current public checkout aggregates by variant; design details are checkout attributes rather than line-specific properties in the final redirect flow. |
| High | Self-hosted Fabric.js fallback or vendored dependency | CDN failure still blocks editing; now it fails gracefully, but a self-hosted fallback would improve reliability. |
| High | Production app-proxy route decision | Shopify app proxy points to `/apps/team-banner-designer`, but Vercel does not currently define a matching rewrite/handler. |
| Medium | Customer-facing onboarding/hero inside designer | The app has strong capability but limited buyer education. |
| Medium | Branded proof/watermark exports | Useful for referral/sharing loops and proof identification. |
| Medium | Merchant settings for all supported shapes | Runtime supports multiple shapes; Shopify schema/config needs parity. |

## UX/UI improvement opportunities

1. Simplify labels: rename “Assets, Art TeamName” to “Mascots & Backgrounds” or “Assets & Team Art.”
2. Add a first-run “Start here” panel with Template, Upload Logo, Add Team Name, and Add to Cart steps.
3. Add mobile-friendly save/add-to-cart progress states with clear final CTAs.
4. Add template collection chips for Baseball, Softball, Soccer, Senior Night, Sponsor, Tournament, Home Plate, and Pennants.
5. Add empty states when searches return no assets/templates.
6. Add a small checkout trust strip: proof saved, secure Shopify checkout, support email.

## Performance improvement opportunities

1. Optimize the largest `public/svg-layer-templates/legacy-*.svg` files before production; several single SVGs are multi-MB.
2. Lazy-load template panels and preview data only when the user opens Templates.
3. Add cache-busting/versioning automation for public JS/CSS when assets change.
4. Consider serving Fabric.js from the same origin with immutable cache headers.
5. Remove duplicate binary/SVG copies from deploy bundles where packaging does not require them.

## Monetization opportunities

1. Shape-based pricing: 5x3 banner, pole pocket, triangle pennant, and home plate pennant tiers.
2. Rush proof fee or designer review add-on.
3. Team bundle discounts for multiple player banners.
4. Paid mascot/background/template packs.
5. Reorder flow using saved design IDs.
6. Proof email follow-ups with approve/request-change CTAs.

## Automation opportunities

1. CI gate for `node --check`, JSON parsing, `qa:cart-source`, `qa:graphic`, and selected layout validation.
2. Manifest sync automation from `public/` to Shopify packaged assets.
3. Asset audit automation for placeholder domains, broken URLs, and oversized SVGs.
4. Deployment preflight that verifies Vercel project settings and required environment variables.
5. Screenshot smoke tests for desktop/mobile designer loading.

## Asset gaps

1. Shopify packaged product manifest is substantially behind the public manifest.
2. Placeholder generated manifest includes `cdn.example.com` URLs and should not be used in production.
3. Largest SVG templates need optimization.
4. Marketing creative is missing: screenshots, GIFs, lifestyle mockups, before/after examples, and proof/share imagery.
5. Duplicate assets exist across public and Shopify packaging trees.

## Deployment risks

1. `npx vercel build` requires pulled project settings and failed locally without them.
2. `node index.js` is not runnable with current dependencies; it imports packages not declared in `package.json`.
3. `npm run start` only prints the Node version and does not start a server.
4. Required production environment variables are not enforced by automated preflight: `BLOB_READ_WRITE_TOKEN`, `RESEND_API_KEY`, proof sender/from settings as applicable.
5. Root Shopify config contains placeholders and must not be used as production config without replacement.
6. Fabric.js CDN dependence remains a runtime risk.

## SEO/ASO opportunities

1. Continue expanding public designer metadata and Open Graph image assets.
2. Create sport/shape landing pages for “custom baseball banners,” “softball team banners,” “soccer banners,” and “home plate pennants.”
3. Add screenshots, how-it-works copy, reviews/social proof, and pricing snippets.
4. Clean product handles/titles before exposing searchable template URLs.

## Ranked recommendations by impact

1. **Fix deployment/preflight configuration**: Vercel settings, env vars, app proxy route strategy, and root server/start-script ambiguity.
2. **Resolve failing layout validation**: determine whether `validate-design-tool-product-layouts.mjs` is stale or products need normalized layout metadata.
3. **Sync public and Shopify packaged manifests/assets** so storefront behavior matches the current designer.
4. **Move multi-design checkout metadata to line-item properties** to preserve proof/design association in Shopify orders.
5. **Self-host Fabric.js and add a CDN fallback** for reliability.
6. **Optimize oversized SVG templates** to improve payload/storage performance.
7. **Add buyer-facing onboarding and growth assets** to improve conversion.

## Next 3 highest-value tasks

1. Create a deployment preflight script and update docs/config so Vercel build/deploy is reproducible from a fresh checkout.
2. Triage and fix `scripts/validate-design-tool-product-layouts.mjs` failures or revise its expectations if stale.
3. Sync Shopify packaged manifests/assets with the public production-ready manifest set.
