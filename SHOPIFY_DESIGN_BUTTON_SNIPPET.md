# Shopify Product Button Snippet

Paste this in the product template where the `Design It Yourself` button should appear.

The site can use product collections and tags instead of variants. Add one tag or collection handle per product type, for example:

- `hem-grommets` or `banner`
- `pole-pocket`
- `triangle` or `triangle-pennant`
- `home-plate-pennant`
- `home-plate`

Shopify still requires one hidden line-item ID for checkout, so use `product.selected_or_first_available_variant.id` behind the scenes. Customers do not need to choose variants.

```liquid
{% assign designer_url = 'https://files-mentioned-by-the-user-shopify.vercel.app/' %}
{% assign product_image = product.featured_image | image_url: width: 1600 %}
{% assign product_tags = product.tags | join: ',' %}
{% assign product_collections = product.collections | map: 'handle' | join: ',' %}

<a
  class="button button--secondary"
  href="{{ designer_url }}?productTitle={{ product.title | url_encode }}&productHandle={{ product.handle | url_encode }}&productImage={{ product_image | url_encode }}&productTags={{ product_tags | url_encode }}&productCollections={{ product_collections | url_encode }}&cartVariantId={{ product.selected_or_first_available_variant.id }}&sizeLabel={{ '60" x 36"' | url_encode }}&price={{ product.price | money_without_currency | url_encode }}&autoLoadProduct=1&autoLayer=png"
>
  Design It Yourself
</a>
```

If you ever need to override the collection/tag detection, you can still pass `productShape` directly:

```liquid
{% assign designer_shape = 'triangle' %}
{% assign designer_shape = 'polepocket' %}
{% assign designer_shape = 'homeplatepennant' %}
{% assign designer_shape = 'homeplate' %}
{% assign designer_shape = 'banner' %}
```

For exact editable SVG layers, add a product metafield that stores the product SVG file URL and use this version:

```liquid
{% assign designer_url = 'https://files-mentioned-by-the-user-shopify.vercel.app/' %}
{% assign product_image = product.featured_image | image_url: width: 1600 %}
{% assign product_svg = product.metafields.custom.design_svg | file_url %}
{% assign product_tags = product.tags | join: ',' %}
{% assign product_collections = product.collections | map: 'handle' | join: ',' %}

<a
  class="button button--secondary"
  href="{{ designer_url }}?productTitle={{ product.title | url_encode }}&productHandle={{ product.handle | url_encode }}&productImage={{ product_image | url_encode }}&templateSvg={{ product_svg | url_encode }}&productTags={{ product_tags | url_encode }}&productCollections={{ product_collections | url_encode }}&cartVariantId={{ product.selected_or_first_available_variant.id }}&sizeLabel={{ '60" x 36"' | url_encode }}&price={{ product.price | money_without_currency | url_encode }}&autoLoadProduct=1&autoLayer=svg"
>
  Design It Yourself
</a>
```

For live Shopify checkout, the strongest setup is still the embedded Shopify section/app block because `/cart/add.js` runs on `teamsportbanners.com`. The Vercel link is best as the test/proof URL unless you also redirect back to Shopify after saving.
