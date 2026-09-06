const DEFAULT_CUSTOMER_TOOL_ORIGIN = "https://teamsportbanners.vercel.app";

type LayerVerificationUrlInput = {
  sourceSvgUrl?: string;
  productTitle?: string;
  designId?: string;
  origin?: string;
  shape?: string;
  width?: number;
  height?: number;
};

type AdminDesignSvgUrlInput = {
  designId?: string;
  sourceSvgUrl?: string;
  sourceSvgDownloadUrl?: string;
  download?: boolean;
};

export function buildAdminDesignSvgUrl(input: AdminDesignSvgUrlInput) {
  const designId = String(input.designId || "").trim();
  const sourceSvgUrl = String(input.sourceSvgUrl || "").trim();
  if (!sourceSvgUrl || !/^design_[0-9]+_[a-z0-9]+$/i.test(designId)) return "";

  const directDownloadUrl = String(input.sourceSvgDownloadUrl || "").trim();
  if (directDownloadUrl) return input.download ? directDownloadUrl : sourceSvgUrl;

  const params = new URLSearchParams({ id: designId });
  if (input.download) params.set("download", "1");
  return `/api/admin/design-svg?${params.toString()}`;
}

export function buildLayerVerificationUrl(input: LayerVerificationUrlInput) {
  const sourceSvgUrl = String(input.sourceSvgUrl || "").trim();
  if (!sourceSvgUrl) return "";

  const origin = String(input.origin || DEFAULT_CUSTOMER_TOOL_ORIGIN).replace(/\/+$/, "");
  const url = new URL(origin);
  url.searchParams.set("templateSvg", sourceSvgUrl);
  url.searchParams.set("productTitle", input.productTitle || `Recovered design ${input.designId || ""}`.trim());
  if (/^design_[0-9]+_[a-z0-9]+$/i.test(String(input.designId || ""))) {
    url.searchParams.set("designId", String(input.designId));
  }
  if (input.shape) url.searchParams.set("shape", input.shape);
  if (Number.isFinite(input.width) && Number(input.width) > 0) url.searchParams.set("artboardWidth", String(input.width));
  if (Number.isFinite(input.height) && Number(input.height) > 0) url.searchParams.set("artboardHeight", String(input.height));
  url.searchParams.set("autoLoadProduct", "1");
  url.searchParams.set("autoLayer", "svg");
  url.searchParams.set("panel", "layers");
  url.hash = "team-banner-designer-section";
  return url.toString();
}
