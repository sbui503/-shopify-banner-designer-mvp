# Shopify Deployment Notes

This kit turns the local banner designer into a Shopify Online Store 2.0 section.

## What I found

- The current HTML file is a single-page Fabric.js designer.
- It embeds one asset inline as base64.
- The ZIP has 9,178 real PNG/SVG image assets, plus `__MACOSX` metadata entries.
- The ZIP expands to roughly 1.8 GB, so it should not be uploaded directly into a Shopify theme.

## Recommended production setup

1. Upload the image library to durable public asset storage.
   - Good: Shopify Content > Files for a curated set, Cloudinary, S3/R2, or a Shopify app backend.
   - Avoid: putting thousands of images into theme assets.

2. Generate a JSON manifest with this shape:

```json
{
  "assets": [
    {
      "name": "Destroyers",
      "category": "Team name",
      "url": "https://cdn.shopify.com/s/files/.../destroyers.png"
    }
  ]
}
```

You can generate a starter manifest from the ZIP file list:

```sh
unzip -Z1 "Team Banner Design Tool - Create & Customize Online _ Team Banner Sports 2.zip" > zip-file-list.txt
node scripts/zip-list-to-manifest.mjs zip-file-list.txt https://cdn.example.com/team-banner-assets/ > team-banner-assets.json
```

For this store, I generated:

```text
assets/team-banner-assets.shopify.json
```

It points image URLs at:

```text
https://cdn.shopify.com/s/files/1/0649/3844/2958/files/
```

3. Upload `team-banner-assets.shopify.json` somewhere public and paste its URL into the section setting named `Hosted assets manifest URL`.
   - Shopify Content > Files might reject `.json` depending on the admin uploader. If it does, host the JSON on your app backend, Cloudflare R2, S3, or another public static host.

4. Add a design-save endpoint.
   - The storefront should POST the final PNG and Fabric JSON to your backend.
   - The backend should store the files and return:

```json
{
  "id": "design_12345",
  "previewUrl": "https://cdn.example.com/designs/design_12345.png"
}
```

5. The section adds the selected product variant to cart with line item properties:
   - `Design ID`
   - `Design Preview`
   - `Team Name`

## Theme install

Copy these files into the active theme:

- `sections/team-banner-designer.liquid`
- `assets/team-banner-designer.css`
- `assets/team-banner-designer.js`

Then in Shopify Admin:

1. Go to `Online Store > Themes > Customize`.
2. Open the product template or page where customers should design banners.
3. Add the `Team banner designer` section.
4. Select the banner product.
5. Add your hosted assets manifest URL.
6. Add your design-save endpoint URL.

## Why the save endpoint matters

Shopify cart line item properties are meant for short customization data. A full generated PNG or large Fabric canvas JSON can be too large and unreliable there. Store the design outside the cart, then attach a short design ID and preview URL to the order.
