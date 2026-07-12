# Vercel Deployment

This Vercel app hosts:

- `/team-banner-assets.shopify.json`
- `/api/designs`
- a small onboarding page at `/`

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
