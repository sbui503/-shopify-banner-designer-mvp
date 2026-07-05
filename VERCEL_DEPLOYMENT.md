# Vercel Deployment

This Vercel app hosts:

- `/team-banner-assets.shopify.json`
- `/api/designs`
- a small onboarding page at `/`

## Deployment guard

Every Vercel build must pass `npm run guard:deploy`. The guard blocks:

- retired Team Banner domain references
- missing files referenced by `public/index.html`, the designer CSS/JS, and the public JSON manifests
- unreachable boot-time remote asset URLs in `public/index.html`
- source-object fallback markers in product/source manifests, including generated placeholder SVG data URIs, product-image fallback modes, and generated-native SVG promotions
- non-matched candidate/review rows being promoted as editable source objects
- strict product graphic QA below the 99% target

Do not bypass `vercel-build` or `predeploy` for production deploys.

After deployment, update the Shopify app config:

```toml
application_url = "https://files-mentioned-by-the-user-shopify.vercel.app"

[auth]
redirect_urls = [
  "https://files-mentioned-by-the-user-shopify.vercel.app/auth/callback",
  "https://files-mentioned-by-the-user-shopify.vercel.app/auth/shopify/callback",
  "https://files-mentioned-by-the-user-shopify.vercel.app/api/auth/callback"
]

[app_proxy]
url = "https://files-mentioned-by-the-user-shopify.vercel.app/apps/team-banner-designer"
```

Then update the theme app block default manifest and save endpoint values:

```liquid
data-save-url="https://files-mentioned-by-the-user-shopify.vercel.app/api/designs"
data-assets-url="https://files-mentioned-by-the-user-shopify.vercel.app/team-banner-assets.shopify.json"
```

For permanent proof image storage, enable Vercel Blob and add this environment variable:

```text
BLOB_READ_WRITE_TOKEN
```
