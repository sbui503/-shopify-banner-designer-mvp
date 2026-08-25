import fs from "node:fs";
import path from "node:path";
import { titleCase } from "@/lib/utils";

type JsonRecord = Record<string, unknown>;

export type AdminAsset = {
  name: string;
  sport: string;
  bannerType: string;
  type: string;
  status: "Ready" | "SVG Ready" | "Needs Review";
  previewUrl: string;
  sourceUrl: string;
};

export type AdminTemplate = {
  id?: string;
  title: string;
  sport: string;
  bannerType: string;
  playerCount: number;
  sourceUrl: string;
  status: string;
  editable: boolean;
  photoFrame: boolean;
  uploadedAt?: string;
  originalName?: string;
};

export type AdminProduct = {
  title: string;
  handle: string;
  sport: string;
  bannerType: string;
  price: string;
  status: string;
  sourceStatus: string;
  image: string;
};

export type LayoutSummary = {
  sport: string;
  bannerType: string;
  playerCount: number;
  count: number;
  editableCount: number;
  photoFrameCount: number;
};

export type LayerRoleCoverage = {
  expected: number;
  ok: number;
  missing: number;
  unowned: number;
  notRequired: number;
};

export type BannerLayerCoverage = {
  bannerType: string;
  productCount: number;
  readyCount: number;
  notReadyCount: number;
  readyRate: number;
  target80Remaining: number;
  target90Remaining: number;
  weakestRole: string;
  weakestRoleRate: number;
  roles: Record<string, LayerRoleCoverage>;
};

export type ProductLayerCoverage = {
  productCount: number;
  readyCount: number;
  notReadyCount: number;
  readyRate: number;
  target80Remaining: number;
  target90Remaining: number;
  bannerTypes: BannerLayerCoverage[];
};

export type AdminData = {
  metrics: {
    totalOrders: number;
    activeTemplates: number;
    pendingProofs: number;
    shopifySyncStatus: string;
    revenue: string;
    averageOrder: string;
    designCompletionRate: string;
  };
  products: AdminProduct[];
  assets: AdminAsset[];
  templates: AdminTemplate[];
  layouts: LayoutSummary[];
  productLayerCoverage: ProductLayerCoverage;
  sports: string[];
  bannerTypes: string[];
  syncRows: Array<{
    product: string;
    handle: string;
    template: string;
    status: string;
    issue: string;
  }>;
  failedSyncRows: Array<{
    product: string;
    issue: string;
    action: string;
  }>;
  orders: Array<{
    order: string;
    customer: string;
    items: number;
    proofStatus: string;
    designStatus: string;
    cartPreviewStatus: string;
    total: string;
  }>;
  analytics: {
    mostUsedTemplates: Array<{ name: string; count: number; rate: number }>;
    bestSellingBannerTypes: Array<{ name: string; count: number; revenue: string }>;
    funnel: Array<{ step: string; count: number; rate: number }>;
  };
  users: Array<{
    name: string;
    email: string;
    role: string;
    status: string;
    lastActive: string;
  }>;
  activity: Array<{
    label: string;
    detail: string;
    time: string;
    status: string;
  }>;
  system: {
    shopifyTokenConfigured: boolean;
    blobConfigured: boolean;
    proofEmailConfigured: boolean;
    productCount: number;
    assetCount: number;
    templateCount: number;
    layoutCount: number;
  };
};

const PROJECT_ROOT = process.cwd();
const PRODUCT_MANIFEST_FILE = path.join(PROJECT_ROOT, "public", "team-banner-products.json");
const ASSET_MANIFEST_FILE = path.join(PROJECT_ROOT, "public", "team-banner-assets.shopify.json");
const TEMPLATE_MAP_FILE = path.join(PROJECT_ROOT, "public", "design-tool", "template-map.json");
const SVG_TEMPLATE_FILE = path.join(PROJECT_ROOT, "public", "svg-layer-templates.json");
const ASSET_BACKUP_FILE = path.join(PROJECT_ROOT, "public", "team-banner-asset-backups.json");
const ADMIN_DATA_SNAPSHOT_FILE = path.join(PROJECT_ROOT, "data", "admin-data-snapshot.json");
const CUSTOMER_TOOL_ORIGIN = process.env.CUSTOMER_TOOL_ORIGIN || "https://teamsportbanners.vercel.app";
const OWNED_BLOB_RE = /^https:\/\/[^/]+\.public\.blob\.vercel-storage\.com\//i;

