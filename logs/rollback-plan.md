# Rollback Plan

Run id: sports-asset-system-20260525

## Current State

No live Shopify products, collections, or theme assets were modified by this generator. All generated products are DRAFT in CSV files, and upload batches are marked not-uploaded.

## Local Rollback

1. Remove generated files:
   - `public/assets/sports`
   - `sports`
   - `imports/shopify-products-*.csv`
   - `design-tool/asset-map.json`
   - `design-tool/template-map.json`
   - `design-tool/school-logo-map.json`
   - `design-tool/qa-report.json`
   - `logs/upload-log-batch-*.json`
   - `logs/qa-results.json`
2. Restore backed-up manifests from `backups/sports-asset-system-20260525` if any tracked file is changed later.

## Shopify Production Rollback

Before any future upload/import:
1. Export current theme.
2. Export current products.
3. Export current collections.
4. Import one small DRAFT batch only.
5. Validate five products per sport.

If a future import fails:
1. Archive generated products by tag `tbd:generated-placeholder`.
2. Remove generated smart/manual collections created during the run.
3. Restore theme from backup.
4. Repoint design tool manifests to the pre-import URLs.
5. Re-run design tool QA and cart/source regression.
