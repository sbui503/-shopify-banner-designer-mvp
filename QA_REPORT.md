# QA Report — Team Banner Designer

Generated: 2026-06-03

## Summary

This pass completed a repository audit, delegated asset/UI/creative/QA inspections, implemented safe fixes, and ran local QA commands. The designer JavaScript passes syntax checks and the main cart/source and graphic QA gates pass. Deployment is not fully verified because Vercel credentials/project access and DNS resolution were unavailable in this environment.

## Changes validated

- Public and Shopify packaged designer runtimes now fail gracefully if Fabric.js is blocked.
- Public cart save flow no longer treats proof-email failure as a total cart-save failure.
- Shopify custom checkout flow no longer blocks checkout solely because proof email failed.
- Asset cards now render manifest labels with text nodes instead of raw label HTML.
- Public and Shopify markup now labels the asset search, canvas, and status region.
- Mobile CSS keeps the status message visible.
- Keyboard focus styles were added for key controls.

## Commands run

| Status | Command | Result |
| --- | --- | --- |
| Pass | `node --check public/team-banner-designer.js` | No syntax errors. |
| Pass | `node --check shopify-banner-designer/assets/team-banner-designer.js` | No syntax errors. |
| Pass | `node --check api/designs.js && node --check api/image-proxy.js && node --check api/send-proof-email.js` | No syntax errors. |
| Pass | `npm run qa:cart-source` | Passed with `ok: true`, 7,535 checked source rows, checkout/cart regression flags true. |
| Pass | `npm run qa:graphic:strict` | Exited 0; 99.44% pass rate and target met, with 42 source-gate failures remaining for follow-up. |
| Pass | `python3 -m http.server 4173 --bind 127.0.0.1` + `fetch('http://127.0.0.1:4173/public/index.html')` | Static designer page returned 200 and contained the new status/canvas accessibility markup. |
| Warning | `command -v chromium || command -v google-chrome || command -v firefox` | No browser executable was installed, so screenshot capture was not possible. |
| Fail | `node scripts/validate-design-tool-product-layouts.mjs` | Exited 2; 0 / 7,526 active products passed. Follow-up required. |
| Warning | `npx vercel build --yes` | Failed because the Vercel token is invalid and npm registry DNS lookup returned `EAI_AGAIN`. |
| Warning | `npx vercel deploy --yes` | Failed because no Vercel credentials were available and DNS lookup to `vercel.com` returned `EAI_AGAIN`. |

## Known failures / risks from delegated QA

1. `node scripts/validate-design-tool-product-layouts.mjs` reportedly exits 2 with all active layouts failing. This is the top product QA follow-up.
2. `node index.js` reportedly fails because undeclared server dependencies are missing. Clarify whether `index.js` is legacy or add the required dependencies/start script.
3. `npm run start` only prints Node version, so it is not a real production server command.
4. `BLOB_READ_WRITE_TOKEN` and `RESEND_API_KEY` are optional at runtime but required for permanent saved proofs and proof emails.
5. Shopify app-proxy route `/apps/team-banner-designer` is configured in Shopify app TOML but not explicitly handled in `vercel.json`.
6. The Shopify packaged product manifest is behind the public manifest.

## Recommendation ranking

1. **Critical:** Make Vercel build/deploy reproducible and document/link project settings.
2. **Critical:** Triage/fix product layout validation.
3. **High:** Sync public and Shopify packaged manifests/assets.
4. **High:** Preserve per-design metadata as Shopify line-item properties in checkout.
5. **Medium:** Self-host Fabric.js or add a reliable fallback.
6. **Medium:** Optimize oversized SVG templates.
7. **Medium:** Add screenshot smoke tests.

## Next 3 highest-value tasks

1. Add and run deployment preflight automation for Vercel/Shopify/env settings.
2. Fix or recalibrate `validate-design-tool-product-layouts.mjs` failures.
3. Sync Shopify packaged product/template manifests from the public source of truth.

## Deployment status

Deployment was attempted through local Vercel tooling but blocked by missing/invalid Vercel credentials and DNS lookup failures to Vercel/npm hosts. No production deployment was confirmed in this environment.