const LAYER_ROLES = ["background", "teamLogo", "teamName", "text", "clipArt", "accessory"] as const;

function readJsonFile<T>(filePath: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch {
    return fallback;
  }
}

async function readCustomerJson<T>(pathname: string, filePath: string, fallback: T): Promise<T> {
  const localFallback = readJsonFile(filePath, fallback);
  try {
    const response = await fetch(new URL(pathname, CUSTOMER_TOOL_ORIGIN), {
      cache: "no-store"
    });
    if (!response.ok) return localFallback;
    return await response.json() as T;
  } catch {
    return localFallback;
  }
}

function arrayFromManifest<T = JsonRecord>(manifest: JsonRecord, key: string): T[] {
  const value = manifest[key];
  return Array.isArray(value) ? (value as T[]) : [];
}

function cleanText(value: unknown, fallback = "") {
  return String(value || fallback).trim();
}

function normalizeSport(value: unknown) {
  const clean = cleanText(value, "General").toLowerCase();
  if (clean.includes("track")) return "Track & Field";
  if (clean.includes("basket")) return "Basketball";
  if (clean.includes("foot")) return "Football";
  if (clean.includes("volley")) return "Volleyball";
  if (clean.includes("soft")) return "Softball";
  if (clean.includes("soccer")) return "Soccer";
  if (clean.includes("base")) return "Baseball";
  return titleCase(clean || "General");
}

function normalizeBannerType(value: unknown) {
  const clean = cleanText(value, "Banner").toLowerCase();
  if (clean.includes("home")) return "Home Plate";
  if (clean.includes("triangle")) return "Triangle";
  if (clean.includes("pole")) return "Pole Pocket";
  if (clean.includes("hem")) return "Hem & Grommet";
  if (clean.includes("rectangle")) return "Hem & Grommet";
  return titleCase(clean || "Banner");
}

function inferProductBannerType(product: JsonRecord) {
  const clean = [
    product.bannerType,
    product.shape,
    product.productShape,
    product.type,
    product.tags,
    product.title,
    product.handle
  ].filter(Boolean).join(" ").toLowerCase();
  if (/home\s*plate|homeplate/.test(clean)) return "Home Plate";
  if (/triangle|pennant/.test(clean)) return "Triangle";
  if (/pole\s*pocket|polepocket/.test(clean)) return "Pole Pocket";
  if (/hem|grommet|rectangle/.test(clean)) return "Hem & Grommet";
  return normalizeBannerType(clean);
}

function previewUrl(value: unknown) {
  const url = cleanText(value);
  if (!url) return "";
  if (url.startsWith("//")) return `https:${url}`;
  return url;
}

function lookupKeys(value: unknown) {
  const raw = cleanText(value);
  if (!raw) return [];
  const keys = new Set([raw]);
  try {
    const url = new URL(raw, "https://teamsportbanners.vercel.app");
    url.hash = "";
    keys.add(url.href);
    const noSearch = new URL(url.href);
    noSearch.search = "";
    keys.add(noSearch.href);
    if (url.origin === "https://teamsportbanners.vercel.app") keys.add(url.pathname);
  } catch {
    // Keep raw non-URL keys.
  }
  try {
    keys.add(decodeURIComponent(raw));
  } catch {
    // Keep raw key when not encoded.
  }
  return [...keys].filter(Boolean);
}

