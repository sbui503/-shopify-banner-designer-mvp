# AGENTS.md

## Cursor Cloud specific instructions

### What this repo is
"Team Banner Designer" — a Vercel-hosted app made of:
- **Static frontend** in `public/` (the actual product): a fabric.js banner design editor. Entry point is `public/index.html` (served at `/`), plus `public/team-banner-designer.js` / `.css` and large JSON asset manifests (`team-banner-products.json`, `svg-layer-templates.json`, `team-banner-source-svg-map.json`, `team-banner-assets.shopify.json`).
- **Serverless API** in `api/*.js` (Vercel functions): `designs.js` (save design → Vercel Blob), `image-proxy.js` (allow-listed image proxy), `send-proof-email.js` (proof email via Resend).
- **Guard/QA scripts** in `scripts/*.mjs` used as the build/CI gate.
- `index.js` at the repo root is a legacy Shopify Express stub; it is NOT the Vercel app and its dependencies are not installed. Ignore it for dev.

### Node / package manager
- Node **24.x is required** (`engines` in `package.json`); `yarn install` hard-fails on other versions. Interactive login shells already default to Node 24 (nvm default is set and `~/.bashrc` sources nvm). The base `/exec-daemon/node` is v22, so non-interactive shells may need `nvm use 24` first.
- Package manager is **yarn classic** (`yarn.lock`). The dependency set is tiny (`@vercel/blob`, `vercel` CLI).

### Lint / test / build
- There is no separate `lint`. The build/CI gate is `npm run guard:deploy` (also wired as `vercel-build` and `predeploy`). It runs `guard:legacy-domains`, `guard:assets`, `guard:true-source-objects`, and `qa:graphic:strict`. It passes at 100% on a clean checkout.
- Other QA scripts live in `package.json` (`qa:graphic`, `qa:cart-source`, etc.).
- Known pre-existing failure: `npm run qa:cart-source` exits non-zero (source-map/background divergence for `watermelons-soccer-banner`). It is NOT part of `guard:deploy`/CI, so it does not block the build. Don't "fix" it as part of setup.

### Running the app (dev)
- The documented dev command is `vercel dev`, but it **requires Vercel login** (`vercel login` or a `VERCEL_TOKEN`/`--token`). Without credentials it blocks on device authentication and cannot serve.
- To run/verify locally **without Vercel auth**, the app is just static files + Node request-handler functions. Serve `public/` as the web root and route `/api/<name>` to `api/<name>.js` (each exports a default `(req,res)` handler using Vercel's `res.status().json()/.send()` helpers, so shim those on a plain Node `http` response). The API functions degrade gracefully when secrets are absent: `designs` returns a `warning` without `BLOB_READ_WRITE_TOKEN`, `send-proof-email` returns `skipped` without `RESEND_API_KEY`.
- Optional runtime secrets (only needed for full persistence/email): `BLOB_READ_WRITE_TOKEN` (Vercel Blob), `RESEND_API_KEY` + `PROOF_EMAIL_TO`/`PROOF_EMAIL_FROM`.

### Gotcha: browser out-of-memory on load
The frontend eagerly fetches ~150MB of JSON manifests at startup. In a headless/limited-RAM browser this triggers Chrome "Aw, Snap! (Error code: 4)" crashes. When testing in a browser, launch Chrome with larger memory limits (e.g. `--max-old-space-size=4096 --disable-dev-shm-usage`) and allow up to ~60s for first load.
