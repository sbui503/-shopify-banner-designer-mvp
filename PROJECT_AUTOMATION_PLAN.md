# Project Automation Plan

Generated: 2026-06-03

## Goal

Make the Team Banner Designer repeatably testable, deployable, and maintainable without rewriting working product code.

## Recommended automation pipeline

### 1. Static integrity checks

Run on every pull request:

```bash
for f in $(rg --files -g '*.js' -g '*.mjs' -g '!node_modules'); do node --check "$f" || exit 1; done
node -e "for (const f of require('fs').readdirSync('public').filter(f=>f.endsWith('.json'))) JSON.parse(require('fs').readFileSync('public/'+f,'utf8'))"
npm run qa:cart-source
npm run qa:graphic
```

### 2. Asset and manifest checks

Add a script that fails on:

- Placeholder hosts such as `cdn.example.com` in deployable manifests.
- Missing `templateSvg` for active products above an agreed threshold.
- SVG templates above an agreed size budget unless allowlisted.
- Public/Shopify manifest drift.

### 3. Deployment preflight

Add `scripts/preflight-deploy.mjs` to verify:

- Vercel project settings are present or `vercel pull --yes --environment preview` has been run.
- Required env vars are present in the target environment.
- `vercel.json` contains required routes/headers for static manifests and APIs.
- Shopify configs do not contain placeholder URLs/client IDs.

### 4. Smoke testing

Add Playwright or a lightweight browser smoke test that:

1. Opens the standalone designer.
2. Verifies Fabric.js loads and a canvas is initialized.
3. Adds text.
4. Opens Templates and Assets.
5. Saves an editable file.
6. Runs mobile viewport checks for status visibility and bottom bar usability.

### 5. Release/deploy flow

Recommended sequence:

1. Run static and QA checks.
2. Run deployment preflight.
3. Run `npx vercel build --yes` after project settings are pulled.
4. Deploy preview.
5. Run smoke tests against preview.
6. Promote to production.
7. Record deployment URL and commit SHA in `QA_REPORT.md` or release notes.

## Safe automations to add next

1. **Manifest drift report**: compare `public/team-banner-products.json` and Shopify packaged `team-banner-products.json`.
2. **Placeholder URL scanner**: fail if deployable JSON/CSS/JS references `cdn.example.com`.
3. **Required env checker**: fail deploy if proof storage/email env vars are missing for production.
4. **Mobile screenshot smoke test**: protect the dense mobile UI from regressions.

## Ongoing iteration checklist

After every completed task, review:

1. Missing features.
2. UX/UI improvements.
3. Performance improvements.
4. Monetization opportunities.
5. Automation opportunities.
6. Asset gaps.
7. Deployment risks.
8. SEO/ASO opportunities.

## Current prioritized backlog

1. Deployment preflight and reproducible Vercel build/deploy.
2. Layout validation triage/fix.
3. Public-to-Shopify asset/manifest sync.
4. Multi-design line-item metadata in Shopify checkout.
5. Self-hosted Fabric.js fallback.
6. SVG size optimization.
7. Buyer-facing onboarding and marketing screenshot assets.