function layerRoleValue(config: JsonRecord, role: string) {
  if (role === "background") return cleanText(config.backgroundUrl || config.backgroundSvgUrl);
  if (role === "teamLogo") return cleanText(config.logoUrl || config.logoSvgUrl);
  if (role === "clipArt") return cleanText(config.clipartUrl || config.clipartSvgUrl);
  if (role === "accessory") return cleanText(config.accessoryUrl || config.accessorySvgUrl);
  return "";
}

function hasVerifiedEditableSource(product: JsonRecord, config: JsonRecord) {
  const layoutSvgUrl = cleanText(config.layoutSvgUrl || product.templateSvg);
  return config.fullyEditable === true
    && config.sourceEditable === true
    && config.needsSourceSvg !== true
    && cleanText(config.layoutSource) === "svg-template"
    && cleanText(config.objectLayerMode) === "source-svg"
    && Boolean(layoutSvgUrl);
}

function productSourceStatus(product: JsonRecord) {
  const config = (product.layerConfig && typeof product.layerConfig === "object" ? product.layerConfig : {}) as JsonRecord;
  if (hasVerifiedEditableSource(product, config)) return "Exact source SVG";
  return cleanText(config.layoutSvgUrl || product.templateSvg) ? "Mapped SVG" : "Needs SVG";
}

