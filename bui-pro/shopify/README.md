# BUI Banner Pro Shopify Product Page Embed

## Files

- `sections/bui-banner-pro-sticker-designer.liquid`: full Online Store 2.0 product-page section.
- `snippets/bui-banner-pro-custom-liquid.html`: fallback code for a Shopify Custom Liquid block.

## Install Option A: Theme Section

1. Shopify Admin -> Online Store -> Themes -> Edit code.
2. Add a new section named `bui-banner-pro-sticker-designer.liquid`.
3. Paste the contents of `shopify/sections/bui-banner-pro-sticker-designer.liquid`.
4. Open the product template in the theme customizer.
5. Add the section to the product page.
6. Set the Designer URL to the current Vercel preview or production URL.

## Install Option B: Custom Liquid Block

1. Shopify Admin -> Online Store -> Themes -> Customize.
2. Open the product page template.
3. Add a Custom Liquid block.
4. Paste the contents of `shopify/snippets/bui-banner-pro-custom-liquid.html`.

## Pricing Behavior

The widget uses a reference estimate modeled from public UPrinting-style custom sticker options and applies a 20% BUI margin. Shopify checkout cannot charge a dynamic client-side quote by itself. The quote is saved as line item properties; to charge it exactly, connect the quote to fixed variants, a draft order flow, or a Shopify pricing/cart-transform app.

Source reference reviewed: https://www.uprinting.com/custom-sticker-printing.html
