# Team Sport Banners Asset System Audit

Run: `sports-asset-system-20260525`

## Current Theme And Tool Structure

- Shopify theme section: `shopify-banner-designer/sections/team-banner-designer.liquid`
- Shopify theme runtime bundle: `shopify-banner-designer/assets/team-banner-designer.js`
- Standalone/Vercel runtime bundle: `public/team-banner-designer.js`
- Standalone HTML harness: `public/index.html`
- Existing design-tool asset manifest: `public/team-banner-assets.shopify.json`
- Existing product manifest: `public/team-banner-products.json`
- Existing SVG template manifest: `public/svg-layer-templates.json`
- Existing product source SVG map: `public/team-banner-source-svg-map.json`

## Existing Data Flow

1. Product/page context is read from root `data-*` attributes or URL params.
2. Products are matched through `team-banner-products.json`.
3. Native SVG product sources are resolved through `team-banner-source-svg-map.json` when available.
4. Generic template layouts are read from `svg-layer-templates.json`.
5. Asset buttons are built from `team-banner-assets.shopify.json` plus built-in generated photo frame / school sport assets.
6. Canvas objects preserve source metadata through object `data` fields such as `sourceAssetUrl`, `sourceAssetName`, `sourceRole`, `layerId`, and role tags.

## Required Naming Conventions

Asset file names:

- `sport-shape-style-background.svg`
- `sport-frame-style-photo-frame.svg`
- `sport-nameplate-style-nameplate.svg`
- `sport-icon-style-icon.svg`
- `sport-template-handle.svg`

Product handle format:

- `sport-shape-playercount-style-year`
- Example: `football-home-plate-10-player-stadium-gold-2026`

Template object IDs:

- `bg_stadium`
- `bg_lighting`
- `logo_team`
- `title_team_name`
- `player_01_photo_mask`
- `player_01_frame`
- `player_01_nameplate`
- `player_01_name`
- `player_01_number`
- `sport_icon`
- `footer_text`

Design tool categories:

- `BG Hem & Grommets`
- `BG Pole Pocket`
- `BG Triangle`
- `BG Home Plate`
- `Photo Frame`
- `Accessory`
- `Clip art`
- `Team name`

## School Logo Policy

No official school marks were copied or uploaded. All school/team entries in `school-logo-map.json` are generated placeholders and marked `generated-placeholder`.

Required metadata fields are included:

- `school_name`
- `city`
- `state`
- `mascot`
- `sport`
- `color_primary`
- `color_secondary`
- `asset_type`
- `usage_status`
- `source_url`
- `file_name`
- `alt_text`
- `design_tool_category`

## Product Count Decision

The brief requested `100 banner products total` per sport, but also requested:

- 60 Hem & Grommet / Pole Pocket products
- 24 Triangle products
- 24 Home Plate products

Those requested shape counts total 108 products per sport. The generator follows the explicit shape counts, producing 108 draft products per sport and 756 total products across 7 sports.

## Production Safety Status

Generated files are local/import-ready only. No Shopify products, collections, or theme assets were modified by the generator.

Production upload/import remains blocked until:

- Current Shopify theme backup is exported.
- Current products backup is exported.
- Current collections backup is exported.
- Official school logo usage is legally approved or explicitly provided by the client.
- A small draft import batch is validated in Shopify.