function hasEditableTemplateSource(template: JsonRecord) {
  const sourceUrl = cleanText(template.url || template.sourceUrl);
  return Boolean(template.nativeEditableSvg || template.requiredObjects || /\.svg(?:$|[?#])/i.test(sourceUrl));
}

function layerRoleExpected(product: JsonRecord, config: JsonRecord, role: string) {
  if (role === "background") return Number(config.backgroundCount || 0) > 0 || Boolean(layerRoleValue(config, role));
  if (role === "teamLogo") return Number(config.teamLogoCount || 0) > 0 || Boolean(layerRoleValue(config, role));
  if (role === "teamName") {
    return Boolean(config.logoTitle || /tbd:team-logo-title:/i.test(cleanText(product.tags)) || Number(config.teamLogoCount || 0) > 0);
  }
  if (role === "text") {
    return Number(config.textLayerCount || 0) > 0
      || Number(config.playerTextCount || 0) > 0
      || Number(config.headerTextCount || 0) > 0;
  }
  if (role === "clipArt") return Number(config.clipartCount || 0) > 0 || Boolean(layerRoleValue(config, role));
  if (role === "accessory") {
    return Number(config.playerIconCount || 0) > 0
      || Boolean(layerRoleValue(config, role))
      || (Array.isArray(config.accessoryUrls) && config.accessoryUrls.length > 0);
  }
  return false;
}

function layerRoleValues(config: JsonRecord, role: string) {
  return [
    layerRoleValue(config, role),
    ...(role === "background" && Array.isArray(config.backgroundUrls) ? config.backgroundUrls : []),
    ...(role === "teamLogo" && Array.isArray(config.logoUrls) ? config.logoUrls : []),
    ...(role === "clipArt" && Array.isArray(config.clipartUrls) ? config.clipartUrls : []),
    ...(role === "accessory" && Array.isArray(config.accessoryUrls) ? config.accessoryUrls : [])
  ].map((value) => cleanText(value)).filter(Boolean);
}

function makeEmptyRoleCoverage(): Record<string, LayerRoleCoverage> {
  return Object.fromEntries(
    LAYER_ROLES.map((role) => [role, { expected: 0, ok: 0, missing: 0, unowned: 0, notRequired: 0 }])
  );
}

function remainingToTarget(productCount: number, readyCount: number, targetRate: number) {
  return Math.max(0, Math.ceil(productCount * targetRate) - readyCount);
}

function rate(part: number, total: number) {
  return Math.round((part / Math.max(total, 1)) * 1000) / 10;
}

function buildProductLayerCoverage(rawProducts: JsonRecord[], assetBackups: JsonRecord[]): ProductLayerCoverage {
  const manifestLookup = new Set<string>();
  assetBackups.forEach((record) => {
    [
      record.sourceUrl,
      record.localUrl,
      record.localBackupUrl,
      record.sourceObjectUrl,
      record.localSourceObjectUrl,
      record.blobUrl
    ].forEach((value) => lookupKeys(value).forEach((key) => manifestLookup.add(key)));
  });

  const byBannerType = new Map<string, {
    bannerType: string;
    productCount: number;
    readyCount: number;
    roles: Record<string, LayerRoleCoverage>;
  }>();

  rawProducts.forEach((product) => {
    const config = (product.layerConfig && typeof product.layerConfig === "object" ? product.layerConfig : {}) as JsonRecord;
    const bannerType = inferProductBannerType(product);
    const bucket = byBannerType.get(bannerType) || {
      bannerType,
      productCount: 0,
      readyCount: 0,
      roles: makeEmptyRoleCoverage()
    };
    bucket.productCount += 1;

    if (hasVerifiedEditableSource(product, config)) {
      LAYER_ROLES.forEach((role) => {
        const roleBucket = bucket.roles[role];
        if (layerRoleExpected(product, config, role)) {
          roleBucket.expected += 1;
          roleBucket.ok += 1;
        } else {
          roleBucket.notRequired += 1;
        }
      });
      bucket.readyCount += 1;
      byBannerType.set(bannerType, bucket);
      return;
    }

    let readyRoles = 0;
    LAYER_ROLES.forEach((role) => {
      const expected = layerRoleExpected(product, config, role);
      const roleBucket = bucket.roles[role];
      if (!expected) {
        roleBucket.notRequired += 1;
        readyRoles += 1;
        return;
      }

      roleBucket.expected += 1;
      if (role === "teamName" || role === "text") {
        roleBucket.ok += 1;
        readyRoles += 1;
        return;
      }

      const values = layerRoleValues(config, role);
      if (!values.length) {
        roleBucket.missing += 1;
        return;
      }

      const owned = values.some((value) => {
        if (OWNED_BLOB_RE.test(value)) return true;
        if (value.startsWith("/assets/source-objects/") || value.startsWith("/assets/sports/") || value.startsWith("/backups/")) return true;
        return lookupKeys(value).some((key) => manifestLookup.has(key));
      });

      if (owned) {
        roleBucket.ok += 1;
        readyRoles += 1;
      } else {
        roleBucket.unowned += 1;
      }
    });

    if (readyRoles === LAYER_ROLES.length) bucket.readyCount += 1;
    byBannerType.set(bannerType, bucket);
  });

  const bannerTypes = [...byBannerType.values()].map((item) => {
    const weakest = Object.entries(item.roles)
      .filter(([, role]) => role.expected > 0)
      .map(([name, role]) => ({ name, roleRate: rate(role.ok, role.expected), unresolved: role.missing + role.unowned }))
      .sort((a, b) => a.roleRate - b.roleRate || b.unresolved - a.unresolved)[0];
    return {
      ...item,
      notReadyCount: item.productCount - item.readyCount,
      readyRate: rate(item.readyCount, item.productCount),
      target80Remaining: remainingToTarget(item.productCount, item.readyCount, 0.8),
      target90Remaining: remainingToTarget(item.productCount, item.readyCount, 0.9),
      weakestRole: weakest?.name || "none",
      weakestRoleRate: weakest?.roleRate || 100
    };
  }).sort((a, b) => b.notReadyCount - a.notReadyCount || a.bannerType.localeCompare(b.bannerType));

  const productCount = rawProducts.length;
  const readyCount = bannerTypes.reduce((sum, item) => sum + item.readyCount, 0);
  return {
    productCount,
    readyCount,
    notReadyCount: productCount - readyCount,
    readyRate: rate(readyCount, productCount),
    target80Remaining: remainingToTarget(productCount, readyCount, 0.8),
    target90Remaining: remainingToTarget(productCount, readyCount, 0.9),
    bannerTypes
  };
}

export async function getLiveAdminData(): Promise<AdminData> {
  const [productManifest, assetManifest, templateManifest, svgTemplateManifest, assetBackupManifest] = await Promise.all([
    readCustomerJson<JsonRecord>("/team-banner-products.json", PRODUCT_MANIFEST_FILE, {}),
    readCustomerJson<JsonRecord>("/team-banner-assets.shopify.json", ASSET_MANIFEST_FILE, {}),
    readCustomerJson<JsonRecord>("/design-tool/template-map.json", TEMPLATE_MAP_FILE, {}),
    readCustomerJson<JsonRecord>("/svg-layer-templates.json", SVG_TEMPLATE_FILE, {}),
    readCustomerJson<JsonRecord>("/team-banner-asset-backups.json", ASSET_BACKUP_FILE, {})
  ]);

  const rawProducts = arrayFromManifest<JsonRecord>(productManifest, "products");
  const rawAssets = arrayFromManifest<JsonRecord>(assetManifest, "assets");
  const rawAssetBackups = arrayFromManifest<JsonRecord>(assetBackupManifest, "assets");
  const rawTemplates = [
    ...arrayFromManifest<JsonRecord>(templateManifest, "templates"),
    ...arrayFromManifest<JsonRecord>(svgTemplateManifest, "templates")
  ];

  const products: AdminProduct[] = rawProducts.slice(0, 180).map((product) => {
    const sport = normalizeSport(product.tags || product.productCategory || product.title);
    const bannerType = inferProductBannerType(product);
    return {
      title: cleanText(product.title, "Untitled product"),
      handle: cleanText(product.handle),
      sport,
      bannerType,
      price: cleanText(product.price, "$0.00"),
      status: cleanText(product.status, "active"),
      sourceStatus: productSourceStatus(product),
      image: previewUrl(product.image)
    };
  });

  const assets: AdminAsset[] = rawAssets.slice(0, 120).map((asset) => {
    const category = cleanText(asset.category, "General");
    const sourceType = cleanText(asset.sourceType || asset.rawType || asset.role, "asset");
    const svgUrl = previewUrl(asset.svgUrl);
    return {
      name: cleanText(asset.name, "Untitled asset"),
      sport: normalizeSport(`${asset.name || ""} ${category} ${sourceType}`),
      bannerType: normalizeBannerType(category),
      type: titleCase(cleanText(asset.role || sourceType, "Asset")),
      status: svgUrl ? "SVG Ready" : previewUrl(asset.url) ? "Ready" : "Needs Review",
      previewUrl: previewUrl(asset.url || asset.svgUrl),
      sourceUrl: svgUrl
    };
  });

  const templateSeen = new Set<string>();
  const templates: AdminTemplate[] = rawTemplates
    .filter((template) => {
      const key = `${template.name || template.title || template.url}`;
      if (templateSeen.has(key)) return false;
      templateSeen.add(key);
      return true;
    })
    .map((template) => ({
      title: cleanText(template.title || template.name, "Untitled template"),
      sport: normalizeSport(template.sport || template.sourceTags || template.title),
      bannerType: normalizeBannerType(template.type || template.sourceTags || template.title),
      playerCount: Number(template.playerCount || template.imageCount || 0),
      sourceUrl: cleanText(template.url || template.sourceUrl),
      status: cleanText(template.validationStatus || template.usage_status || "active"),
      editable: hasEditableTemplateSource(template),
      photoFrame: Boolean(template.premiumPhotoFrame || template.largePhotoFrame || cleanText(template.title).toLowerCase().includes("photo"))
    }));

  const layoutMap = new Map<string, LayoutSummary>();
  rawTemplates.forEach((template) => {
    const sport = normalizeSport(template.sport || template.sourceTags || template.title);
    const bannerType = normalizeBannerType(template.type || template.sourceTags || template.title);
    const playerCount = Number(template.playerCount || template.imageCount || 0);
    const key = `${sport}|${bannerType}|${playerCount}`;
    const current = layoutMap.get(key) || {
      sport,
      bannerType,
      playerCount,
      count: 0,
      editableCount: 0,
      photoFrameCount: 0
    };
    current.count += 1;
    if (hasEditableTemplateSource(template)) current.editableCount += 1;
    if (template.premiumPhotoFrame || template.largePhotoFrame || cleanText(template.title).toLowerCase().includes("photo")) {
      current.photoFrameCount += 1;
    }
    layoutMap.set(key, current);
  });

  const layouts = [...layoutMap.values()]
    .sort((a, b) => b.count - a.count || a.sport.localeCompare(b.sport))
    .slice(0, 80);
  const productLayerCoverage = buildProductLayerCoverage(rawProducts, rawAssetBackups);

  const productSports = rawProducts.map((product) => normalizeSport(product.tags || product.productCategory || product.title));
  const productBannerTypes = rawProducts.map((product) => inferProductBannerType(product));
  const sports = [...new Set([...productSports, ...assets.map((asset) => asset.sport), ...templates.map((template) => template.sport)])].sort();
  const bannerTypes = [...new Set([...productBannerTypes, ...templates.map((template) => template.bannerType)])].sort();

  const mappedProducts = rawProducts.filter((product) => productSourceStatus(product) !== "Needs SVG").length;
  const missingSourceProducts = rawProducts.length - mappedProducts;
  const syncRows = products.slice(0, 18).map((product) => ({
    product: product.title,
    handle: product.handle,
    template: product.sourceStatus,
    status: product.sourceStatus !== "Needs SVG" ? "Synced" : "Needs review",
    issue: product.sourceStatus !== "Needs SVG" ? "None" : "Missing editable source"
  }));

  const failedSyncRows = products
    .filter((product) => product.sourceStatus === "Needs SVG")
    .slice(0, 8)
    .map((product) => ({
      product: product.title,
      issue: "No templateSvg mapping",
      action: "Generate or attach native editable SVG"
    }));

  const orders: AdminData["orders"] = [];
  const analytics: AdminData["analytics"] = {
    mostUsedTemplates: [],
    bestSellingBannerTypes: [],
    funnel: []
  };
  const users: AdminData["users"] = [];

  const activity = [
    { label: "Customer catalog synced", detail: `${rawProducts.length.toLocaleString()} products loaded from the live customer tool`, time: "Current deployment", status: "Synced" },
    { label: "Exact source SVG audit", detail: `${productLayerCoverage.readyCount.toLocaleString()} products verified as fully editable source SVG`, time: "Current deployment", status: missingSourceProducts ? "Review" : "Verified" },
    { label: "Asset catalog synced", detail: `${rawAssets.length.toLocaleString()} customer-tool assets indexed`, time: "Current deployment", status: "Synced" },
    { label: "Template catalog synced", detail: `${templates.length.toLocaleString()} editable SVG templates indexed`, time: "Current deployment", status: "Synced" }
  ];

  return {
    metrics: {
      totalOrders: orders.length,
      activeTemplates: templates.filter((template) => template.editable).length,
      pendingProofs: orders.filter((order) => /pending|needs/i.test(order.proofStatus)).length,
      shopifySyncStatus: missingSourceProducts ? "Needs review" : "Healthy",
      revenue: "Not connected",
      averageOrder: "Not connected",
      designCompletionRate: "Not connected"
    },
    products,
    assets,
    templates,
    layouts,
    productLayerCoverage,
    sports,
    bannerTypes,
    syncRows,
    failedSyncRows,
    orders,
    analytics,
    users,
    activity,
    system: {
      shopifyTokenConfigured: Boolean(process.env.SHOPIFY_ADMIN_ACCESS_TOKEN),
      blobConfigured: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
      proofEmailConfigured: Boolean(process.env.RESEND_API_KEY || process.env.PROOF_EMAIL_TO),
      productCount: rawProducts.length,
      assetCount: rawAssets.length,
      templateCount: templates.length,
      layoutCount: layouts.length
    }
  };
}

export async function getAdminData(): Promise<AdminData> {
  const snapshot = readJsonFile<AdminData | null>(ADMIN_DATA_SNAPSHOT_FILE, null);
  return snapshot || getLiveAdminData();
}
