# Plug-And-Play Shopify App Version

This folder is the app-extension shape for a one-click install experience.

## What "one click" can mean on Shopify

Shopify supports installable apps, but storefront placement still uses a theme app extension:

- Merchant installs the app from the App Store, custom distribution link, or Dev Dashboard install link.
- The app shows an onboarding button.
- That button deep-links the merchant into the theme editor with the `Team banner designer` app block already selected for preview.
- The merchant clicks Save in the theme editor.

That is the closest approved Shopify flow for "one click" without directly editing a theme.

## Required app pieces

- `shopify.app.toml`: app config, scopes, app proxy placeholder.
- `extensions/team-banner-designer/blocks/designer.liquid`: app block shown in the theme editor.
- `extensions/team-banner-designer/assets/team-banner-designer.js`: storefront designer logic.
- `extensions/team-banner-designer/assets/team-banner-designer.css`: storefront styling.

## Deep link

After the app is deployed, use this URL from your app onboarding page:

```text
https://{shop}.myshopify.com/admin/themes/current/editor?template=product&addAppBlockId={client_id}/designer&target=newAppsSection
```

Replace:

- `{shop}` with the merchant shop domain without protocol.
- `{client_id}` with your app's Client ID from `shopify.app.toml` / Dev Dashboard.
- `designer` with the block filename handle. This kit uses `designer.liquid`, so the handle is `designer`.

## Asset manifest

The block defaults to:

```text
https://cdn.shopify.com/s/files/1/0649/3844/2958/files/team-banner-assets.shopify.json
```

Upload `team-banner-assets.shopify.json` to a public host. If Shopify Files rejects JSON, host it from your app backend or static storage.

## Design saving

For production, the app backend should expose a save endpoint. The storefront sends:

- Fabric JSON
- PNG proof image

The endpoint should return:

```json
{
  "id": "design_12345",
  "previewUrl": "https://cdn.example.com/designs/design_12345.png"
}
```

The designer reads the current product's tags and collection handles to choose the right banner mode. Use tags or collection handles such as `hem-grommets`, `pole-pocket`, `triangle`, `home-plate-pennant`, and `home-plate`.

The designer then adds the banner product to the Shopify cart with those values as line item properties. Shopify's cart API still uses `product.selected_or_first_available_variant.id` internally, even when the storefront does not expose variants to customers.

## Deployment outline

1. Replace placeholder values in `shopify.app.toml`.
2. Copy the generated JSON manifest to your public asset host.
3. Deploy the app and theme extension with Shopify CLI.
4. Release an app version in the Shopify Dev Dashboard.
5. Use custom distribution for private/one-store install, or App Store distribution for public installs.
6. Add the deep-link button to the app onboarding page.
