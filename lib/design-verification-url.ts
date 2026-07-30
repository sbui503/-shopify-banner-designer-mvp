const DEFAULT_CUSTOMER_TOOL_ORIGIN = "https://teamsportbanners.vercel.app";

type LayerVerificationUrlInput = {
  sourceSvgUrl?: string;
  productTitle?: string;
  designId?: string;
  origin?: string;
};

export function buildLayerVerificationUrl(input: LayerVerificationUrlInput) {
  const sourceSvgUrl = String(input.sourceSvgUrl || "").trim();
  if (!sourceSvgUrl) return "";

  const origin = String(input.origin || DEFAULT_CUSTOMER_TOOL_ORIGIN).replace(/\/+$/, "");
  const url = new URL(origin);
  url.searchParams.set("templateSvg", sourceSvgUrl);
  url.searchParams.set("productTitle", input.productTitle || `Recovered design ${input.designId || ""}`.trim());
  url.searchParams.set("autoLoadProduct", "1");
  url.searchParams.set("autoLayer", "svg");
  url.searchParams.set("panel", "layers");
  url.hash = "team-banner-designer-section";
  return url.toString();
}
