import type { ShopifyCustomAttribute } from "@/lib/shopify-custom-order";

export const QA_PLAYER_NAMES = ["Sia", "Simba", "Duy", "Thuy"] as const;
export const QA_COACH_NAME = "Si";
export const QA_TEAM_MOM_NAME = "Doan";
export const QA_TEAM_LOGO_URL = "https://teamsportbanners.vercel.app/team-sport-banners-logo.jpg";

export type QaDraftDesign = {
  designId: string;
  bannerType: string;
  teamName: string;
  productTitle: string;
  previewUrl: string;
  jsonUrl: string;
  sourceSvgUrl: string;
  manifestUrl: string;
};

function validDesignId(value: unknown) {
  const match = String(value || "").trim().match(/^design_[0-9]+_[a-z0-9]+$/i);
  return match ? match[0] : "";
}

export function qaDraftAttributes(design: QaDraftDesign): ShopifyCustomAttribute[] {
  const designId = validDesignId(design.designId);
  if (!designId) throw new Error("A valid Design ID is required.");

  return [
    { key: "_Design ID", value: designId },
    { key: "_Design Preview", value: design.previewUrl },
    { key: "_Layered Source SVG", value: design.sourceSvgUrl },
    { key: "_Editable Design JSON", value: design.jsonUrl },
    { key: "_Design Manifest", value: design.manifestUrl },
    { key: "Team Name", value: design.teamName },
    { key: "Coach", value: QA_COACH_NAME },
    { key: "Team Mom / Dad", value: QA_TEAM_MOM_NAME },
    { key: "Number of Players", value: String(QA_PLAYER_NAMES.length) },
    ...QA_PLAYER_NAMES.map((name, index) => ({ key: `Player ${index + 1} Name`, value: name })),
    { key: "Team Logo", value: QA_TEAM_LOGO_URL },
    { key: "Banner Type", value: design.bannerType },
    { key: "Sport", value: "Baseball" },
    { key: "SVG Layout", value: design.productTitle },
    { key: "QA Status", value: "TEST ONLY - DO NOT COMPLETE OR FULFILL" }
  ];
}

export function qaDraftOrderInput(design: QaDraftDesign) {
  const attributes = qaDraftAttributes(design);
  return {
    note: "QA TEST ONLY - DO NOT COMPLETE, INVOICE, PRINT, OR FULFILL. Customer-flow verification with exact saved design files.",
    tags: ["TSB-QA", "DO-NOT-FULFILL", design.bannerType],
    customAttributes: [
      { key: "_Design ID", value: design.designId },
      { key: "QA Status", value: "TEST ONLY - DO NOT COMPLETE OR FULFILL" }
    ],
    lineItems: [{
      title: `[QA TEST] ${design.bannerType} - ${design.teamName}`,
      originalUnitPrice: "0.00",
      quantity: 1,
      requiresShipping: false,
      taxable: false,
      customAttributes: attributes
    }]
  };
}
