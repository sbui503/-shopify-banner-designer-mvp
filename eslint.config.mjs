import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default [
  {
    ignores: [
      ".next/**",
      ".vercel/**",
      "node_modules/**",
      "public/**",
      "shopify-banner-designer/**",
      "shopify-banner-designer-app/**",
      "outputs/**",
      "output/**",
      ".playwright-cli/**"
    ]
  },
  ...nextVitals,
  ...nextTypescript
];
