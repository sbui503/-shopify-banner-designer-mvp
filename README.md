# Team Sport Banners - Shopify App MVP

## One-Click Demo
1. Open `demo/index.html` in Chrome/Edge - works offline with all assets

## One-Click Shopify Install
```bash
npm install -g @shopify/cli @shopify/theme
cd team-sport-banners-mvp
shopify app dev
```

## Production Deploy
```bash
shopify app deploy
```

## Setup API Keys
1. partners.shopify.com > Apps > Create app
2. Copy to `.env`:
SHOPIFY_API_KEY=your_key
SHOPIFY_API_SECRET=your_secret
SCOPES=write_products,write_orders,read_themes,write_files
HOST=https://your-domain.com

## Merchant Use
1. Online Store > Themes > Customize
2. Add section > Apps > Banner Designer
3. Assign to banner product template

Canvas: 5ft x 3ft @ 100 DPI = 6000x3600px
Export: PNG/JPG/PDF/SVG up to 300 DPI with bleed + crop marks
