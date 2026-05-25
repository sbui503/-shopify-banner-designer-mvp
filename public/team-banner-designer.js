(function () {
  const TRIANGLE_WIDTH = 900;
  const TRIANGLE_HEIGHT = 900;
  const TRIANGLE_PRINT_HEIGHT = 780;
  const HOMEPLATE_SIZE = 900;
  const BANNER_WIDTH = 1500;
  const BANNER_HEIGHT = 900;
  const POLE_POCKET_HEIGHT = Math.round(BANNER_WIDTH * (367.2 / 500));
  const POLE_POCKET_SLEEVE_RATIO = 66.7 / 366.7;
  const MVP_5X3_ONLY = false;
  const ASSETS_PER_PAGE = 48;
  const IMAGE_LOAD_TIMEOUT_MS = 12000;
  const TEMPLATE_PAGE_SIZE = 24;
  const GENERATOR_SETUP_STORAGE_KEY = "team-banner-template-generator:v1";
  const DEFAULT_IMAGE_PROXY_URL = "https://files-mentioned-by-the-user-shopify.vercel.app/api/image-proxy";
  const SHOPIFY_STORE_ORIGIN = "https://teamsportbanners.com";
  const DEFAULT_CUSTOM_DESIGN_VARIANT_ID = "43534427029710";
  const DEFAULT_CUSTOM_DESIGN_PRODUCT_URL = `${SHOPIFY_STORE_ORIGIN}/products/custom-design-banner?variant=${DEFAULT_CUSTOM_DESIGN_VARIANT_ID}`;
  const DEFAULT_CUSTOM_DESIGN_CHECKOUT_URL = `${SHOPIFY_STORE_ORIGIN}/cart/${DEFAULT_CUSTOM_DESIGN_VARIANT_ID}:1?return_to=/checkouts/cn/${DEFAULT_CUSTOM_DESIGN_VARIANT_ID}`;
  const CUSTOM_DESIGN_VARIANT_BY_SHAPE = {
    triangle: "43537293050062",
    homeplatepennant: "43537293443278"
  };
  let WIDTH = BANNER_WIDTH;
  let HEIGHT = BANNER_HEIGHT;
  let ARTBOARD_SHAPE = "rectangle";
  const CATEGORY_ORDER = [
    "All",
    "BG Hem & Grommets",
    "BG Pole Pocket",
    "BG Triangle",
    "BG Home Plate",
    "Clip art",
    "Team name",
    "Accessory"
  ];
  const BANNER_TYPE_VALUES = ["rectangle", "polepocket", "triangle", "homeplatepennant"];
  const FALLBACK_ASSETS = [
    {
      name: "Red triangle point down background",
      category: "BG Triangle",
      url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='900' height='900' viewBox='0 0 900 900'%3E%3Cpolygon points='28,90 872,90 450,840' fill='%23d71920'/%3E%3Cpolygon points='82,126 818,126 450,788' fill='%23ffffff' fill-opacity='.16'/%3E%3C/svg%3E"
    },
    {
      name: "Red home plate background",
      category: "BG Home Plate",
      url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='900' height='900' viewBox='0 0 900 900'%3E%3Cpolygon points='24,24 876,24 876,504 450,876 24,504' fill='%23d71920'/%3E%3Cpolygon points='78,70 822,70 822,468 450,810 78,468' fill='%23ffffff' fill-opacity='.16'/%3E%3C/svg%3E"
    }
  ];

  function normalizeShape(shape, hasDesign) {
    if (MVP_5X3_ONLY) return "rectangle";
    const value = String(shape || "").toLowerCase().replace(/[\s_-]+/g, "");
    if (/polepocket|polesleeve|sleeve/.test(value)) return "polepocket";
    if (/homeplatepennant|platepennant|homepennant/.test(value)) return "homeplatepennant";
    if (/home(baseball|softball|soccer)?banners?/.test(value)) return "homeplatepennant";
    if (/homeplate|plate/.test(value)) return "homeplatepennant";
    if (/triangle|pennant/.test(value)) return "triangle";
    if (/banner|banne|rect|rectangle|soccer|baseball|softball|hem|grommet|polepocket/.test(value)) return "rectangle";
    return "rectangle";
  }

  function shapeHintFromText(text) {
    const value = String(text || "").toLowerCase();
    if (/tbd:shape:polepocket|tbd:banner-type:pole-pocket|pole[\s_-]*(?:and[\s_-]*)?pocket|polepocket|pole[\s_-]*sleeve/.test(value)) return "polepocket";
    if (/tbd:shape:triangle|triangle|pennant/.test(value)) return "triangle";
    if (/tbd:shape:homeplate|home[\s_-]*plate|home[\s_-]*pennant|plate[\s_-]*pennant/.test(value)) return "homeplatepennant";
    if (/tbd:shape:(?:banner|rectangle)|hem|grommet|5\s*x\s*3|banner|rectangle/.test(value)) return "rectangle";
    return "";
  }

  function inferLaunchShape(explicitShape, context, hasDesign) {
    const contextShape = shapeHintFromText(context);
    const explicitText = String(explicitShape || "");
    const explicitNormalized = explicitText ? normalizeShape(explicitText, hasDesign) : "";
    const explicitIsGeneric = !explicitText || /^(?:banner|rectangle|rect|5x3)$/i.test(explicitText.replace(/[\s_-]+/g, ""));
    if (contextShape === "polepocket" && (!explicitNormalized || explicitIsGeneric || explicitNormalized === "rectangle")) return "polepocket";
    if (contextShape && (!explicitNormalized || explicitIsGeneric)) return contextShape;
    return explicitNormalized || contextShape || "rectangle";
  }

  function htmlDecode(value) {
    const text = String(value || "");
    return text
      .replace(/&quot;/g, '"')
      .replace(/&#34;/g, '"')
      .replace(/&amp;/g, "&")
      .replace(/&apos;/g, "'")
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">");
  }

  function shapeFromSvgText(svgText) {
    const text = String(svgText || "");
    const infoMatch = text.match(/\bdata-info=(["'])(.*?)\1/i);
    if (infoMatch) {
      const decoded = htmlDecode(infoMatch[2]);
      const hinted = shapeHintFromText(decoded);
      if (hinted) return hinted;
      try {
        const info = JSON.parse(decoded);
        const fromInfo = shapeHintFromText([info.type, info.name, info.information].filter(Boolean).join(" "));
        if (fromInfo) return fromInfo;
      } catch (error) {
        // Some source templates contain partially escaped JSON; fall through to full-text hints.
      }
    }
    return shapeHintFromText(text);
  }

  function isRectangularShape(shape) {
    return shape === "rectangle" || shape === "polepocket";
  }

  function isHomePlateShape(shape) {
    return shape === "homeplate" || shape === "homeplatepennant";
  }

  function artboardSizeForShape(shape) {
    if (shape === "polepocket") return { width: BANNER_WIDTH, height: POLE_POCKET_HEIGHT };
    if (isRectangularShape(shape)) return { width: BANNER_WIDTH, height: BANNER_HEIGHT };
    if (isHomePlateShape(shape)) return { width: HOMEPLATE_SIZE, height: HOMEPLATE_SIZE };
    return { width: TRIANGLE_WIDTH, height: TRIANGLE_HEIGHT };
  }

  function defaultCategoryForShape(shape) {
    if (MVP_5X3_ONLY) return "BG Hem & Grommets";
    if (shape === "polepocket") return "BG Pole Pocket";
    if (shape === "rectangle") return "BG Hem & Grommets";
    if (isHomePlateShape(shape)) return "BG Home Plate";
    return "BG Triangle";
  }

  function bannerTypeValueForShape(shape) {
    const normalized = normalizeShape(shape, false);
    if (isHomePlateShape(normalized)) return "homeplatepennant";
    return BANNER_TYPE_VALUES.includes(normalized) ? normalized : "rectangle";
  }

  function isBackgroundCategory(category) {
    return String(category || "").indexOf("BG ") === 0;
  }

  function sportLabelFromContext(context) {
    const text = String(context || "").toLowerCase();
    if (/\bbaseball\b/.test(text)) return "BASEBALL";
    if (/\bsoftball\b/.test(text)) return "SOFTBALL";
    if (/\bsoccer\b/.test(text)) return "SOCCER";
    return "SOCCER";
  }

  function defaultHeadlineForShape(shape, context = "") {
    if (MVP_5X3_ONLY) return "HEM & GROMMETS";
    if (shape === "polepocket") return `POLE POCKET ${sportLabelFromContext(context)} BANNERS`;
    if (shape === "rectangle") return "5x3 Banner";
    if (shape === "homeplatepennant") return "Home plate pennant";
    if (shape === "homeplate") return "HOME PLATE BANNER";
    return "TRIANGLE PENNANT";
  }

  function defaultSizeForShape(shape) {
    if (MVP_5X3_ONLY) return "5'x3'";
    if (isRectangularShape(shape)) return "5'x3'";
    if (shape === "homeplatepennant") return '17" x 17"';
    if (shape === "homeplate") return '23.5" x 23.5"';
    return '23.5" x 20.35"';
  }

  function defaultPriceForShape(shape) {
    if (MVP_5X3_ONLY) return "$69.99";
    if (shape === "polepocket") return "$79.99";
    return isRectangularShape(shape) ? "$69.99" : "$9.99";
  }

  function isFiveByThreeProduct(product) {
    if (!product) return false;
    const text = [product.shape, product.type, product.tags, product.productCategory, product.title, product.handle]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (/\b(home\s*plate|homeplate|triangle|pennant)\b/.test(text)) return false;
    return /\b(banner|hem|grommet|pole\s*pocket|polepocket|soccer|baseball|softball)\b/.test(text);
  }

  function assetCategoryFromText(value) {
    const normalized = String(value || "").toLowerCase();
    if (/(^|[-_\s])bg[-_\s]*hem\b|hem\s*&?\s*grommet|hem\s+and\s+grommet/.test(normalized)) return "BG Hem & Grommets";
    if (/(^|[-_\s])bg[-_\s]*banner\b|pole[-_\s]*pocket|pole\s+pocket/.test(normalized)) return "BG Pole Pocket";
    if (/(^|[-_\s])bg[-_\s]*triangle\b|triangle/.test(normalized)) return "BG Triangle";
    if (/(^|[-_\s])bg[-_\s]*homeplate\b|home[-_\s]*plate|home\s+plate/.test(normalized)) return "BG Home Plate";
    if (/team[-_\s]*name|team\s+name/.test(normalized)) return "Team name";
    if (/clip[-_\s]*art|clipart/.test(normalized)) return "Clip art";
    if (/accessory|access/.test(normalized)) return "Accessory";
    return "";
  }

  function normalizeAssetCategory(asset) {
    const declared = String(asset.category || "").trim();
    const known = CATEGORY_ORDER.find((category) => category.toLowerCase() === declared.toLowerCase());
    if (known && known !== "All") return known;
    return assetCategoryFromText([asset.url, asset.name, declared].join(" ")) || "Other";
  }

  function categoryLabel(category) {
    return category === "All" ? "*" : category;
  }

  function normalizeCategoryParam(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    if (raw === "*") return "All";
    return CATEGORY_ORDER.find((category) => category.toLowerCase() === raw.toLowerCase()) || raw;
  }

  function normalizePanelParam(value) {
    const raw = String(value || "").trim().toLowerCase();
    return ["assets", "templates", "text", "properties", "layers", "inspector"].includes(raw) ? raw : "";
  }

  function booleanParam(value) {
    return /^(1|true|yes|on)$/i.test(String(value || "").trim());
  }

  function layeredDesignerUrl(rawHref, sourceElement) {
    let url;
    try {
      url = new URL(rawHref || window.location.href, window.location.href);
    } catch (error) {
      url = new URL(window.location.href);
    }
    if (!url.hash) url.hash = "team-banner-designer-section";
    url.searchParams.set("autoLoadProduct", "1");
    url.searchParams.set("autoLayer", url.searchParams.get("autoLayer") || "png");
    if (sourceElement && sourceElement.dataset) {
      [
        ["productTitle", "productTitle"],
        ["productHandle", "productHandle"],
        ["productImage", "productImage"],
        ["productTags", "productTags"],
        ["productCollections", "productCollections"],
        ["productShape", "productShape"],
        ["sizeLabel", "sizeLabel"],
        ["price", "price"]
      ].forEach(([param, key]) => {
        const value = sourceElement.dataset[key];
        if (value && !url.searchParams.get(param)) url.searchParams.set(param, value);
      });
    }
    return url.href;
  }

  function hydrateDesignButtonLinks() {
    document.querySelectorAll("[data-team-banner-design-button]").forEach((button) => {
      button.setAttribute("href", layeredDesignerUrl(button.getAttribute("href"), button));
    });
  }

  function readLaunchParams(root) {
    const search = new URLSearchParams(window.location.search || "");
    const get = (name) => search.get(name) || root.dataset[name] || "";
    const title = get("productTitle") || get("title") || get("product_title") || "Team Banner";
    const headline = get("productHeadline") || get("headline");
    const tags = get("productTags") || get("tags");
    const collections = get("productCollections") || get("collections");
    const explicitShape = get("productShape") || get("shape");
    const shapeContext = [
      explicitShape,
      tags,
      collections,
      title,
      get("productHandle") || get("handle"),
      get("productUrl") || get("url"),
      window.location.href,
      document.referrer
    ].join(" ");
    const shape = inferLaunchShape(explicitShape, shapeContext, true);
    const productImage = get("productImage") || get("image");
    const rawTemplateSvg = get("templateSvg") || get("svg") || get("u");
    const templateSvg = localTemplateSvgUrl(rawTemplateSvg) || rawTemplateSvg;
    const legacyProductButton = Boolean(productImage && (get("product_title") || get("product_id") || get("variant_id")));
    const sourceTemplateOnly = Boolean(templateSvg && !productImage && get("u"));
    const autoLayer = (get("autoLayer") || (legacyProductButton ? "png" : sourceTemplateOnly ? "svg" : "blank")).toLowerCase();
    const autoLoadProduct = booleanParam(get("autoLoadProduct") || get("autoLoad") || get("autoload")) || legacyProductButton || sourceTemplateOnly;
    const sourceMapMode = (get("sourceMapMode") || get("svgMapMode") || "").toLowerCase();
    const allowCandidateSourceMap = booleanParam(get("allowCandidateSvg") || get("allowCandidateSourceMap"))
      || sourceMapMode === "all"
      || sourceMapMode === "candidate";
    const width = Number(get("artboardWidth") || get("width"));
    const height = Number(get("artboardHeight") || get("height"));

    return {
      title,
      headline,
      handle: get("productHandle") || get("handle"),
      productUrl: get("productUrl") || get("url"),
      tags,
      collections,
      cartVariantId: get("cartVariantId") || get("variantId") || get("variant_id") || get("productId") || get("product_id"),
      customCheckoutVariantId: get("customCheckoutVariantId") || get("customCartVariantId") || get("customVariantId"),
      customCheckoutUrl: get("customCheckoutUrl") || get("cartCheckoutUrl") || get("checkoutUrl") || get("buyNowUrl"),
      triangleCheckoutVariantId: get("triangleCheckoutVariantId") || get("triangleVariantId"),
      triangleCheckoutUrl: get("triangleCheckoutUrl") || get("triangleCartCheckoutUrl"),
      homeplateCheckoutVariantId: get("homeplateCheckoutVariantId") || get("homePlateCheckoutVariantId") || get("homeplateVariantId") || get("homePlateVariantId"),
      homeplateCheckoutUrl: get("homeplateCheckoutUrl") || get("homePlateCheckoutUrl") || get("homeplateCartCheckoutUrl") || get("homePlateCartCheckoutUrl"),
      image: productImage,
      templateSvg,
      legacyProductButton,
      sourceTemplateOnly,
      autoLayer,
      autoLoadProduct,
      shape,
      width: Number.isFinite(width) && width > 0 ? width : 0,
      height: Number.isFinite(height) && height > 0 ? height : 0,
      sizeLabel: get("sizeLabel"),
      materialLabel: get("materialLabel"),
      price: get("price"),
      assetManifestUrl: get("assetsUrl") || get("assetsManifestUrl"),
      productManifestUrl: get("productsUrl") || get("productManifestUrl") || get("productManifest"),
      imageProxyUrl: get("imageProxyUrl") || get("imageProxy"),
      proofEmailUrl: get("proofEmailUrl") || get("emailProofUrl") || get("proofEndpoint"),
      proofEmailTo: get("proofEmailTo") || get("emailProofTo"),
      initialPanel: normalizePanelParam(get("panel") || get("openPanel")),
      initialAssetCategory: normalizeCategoryParam(get("assetCategory") || get("category")),
      initialAssetSearch: get("assetSearch"),
      sourceMapUrl: get("sourceMapUrl") || get("sourceSvgMapUrl"),
      sourceMapMode,
      allowCandidateSourceMap,
      layerMapsUrl: get("layerMapsUrl") || get("layerMapUrl"),
      layerConfig: parseLayerConfigTags(tags, shape, productImage),
      hasDesign: autoLoadProduct && autoLayer !== "blank" && Boolean(productImage || templateSvg)
    };
  }

  function configureArtboard(launch) {
    ARTBOARD_SHAPE = normalizeShape(launch.shape, Boolean(launch.image || launch.templateSvg));
    const size = artboardSizeForShape(ARTBOARD_SHAPE);
    WIDTH = MVP_5X3_ONLY ? BANNER_WIDTH : launch.width || size.width;
    HEIGHT = MVP_5X3_ONLY ? BANNER_HEIGHT : launch.height || size.height;
  }

  function resolveSourceUrl(url) {
    if (!url) return "";
    if (/^\/\//.test(url)) return `https:${url}`;
    try {
      return new URL(url, window.location.origin).href;
    } catch (error) {
      return url;
    }
  }

  function localTemplateSvgUrl(url) {
    const match = String(url || "").match(/admin-designs\/([0-9]{10,})\.svg(?:$|[?#])/i);
    return match ? `/svg-layer-templates/${match[1]}.svg` : "";
  }

  function absoluteShopifyUrl(value) {
    if (!value) return "";
    try {
      return new URL(value, SHOPIFY_STORE_ORIGIN).href;
    } catch (error) {
      return String(value);
    }
  }

  function customDesignCheckoutUrl(variantId) {
    const id = String(variantId || DEFAULT_CUSTOM_DESIGN_VARIANT_ID).trim();
    if (!id) return DEFAULT_CUSTOM_DESIGN_PRODUCT_URL;
    return `${SHOPIFY_STORE_ORIGIN}/cart/${encodeURIComponent(id)}:1?return_to=/checkouts/cn/${encodeURIComponent(id)}`;
  }

  function designerAssetUrl(fileName) {
    const cleanName = String(fileName || "").replace(/^\/+/, "");
    const explicitBase = window.TBD_ASSET_BASE || window.TeamBannerDesignerAssetBase || "";
    if (explicitBase) return new URL(cleanName, explicitBase).href;
    const script = document.currentScript || Array.from(document.scripts).find((item) => (item.src || "").includes("team-banner-designer"));
    if (script && script.src) {
      const base = script.src.slice(0, script.src.lastIndexOf("/") + 1);
      return new URL(cleanName, base).href;
    }
    return new URL(cleanName, window.location.origin).href;
  }

  function defaultImageProxyEndpoint() {
    const protocol = window.location.protocol;
    const host = window.location.hostname || "";
    if ((protocol === "http:" || protocol === "https:") && host.endsWith(".vercel.app")) {
      return `${window.location.origin}/api/image-proxy`;
    }
    return DEFAULT_IMAGE_PROXY_URL;
  }

  function canvasSafeImageUrl(url, proxyEndpoint) {
    if (!url) return "";
    if (/^\/\//.test(url)) url = `https:${url}`;
    if (/^(data|blob):/i.test(url)) return url;
    let resolved;
    try {
      resolved = new URL(url, window.location.href);
    } catch (error) {
      return url;
    }
    if (window.location.protocol !== "file:" && resolved.origin === window.location.origin) {
      return resolved.href;
    }
    if (!proxyEndpoint) return resolved.href;
    const separator = proxyEndpoint.includes("?") ? "&" : "?";
    return `${proxyEndpoint}${separator}url=${encodeURIComponent(resolved.href)}`;
  }

  function handleFromUrl(value) {
    const raw = String(value || "");
    if (!raw) return "";
    try {
      const url = new URL(raw, window.location.origin);
      const match = url.pathname.match(/\/products\/([^/?#]+)/i);
      return match ? decodeURIComponent(match[1]) : "";
    } catch (error) {
      const match = raw.match(/\/products\/([^/?#]+)/i);
      return match ? decodeURIComponent(match[1]) : "";
    }
  }

  function titleSlug(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function imageFileKey(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    try {
      const url = new URL(raw, window.location.href);
      return decodeURIComponent((url.pathname.split("/").pop() || "").replace(/\?.*$/, "")).toLowerCase();
    } catch (error) {
      return decodeURIComponent((raw.split("?")[0].split("/").pop() || "")).toLowerCase();
    }
  }

  function sameImageFile(value, expected) {
    const valueKey = imageFileKey(value);
    const expectedKey = imageFileKey(expected);
    return Boolean(valueKey && expectedKey && valueKey === expectedKey);
  }

  function productImageMatchesLaunch(product = {}, launch = {}) {
    if (!launch.image || !product.image) return true;
    return sameImageFile(product.image, launch.image);
  }

  function designImageId(value) {
    const raw = String(value || "");
    const adminMatch = raw.match(/admin-designs\/([0-9]{10,})\.(?:svg|png|jpe?g)/i);
    if (adminMatch) return adminMatch[1];
    const base = imageFileKey(raw).replace(/\.[a-z0-9]+$/i, "");
    const match = base.match(/^([0-9]{10,})(?:$|[-_])/);
    return match ? match[1] : "";
  }

  function layerConfigSvgId(config = {}, templateSvg = "") {
    return designImageId(config.layoutSvg || config.layoutSvgUrl || templateSvg || "");
  }

  function isSourceSvgLayerConfig(config = {}, templateSvg = "") {
    const layoutSvg = config.layoutSvg || config.layoutSvgUrl || templateSvg || "";
    if (!layoutSvg) return false;
    const layoutSource = String(config.layoutSource || "").toLowerCase();
    const objectLayerMode = String(config.objectLayerMode || "").toLowerCase();
    const assetStatus = String(config.assetMatchStatus || "").toLowerCase();
    if (/product-image/.test(layoutSource) || /product-image/.test(objectLayerMode) || /product-image/.test(assetStatus)) return false;
    return Boolean(
      layoutSource === "svg-template"
      || objectLayerMode === "source-svg"
      || config.sourceEditable
      || config.fullyEditable
      || [
        "complete",
        "team-banner-sports-import",
        "svg-template",
        "svg-template-visual-exact",
        "svg-template-direct-product-image-id",
        "import-exact-source",
        "image-id-template"
      ].includes(assetStatus)
    );
  }

  function isExactProductSvg(product = {}, config = {}, fallbackImage = "", templateSvg = "") {
    const productId = designImageId(product.image || fallbackImage);
    const svgId = layerConfigSvgId(config, product.templateSvg || templateSvg);
    if (productId && svgId && productId === svgId) return true;
    return isSourceSvgLayerConfig(config, product.templateSvg || templateSvg);
  }

  function productImageFallbackConfig(config = {}, imageUrl = "") {
    return {
      ...config,
      backgroundAssetId: "",
      backgroundAssetName: "",
      backgroundSvgUrl: "",
      backgroundSvgId: "",
      backgroundUrl: imageUrl || config.backgroundUrl || "",
      backgroundSource: "product-image",
      logoAssetId: "",
      logoAssetName: "",
      logoSvgUrl: "",
      logoSvgId: "",
      logoUrl: imageUrl || config.logoUrl || "",
      logoSource: "crop",
      clipartAssetId: "",
      clipartAssetName: "",
      clipartSvgUrl: "",
      clipartSvgId: "",
      clipartUrl: imageUrl || config.clipartUrl || "",
      clipartSource: "crop",
      accessoryAssetId: "",
      accessoryAssetName: "",
      accessorySvgUrl: "",
      accessorySvgId: "",
      accessoryUrl: "",
      accessorySource: "",
      layoutSource: "product-image-fallback",
      layoutSvg: "",
      layoutSvgUrl: "",
      assetMatchStatus: "product-image-fallback"
    };
  }

  const localProductSvgTemplateCache = new Map();

  async function localProductSvgTemplateForImage(imageUrl = "") {
    const imageId = designImageId(imageUrl);
    if (!imageId) return "";
    const templateSvg = `/svg-layer-templates/${imageId}.svg`;
    if (localProductSvgTemplateCache.has(templateSvg)) {
      return localProductSvgTemplateCache.get(templateSvg) ? templateSvg : "";
    }

    try {
      const response = await fetch(resolveSourceUrl(templateSvg), { method: "HEAD", credentials: "omit" });
      if (response.ok) {
        localProductSvgTemplateCache.set(templateSvg, true);
        return templateSvg;
      }
    } catch (error) {
      // Some local/static contexts do not support HEAD; use the GET fallback below.
    }

    try {
      const response = await fetch(resolveSourceUrl(templateSvg), { credentials: "omit" });
      const exists = response.ok;
      localProductSvgTemplateCache.set(templateSvg, exists);
      return exists ? templateSvg : "";
    } catch (error) {
      localProductSvgTemplateCache.set(templateSvg, false);
      return "";
    }
  }

  function tagList(value) {
    return String(value || "")
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
  }

  function tbdTagNumber(tags, names, fallback = 0) {
    for (const name of names) {
      const prefix = `${name}:`;
      const match = tags.find((tag) => tag.toLowerCase().startsWith(prefix));
      if (!match) continue;
      const value = Number(match.slice(prefix.length));
      if (Number.isFinite(value)) return value;
    }
    return fallback;
  }

  function tbdTagValue(tags, names, fallback = "") {
    for (const name of names) {
      const prefix = `${name}:`;
      const match = tags.find((tag) => tag.toLowerCase().startsWith(prefix));
      if (match) return match.slice(prefix.length);
    }
    return fallback;
  }

  function defaultLayerConfigForShape(shape) {
    if (isRectangularShape(shape)) {
      return {
        layerCount: 29,
        backgroundCount: 1,
        teamLogoCount: 1,
        clipartCount: 1,
        playerCount: 12,
        playerIconCount: 12,
        playerTextCount: 12,
        textLayerCount: 14,
        headerTextCount: 2,
        yearTextCount: 0,
        backgroundSource: "product-image",
        logoSource: "crop",
        clipartSource: "crop"
      };
    }

    return {
      layerCount: 6,
      backgroundCount: 1,
      teamLogoCount: 1,
      clipartCount: 1,
      playerCount: 1,
      playerIconCount: 1,
      playerTextCount: 1,
      textLayerCount: 2,
      headerTextCount: 0,
      yearTextCount: 1,
      backgroundSource: "product-image",
      logoSource: "crop",
      clipartSource: "crop"
    };
  }

  function parseLayerConfigTags(tagsValue, shape, imageUrl) {
    const tags = tagList(tagsValue);
    const defaults = defaultLayerConfigForShape(shape);
    const playerCount = tbdTagNumber(tags, ["tbd:players"], defaults.playerCount);
    const playerTextCount = tbdTagNumber(tags, ["tbd:player-names", "tbd:player-texts", "tbd:player-text"], defaults.playerTextCount || playerCount);
    const playerIconCount = tbdTagNumber(tags, ["tbd:player-icons", "tbd:accessories"], defaults.playerIconCount || playerCount);
    const headerTextCount = tbdTagNumber(tags, ["tbd:header-texts"], defaults.headerTextCount);
    const yearTextCount = tbdTagNumber(tags, ["tbd:year-texts"], defaults.yearTextCount);
    const textLayerCount = tbdTagNumber(tags, ["tbd:text-layers"], defaults.textLayerCount || playerTextCount + headerTextCount + yearTextCount);
    const backgroundCount = tbdTagNumber(tags, ["tbd:background"], defaults.backgroundCount);
    const teamLogoCount = tbdTagNumber(tags, ["tbd:team-logo", "tbd:logo"], defaults.teamLogoCount);
    const clipartCount = tbdTagNumber(tags, ["tbd:clipart"], defaults.clipartCount);
    const layerCount = tbdTagNumber(
      tags,
      ["tbd:layers"],
      backgroundCount + teamLogoCount + clipartCount + playerIconCount + textLayerCount
    );
    const logoTagUrl = tbdTagValue(tags, ["tbd:logo-url", "tbd:team-logo-url"], "");
    const clipartTagUrl = tbdTagValue(tags, ["tbd:clipart-url"], "");
    const logoTitle = tbdTagValue(tags, ["tbd:team-logo-title", "tbd:logo-title"], "");
    const backgroundAssetId = tbdTagValue(tags, ["tbd:bg-asset-id", "tbd:background-asset-id"], "");
    const logoAssetId = tbdTagValue(tags, ["tbd:team-logo-asset-id", "tbd:logo-asset-id"], "");
    const clipartAssetId = tbdTagValue(tags, ["tbd:clipart-asset-id"], "");
    const accessoryAssetId = tbdTagValue(tags, ["tbd:accessory-asset-id"], "");
    const layoutSvg = tbdTagValue(tags, ["tbd:layout-svg"], "");

    return {
      ...defaults,
      layerCount,
      backgroundCount,
      teamLogoCount,
      clipartCount,
      playerCount,
      playerIconCount,
      playerTextCount,
      textLayerCount,
      headerTextCount,
      yearTextCount,
      backgroundAssetId,
      backgroundUrl: imageUrl || "",
      backgroundSource: tbdTagValue(tags, ["tbd:background-url", "tbd:bg-url"], defaults.backgroundSource),
      logoAssetId,
      logoUrl: logoTagUrl && logoTagUrl !== "crop" ? logoTagUrl : imageUrl || "",
      logoTitle,
      logoSource: logoTagUrl === "crop" ? "crop" : tbdTagValue(tags, ["tbd:logo-source", "tbd:team-logo-source"], defaults.logoSource),
      clipartAssetId,
      clipartUrl: clipartTagUrl && clipartTagUrl !== "crop" ? clipartTagUrl : imageUrl || "",
      clipartSource: clipartTagUrl === "crop" ? "crop" : tbdTagValue(tags, ["tbd:clipart-source"], defaults.clipartSource),
      accessoryAssetId,
      assetKey: tbdTagValue(tags, ["tbd:asset-key"], ""),
      assetMatchStatus: tbdTagValue(tags, ["tbd:asset-match"], ""),
      layoutSource: tbdTagValue(tags, ["tbd:layout-source"], ""),
      layoutSvg,
      layoutSvgUrl: layoutSvg ? `/svg-layer-templates/${layoutSvg}.svg` : ""
    };
  }

  function mergeLayerConfig(shape, imageUrl, ...configs) {
    return Object.assign(defaultLayerConfigForShape(shape), { backgroundUrl: imageUrl || "" }, ...configs.filter(Boolean));
  }

  function productCandidates(root, launch) {
    return [
      launch.handle,
      handleFromUrl(launch.productUrl),
      handleFromUrl(root.dataset.productUrl),
      handleFromUrl(window.location.href),
      handleFromUrl(document.referrer),
      titleSlug(launch.title)
    ].filter(Boolean);
  }

  async function detectProductFromManifest(root, launch) {
    const url = launch.productManifestUrl || root.dataset.productsUrl || (window.location.protocol === "file:" ? "" : resolveSourceUrl("/team-banner-products.json"));
    if (!url) return null;

    try {
      const response = await fetch(url, { credentials: "omit" });
      if (!response.ok) throw new Error("Product manifest request failed");
      const data = await response.json();
      const products = Array.isArray(data.products) ? data.products : Array.isArray(data) ? data : [];
      const usableProducts = MVP_5X3_ONLY ? products.filter(isFiveByThreeProduct) : products;
      const byHandle = new Map();
      const byImage = new Map();
      usableProducts.forEach((product) => {
        if (!product) return;
        [product.handle, product.titleSlug, titleSlug(product.title)].filter(Boolean).forEach((key) => {
          if (!byHandle.has(String(key))) byHandle.set(String(key), product);
        });
        const imageKey = imageFileKey(product.image);
        if (imageKey && !byImage.has(imageKey)) byImage.set(imageKey, product);
      });
      const imageMatch = byImage.get(imageFileKey(launch.image));
      const handleMatch = productCandidates(root, launch)
        .map((candidate) => byHandle.get(candidate) || byHandle.get(titleSlug(candidate)))
        .filter((product) => productImageMatchesLaunch(product, launch))
        .find(Boolean);
      // The clicked Shopify image is the strongest identity signal. Handles can
      // be stale in collection/recommendation snippets, but the image URL is
      // what the customer actually selected.
      const match = imageMatch || handleMatch;
      if (!match) return null;

      launch.handle = launch.handle || match.handle || "";
      launch.productUrl = launch.productUrl || match.url || match.path || "";
      launch.title = !launch.title || launch.title === "Team Banner" ? match.title || launch.title : launch.title;
      launch.tags = launch.tags || match.tags || "";
      launch.image = launch.image || match.image || "";
      launch.price = launch.price || match.price || "";
      launch.product = match;
      launch.shape = inferLaunchShape(
        match.shape || match.productShape || launch.shape,
        [
          match.shape,
          match.productShape,
          match.tags,
          match.type,
          match.productCategory,
          match.title,
          match.handle,
          launch.tags,
          launch.collections
        ].join(" "),
        Boolean(match.image || launch.image || launch.templateSvg)
      );
      const manifestLayerConfig = mergeLayerConfig(
        launch.shape,
        launch.image,
        parseLayerConfigTags(launch.tags, launch.shape, launch.image),
        match.layerConfig
      );
      const manifestTemplateSvg = match.templateSvg || manifestLayerConfig.layoutSvgUrl || "";
      const explicitTemplateSvg = launch.templateSvg || "";
      const trustedManifestSvg = isExactProductSvg(match, manifestLayerConfig, launch.image, manifestTemplateSvg);
      const trustedExplicitSvg = explicitTemplateSvg && designImageId(explicitTemplateSvg) === designImageId(launch.image || match.image);
      const imageIdTemplateSvg = trustedManifestSvg || trustedExplicitSvg
        ? ""
        : await localProductSvgTemplateForImage(launch.image || match.image);
      const imageIdTemplateSvgId = designImageId(imageIdTemplateSvg);
      const imageIdTemplateConfig = imageIdTemplateSvg
        ? {
            ...manifestLayerConfig,
            layoutSource: "svg-template",
            layoutSvg: imageIdTemplateSvgId,
            layoutSvgUrl: imageIdTemplateSvg,
            assetMatchStatus: "image-id-template"
          }
        : null;
      launch.templateSvg = trustedExplicitSvg
        ? explicitTemplateSvg
        : trustedManifestSvg
          ? manifestTemplateSvg
          : imageIdTemplateSvg
            ? imageIdTemplateSvg
          : "";
      launch.layerConfig = trustedManifestSvg || trustedExplicitSvg
        ? manifestLayerConfig
        : imageIdTemplateConfig
          ? imageIdTemplateConfig
        : productImageFallbackConfig(manifestLayerConfig, launch.image || match.image || "");
      launch.hasDesign = Boolean(launch.autoLoadProduct) && launch.autoLayer !== "blank" && Boolean(launch.image || launch.templateSvg);
      return match;
    } catch (error) {
      return null;
    }
  }

  function normalizeLayerMapEntry(entry) {
    if (!entry || typeof entry !== "object") return null;
    const map = { ...entry };
    if (!map.mode) map.mode = "exact-overlay";
    return map;
  }

  function isProductImageObjectFallbackMap(entry) {
    if (!entry || typeof entry !== "object") return false;
    const config = entry.layerConfig || {};
    const values = [
      entry.matchConfidence,
      entry.sourceType,
      entry.editableLayerMode,
      config.layoutSource,
      config.assetMatchStatus,
      config.objectLayerMode
    ].map((value) => String(value || "").toLowerCase());
    return values.some((value) => (
      value === "product-image-object-fallback"
      || value === "product-image-svg-exact-fallback"
      || value === "product-image-svg-fallback"
    ));
  }

  function shouldSkipLayerMapOverride(launch, layerMap) {
    if (launch.sourceSvgMap && launch.templateSvg) return true;
    const baseConfig = launch.layerConfig || {};
    const mapConfig = (layerMap && layerMap.layerConfig) || {};
    const baseComplete = String(baseConfig.assetMatchStatus || "").toLowerCase() === "complete";
    if (!baseComplete) return false;

    const mapStatus = String(mapConfig.assetMatchStatus || "").toLowerCase();
    const mapIsPartial = Boolean(mapStatus && mapStatus !== "complete");
    const countKeys = ["layerCount", "playerCount", "playerIconCount", "playerTextCount", "textLayerCount"];
    const countsConflict = countKeys.some((key) => {
      const baseValue = Number(baseConfig[key] || 0);
      const mapValue = Number(mapConfig[key] || 0);
      return baseValue > 0 && mapValue > 0 && baseValue !== mapValue;
    });

    // Exact overlay maps are hand-authored. Keep a complete manifest from being
    // downgraded by an older partial map with stale layer counts.
    return mapIsPartial || countsConflict;
  }

  async function detectProductLayerMap(root, launch) {
    const url = launch.layerMapsUrl || root.dataset.layerMapsUrl || (window.location.protocol === "file:" ? "" : resolveSourceUrl("/team-banner-layer-maps.json"));
    if (!url) return null;

    try {
      const response = await fetch(url, { credentials: "omit" });
      if (!response.ok) throw new Error("Layer map request failed");
      const data = await response.json();
      const maps = data.maps || data.products || data;
      const candidates = productCandidates(root, launch);
      let match = null;

      if (Array.isArray(maps)) {
        match = candidates
          .map((candidate) => maps.find((item) => (
            item
            && (String(item.handle || "") === candidate
              || String(item.productHandle || "") === candidate
              || titleSlug(item.title) === titleSlug(candidate))
          )))
          .find(Boolean) || null;
      } else if (maps && typeof maps === "object") {
        match = candidates
          .map((candidate) => maps[candidate] || maps[titleSlug(candidate)])
          .find(Boolean) || null;
      }

      const layerMap = normalizeLayerMapEntry(match);
      if (!layerMap) return null;
      if (shouldSkipLayerMapOverride(launch, layerMap)) return null;
      const layerMapSvgId = designImageId(layerMap.templateSvg || layerMap.layerConfig?.layoutSvgUrl || layerMap.layerConfig?.layoutSvg || "");
      const launchImageId = designImageId(launch.image || "");
      if (
        layerMapSvgId
        && launchImageId
        && layerMapSvgId !== launchImageId
        && !layerMap.allowImageMismatch
      ) {
        return null;
      }
      launch.layerMap = layerMap;
      launch.shape = inferLaunchShape(
        layerMap.shape || layerMap.productShape || launch.shape,
        [
          layerMap.shape,
          layerMap.productShape,
          layerMap.title,
          layerMap.handle,
          layerMap.productHandle,
          layerMap.sourceTemplatePage,
          layerMap.layerConfig && JSON.stringify(layerMap.layerConfig),
          launch.tags,
          launch.collections
        ].join(" "),
        Boolean(launch.image || launch.templateSvg)
      );
      if (layerMap.layerConfig) {
        launch.layerConfig = mergeLayerConfig(
          launch.shape,
          launch.image,
          launch.layerConfig,
          layerMap.layerConfig
        );
      }
      if (layerMap.templateSvg) launch.templateSvg = layerMap.templateSvg;
      launch.hasDesign = Boolean(launch.autoLoadProduct) && launch.autoLayer !== "blank" && Boolean(launch.image || launch.templateSvg);
      return layerMap;
    } catch (error) {
      return null;
    }
  }

  async function detectProductSourceSvgMap(root, launch) {
    const defaultMap = launch.allowCandidateSourceMap ? "/team-banner-source-svg-candidates.json" : "/team-banner-source-svg-map.json";
    const url = launch.sourceMapUrl || root.dataset.sourceMapUrl || (window.location.protocol === "file:" ? "" : resolveSourceUrl(defaultMap));
    if (!url) return null;

    try {
      const response = await fetch(url, { credentials: "omit" });
      if (!response.ok) throw new Error("Source SVG map request failed");
      const data = await response.json();
      const maps = Array.isArray(data.maps) ? data.maps : Array.isArray(data) ? data : [];
      const validMap = (item) => item
        && (
          String(item.matchStatus || "matched").toLowerCase() === "matched"
          || (
            launch.allowCandidateSourceMap
            && ["review", "candidate"].includes(String(item.matchStatus || "").toLowerCase())
          )
        );
      const launchImageKey = imageFileKey(launch.image);
      const handleCandidates = [
        launch.handle,
        handleFromUrl(launch.productUrl),
        handleFromUrl(root.dataset.productUrl),
        handleFromUrl(window.location.href),
        handleFromUrl(document.referrer)
      ].filter(Boolean);
      const imageMatch = launchImageKey
        ? maps.find((item) => validMap(item) && imageFileKey(item.productImage) === launchImageKey)
        : null;
      const sourceItemMatchesImage = (item) => {
        if (!launchImageKey || !item || !item.productImage) return true;
        return imageFileKey(item.productImage) === launchImageKey;
      };
      const handleMatch = handleCandidates
        .map((candidate) => maps.find((item) => (
          validMap(item)
          && sourceItemMatchesImage(item)
          && (String(item.handle || "") === candidate || String(item.productHandle || "") === candidate)
        )))
        .find(Boolean);
      const titleMatch = !handleCandidates.length && launch.title
        ? maps.find((item) => validMap(item) && sourceItemMatchesImage(item) && titleSlug(item.title) === titleSlug(launch.title))
        : null;
      const match = imageMatch || handleMatch || titleMatch;

      if (!match || (!match.templateSvg && !isProductImageObjectFallbackMap(match))) return null;
      launch.sourceSvgMap = match;
      launch.shape = inferLaunchShape(
        match.shape || match.productShape || launch.shape,
        [
          match.shape,
          match.productShape,
          match.title,
          match.handle,
          match.productHandle,
          match.sourceTemplatePage,
          match.sourceSvgUrl,
          match.layerConfig && JSON.stringify(match.layerConfig),
          launch.tags,
          launch.collections
        ].join(" "),
        Boolean(launch.image || launch.templateSvg)
      );
      if (isProductImageObjectFallbackMap(match)) {
        const layoutSvgUrl = match.templateSvg || match.layerConfig?.layoutSvgUrl || "";
        launch.templateSvg = "";
        launch.objectLayerFallback = true;
        launch.layerConfig = mergeLayerConfig(
          launch.shape,
          launch.image,
          launch.layerConfig,
          match.layerConfig,
          {
            layoutSource: "product-image-object-fallback",
            layoutSvgUrl,
            layoutSvg: (match.layerConfig && match.layerConfig.layoutSvg) || String(layoutSvgUrl).split("/").pop().replace(/\.svg$/i, ""),
            assetMatchStatus: "product-image-object-fallback",
            objectLayerMode: "product-image-object-fallback"
          }
        );
        if (launch.autoLoadProduct && ["png", "svg", "magic"].includes(launch.autoLayer)) launch.autoLayer = "png";
        launch.hasDesign = Boolean(launch.autoLoadProduct) && launch.autoLayer !== "blank" && Boolean(launch.image || layoutSvgUrl);
        return match;
      }
      launch.templateSvg = match.templateSvg;
      if (match.layerConfig) {
        launch.layerConfig = mergeLayerConfig(
          launch.shape,
          launch.image,
          launch.layerConfig,
          match.layerConfig,
          {
            layoutSource: "svg-template",
            layoutSvgUrl: match.templateSvg,
            layoutSvg: match.layerConfig.layoutSvg || String(match.templateSvg).split("/").pop().replace(/\.svg$/i, "")
          }
        );
      }
      if (launch.autoLoadProduct && launch.autoLayer === "png") launch.autoLayer = "svg";
      launch.hasDesign = Boolean(launch.autoLoadProduct) && launch.autoLayer !== "blank" && Boolean(launch.image || launch.templateSvg);
      return match;
    } catch (error) {
      return null;
    }
  }

  async function detectShapeFromTemplateSvg(launch) {
    if (!launch.templateSvg) return "";
    try {
      const response = await fetch(resolveSourceUrl(launch.templateSvg), { credentials: "omit" });
      if (!response.ok) return "";
      const templateShape = shapeFromSvgText(await response.text());
      if (!templateShape) return "";
      launch.shape = inferLaunchShape(launch.shape, templateShape, Boolean(launch.image || launch.templateSvg));
      if (launch.layerConfig) {
        launch.layerConfig = mergeLayerConfig(launch.shape, launch.image, launch.layerConfig);
      }
      return templateShape;
    } catch (error) {
      return "";
    }
  }

  async function init(root) {
    const canvasEl = root.querySelector("[data-tbd-canvas]");
    if (!canvasEl || !window.fabric) {
      window.setTimeout(() => init(root), 80);
      return;
    }

    const launch = readLaunchParams(root);
    await detectProductFromManifest(root, launch);
    await detectProductSourceSvgMap(root, launch);
    await detectProductLayerMap(root, launch);
    await detectShapeFromTemplateSvg(launch);
    configureArtboard(launch);
    canvasEl.width = WIDTH;
    canvasEl.height = HEIGHT;

    const els = {
      status: root.querySelector("[data-tbd-status]"),
      team: root.querySelector("[data-tbd-team]"),
      bgColor: root.querySelector("[data-tbd-bg-color]"),
      fill: root.querySelector("[data-tbd-fill]"),
      stroke: root.querySelector("[data-tbd-stroke]"),
      opacity: root.querySelector("[data-tbd-opacity]"),
      size: root.querySelector("[data-tbd-size]"),
      angle: root.querySelector("[data-tbd-angle]"),
      angles: [...root.querySelectorAll("[data-tbd-angle]")],
      angleValues: [...root.querySelectorAll("[data-tbd-angle-value]")],
      charSpacings: [...root.querySelectorAll("[data-tbd-char-spacing]")],
      lineHeights: [...root.querySelectorAll("[data-tbd-line-height]")],
      textAlignButtons: [...root.querySelectorAll("[data-tbd-text-align]")],
      textStyleButtons: [...root.querySelectorAll("[data-tbd-text-style]")],
      selectedName: root.querySelector("[data-tbd-selected-name]"),
      categories: root.querySelector("[data-tbd-categories]"),
      assets: root.querySelector("[data-tbd-assets]"),
      search: root.querySelector("[data-tbd-search]"),
      assetCount: root.querySelector("[data-tbd-asset-count]"),
      assetPager: root.querySelector("[data-tbd-asset-pager]"),
      templateSearch: root.querySelector("[data-tbd-template-search]"),
      templateSport: root.querySelector("[data-tbd-template-sport]"),
      templateType: root.querySelector("[data-tbd-template-type]"),
      templateAuto: root.querySelector("[data-tbd-template-auto]"),
      templateMobileMode: root.querySelector("[data-tbd-template-mobile-mode]"),
      templateTrack: root.querySelector("[data-tbd-template-track]"),
      templateCount: root.querySelector("[data-tbd-template-count]"),
      templatePager: root.querySelector("[data-tbd-template-pager]"),
      templatePreview: root.querySelector("[data-tbd-template-preview]"),
      templatePreviewImage: root.querySelector("[data-tbd-template-preview-image]"),
      templatePreviewTitle: root.querySelector("[data-tbd-template-preview-title]"),
      templatePreviewMeta: root.querySelector("[data-tbd-template-preview-meta]"),
      templateDesign: root.querySelector("[data-tbd-template-design]"),
      templateGenerator: root.querySelector("[data-tbd-template-generator]"),
      templateGeneratorToggle: root.querySelector("[data-tbd-template-generator-toggle]"),
      templateGeneratorBody: root.querySelector("[data-tbd-template-generator-body]"),
      generatorTeam: root.querySelector("[data-tbd-generator-team]"),
      generatorManager: root.querySelector("[data-tbd-generator-manager]"),
      generatorAssistantManager: root.querySelector("[data-tbd-generator-assistant-manager]"),
      generatorCoach: root.querySelector("[data-tbd-generator-coach]"),
      generatorAssistantCoach: root.querySelector("[data-tbd-generator-assistant-coach]"),
      generatorTeamMom: root.querySelector("[data-tbd-generator-team-mom]"),
      generatorSponsor: root.querySelector("[data-tbd-generator-sponsor]"),
      generatorPlayerCount: root.querySelector("[data-tbd-generator-player-count]"),
      generatorPlayerEditor: root.querySelector("[data-tbd-generator-player-editor]"),
      generatorPlayerNames: root.querySelector("[data-tbd-generator-player-names]"),
      generatorPlayerSummary: root.querySelector("[data-tbd-generator-player-summary]"),
      generatorSport: root.querySelector("[data-tbd-generator-sport]"),
      generatorType: root.querySelector("[data-tbd-generator-type]"),
      generatorSvg: root.querySelector("[data-tbd-generator-svg]"),
      generatorAssetSearch: root.querySelector("[data-tbd-generator-asset-search]"),
      generatorLayoutOptions: root.querySelector("[data-tbd-generator-layout-options]"),
      generatorBackgroundOptions: root.querySelector("[data-tbd-generator-background-options]"),
      generatorLogoOptions: root.querySelector("[data-tbd-generator-logo-options]"),
      generatorClipartOptions: root.querySelector("[data-tbd-generator-clipart-options]"),
      generatorAccessoryOptions: root.querySelector("[data-tbd-generator-accessory-options]"),
      generatorPreview: root.querySelector("[data-tbd-generator-preview]"),
      generatorPreviewAll: root.querySelector("[data-tbd-generator-preview-all]"),
      generatorDesign: root.querySelector("[data-tbd-generator-design]"),
      generatorClear: root.querySelector("[data-tbd-generator-clear]"),
      generatorSaveSetup: root.querySelector("[data-tbd-generator-save-setup]"),
      generatorLoadSetup: root.querySelector("[data-tbd-generator-load-setup]"),
      generatorSavedMeta: root.querySelector("[data-tbd-generator-saved-meta]"),
      generatorPreviewBox: root.querySelector("[data-tbd-generator-preview-box]"),
      generatorPreviewImage: root.querySelector("[data-tbd-generator-preview-image]"),
      generatorPreviewMeta: root.querySelector("[data-tbd-generator-preview-meta]"),
      generatorAllPreviews: root.querySelector("[data-tbd-generator-all-previews]"),
      preview: root.querySelector("[data-tbd-preview]"),
      savedMeta: root.querySelector("[data-tbd-saved-meta]"),
      upload: root.querySelector("[data-tbd-upload]"),
      projectUpload: root.querySelector("[data-tbd-project-upload]"),
      layerCount: root.querySelector("[data-tbd-layer-count]"),
      pngLayerUpload: root.querySelector("[data-tbd-png-layer-upload]"),
      svgLayerUpload: root.querySelector("[data-tbd-svg-layer-upload]"),
      svgTemplates: root.querySelector("[data-tbd-svg-templates]"),
      layerLists: [...root.querySelectorAll("[data-tbd-layer-list]")],
      categorySelect: root.querySelector("[data-tbd-category-select]"),
      textContent: root.querySelector("[data-tbd-text-content]"),
      fontFamily: root.querySelector("[data-tbd-font-family]"),
      fills: [...root.querySelectorAll("[data-tbd-fill]")],
      strokes: [...root.querySelectorAll("[data-tbd-stroke]")],
      sizes: [...root.querySelectorAll("[data-tbd-size]")],
      opacities: [...root.querySelectorAll("[data-tbd-opacity]")],
      opacityValues: [...root.querySelectorAll("[data-tbd-opacity-value]")],
      strokeWidths: [...root.querySelectorAll("[data-tbd-stroke-width]")],
      strokeOpacities: [...root.querySelectorAll("[data-tbd-stroke-opacity]")],
      gradientStart: root.querySelector("[data-tbd-gradient-start]"),
      gradientEnd: root.querySelector("[data-tbd-gradient-end]"),
      gradientType: root.querySelector("[data-tbd-gradient-type]"),
      gradientX1: root.querySelector("[data-tbd-gradient-x1]"),
      gradientY1: root.querySelector("[data-tbd-gradient-y1]"),
      gradientX2: root.querySelector("[data-tbd-gradient-x2]"),
      gradientY2: root.querySelector("[data-tbd-gradient-y2]"),
      gradientBar: root.querySelector("[data-tbd-gradient-bar]"),
      gradientStops: [...root.querySelectorAll("[data-tbd-gradient-stop]")],
      alignArtboards: [...root.querySelectorAll("[data-tbd-align-artboard]")],
      stage: root.querySelector(".tbd__stage"),
      productHeadline: root.querySelector("[data-tbd-product-headline]"),
      productMeta: root.querySelector("[data-tbd-product-meta]"),
      productPrice: root.querySelector("[data-tbd-product-price]"),
      mobileTextEdit: root.querySelector("[data-tbd-mobile-text-edit]"),
      mobileTextInput: root.querySelector("[data-tbd-mobile-text-input]"),
      shapeSelect: root.querySelector("[data-tbd-shape-select]"),
      shapeSelects: [...root.querySelectorAll("[data-tbd-shape-select], [data-tbd-banner-type]")],
      cartCount: root.querySelector("[data-tbd-cart-count]"),
      cartItems: root.querySelector("[data-tbd-cart-items]"),
      cartEmpty: root.querySelector("[data-tbd-cart-empty]"),
      cartSummary: root.querySelector("[data-tbd-cart-summary]"),
      cartCheckout: root.querySelector("[data-tbd-cart-checkout]"),
      cartContinue: root.querySelector("[data-tbd-cart-continue]")
    };

    const canvas = new fabric.Canvas(canvasEl, {
      allowTouchScrolling: false,
      enablePointerEvents: true,
      preserveObjectStacking: true,
      selection: true
    });
    root.tbdCanvas = canvas;
    [canvas.wrapperEl, canvas.lowerCanvasEl, canvas.upperCanvasEl].forEach((element) => {
      if (!element) return;
      element.style.touchAction = "none";
      element.style.webkitUserSelect = "none";
      element.style.userSelect = "none";
    });
    fabric.Object.prototype.touchCornerSize = Math.max(fabric.Object.prototype.touchCornerSize || 0, 34);
    fabric.Object.prototype.cornerSize = Math.max(fabric.Object.prototype.cornerSize || 0, 12);
    fabric.Object.prototype.rotatingPointOffset = Math.max(fabric.Object.prototype.rotatingPointOffset || 0, 44);
    fabric.Object.prototype.transparentCorners = false;
    fabric.Object.prototype.cornerColor = "#ffffff";
    fabric.Object.prototype.cornerStrokeColor = "#2f7df6";
    fabric.Object.prototype.borderColor = "#2f7df6";
    const cartVariantId = launch.cartVariantId || root.dataset.cartVariantId || root.dataset.variantId || root.dataset.productId;
    const cartHost = window.location.hostname || "";
    const canUseSameOriginCart = Boolean(cartVariantId)
      && window.location.protocol !== "file:"
      && cartHost !== "localhost"
      && cartHost !== "127.0.0.1"
      && !cartHost.endsWith(".vercel.app");
    const customCheckoutVariantId = launch.customCheckoutVariantId || root.dataset.customCheckoutVariantId || root.dataset.customCartVariantId || DEFAULT_CUSTOM_DESIGN_VARIANT_ID;
    const defaultCustomCheckoutUrl = absoluteShopifyUrl(
      launch.customCheckoutUrl
        || root.dataset.customCheckoutUrl
        || root.dataset.cartCheckoutUrl
        || customDesignCheckoutUrl(customCheckoutVariantId)
        || DEFAULT_CUSTOM_DESIGN_CHECKOUT_URL
    );
    function currentCustomDesignVariantId() {
      const shape = ARTBOARD_SHAPE;
      const shapeVariantId = shape === "triangle"
        ? (launch.triangleCheckoutVariantId || root.dataset.triangleCheckoutVariantId || root.dataset.triangleVariantId || CUSTOM_DESIGN_VARIANT_BY_SHAPE.triangle)
        : shape === "homeplatepennant"
          ? (launch.homeplateCheckoutVariantId || launch.homePlateCheckoutVariantId || root.dataset.homeplateCheckoutVariantId || root.dataset.homePlateCheckoutVariantId || root.dataset.homeplateVariantId || root.dataset.homePlateVariantId || CUSTOM_DESIGN_VARIANT_BY_SHAPE.homeplatepennant)
          : "";
      return String(shapeVariantId || customCheckoutVariantId || DEFAULT_CUSTOM_DESIGN_VARIANT_ID).trim();
    }

    function currentCustomCheckoutUrl() {
      const shape = ARTBOARD_SHAPE;
      const shapeUrl = shape === "triangle"
        ? (launch.triangleCheckoutUrl || root.dataset.triangleCheckoutUrl || root.dataset.triangleCartCheckoutUrl)
        : shape === "homeplatepennant"
          ? (launch.homeplateCheckoutUrl || launch.homePlateCheckoutUrl || root.dataset.homeplateCheckoutUrl || root.dataset.homePlateCheckoutUrl || root.dataset.homeplateCartCheckoutUrl || root.dataset.homePlateCartCheckoutUrl)
          : "";
      if (shapeUrl) return absoluteShopifyUrl(shapeUrl);

      const shapeVariantId = currentCustomDesignVariantId();
      if (shapeVariantId) return customDesignCheckoutUrl(shapeVariantId);
      return defaultCustomCheckoutUrl;
    }
    const proofEmailEndpoint = resolveSourceUrl(launch.proofEmailUrl || root.dataset.proofEmailUrl || root.dataset.emailProofUrl || "/api/send-proof-email");
    const proofEmailTo = launch.proofEmailTo || root.dataset.proofEmailTo || root.dataset.emailProofTo || "info@tsbanners.com";
    const imageProxyEndpoint = launch.imageProxyUrl || root.dataset.imageProxyUrl || defaultImageProxyEndpoint();
    let assets = FALLBACK_ASSETS;
    let activeCategory = defaultCategoryForShape(ARTBOARD_SHAPE);
    let assetPage = 1;
    let searchTerm = "";
    let templateProducts = [];
    let visibleTemplates = [];
    let selectedTemplate = null;
    let templatePage = 1;
    let templateAutoTimer = 0;
    let templateSearchTerm = "";
    let templateSportFilter = "all";
    let templateTypeFilter = "all";
    let generatedTemplateMeta = "";
    let generatorAssetSearchTerm = "";
    let generatorAllPreviewItems = [];
    let generatorPreviewBusy = false;
    let generatorPlayerNamesCache = [];
    const selectedGeneratorAssets = {
      background: "",
      teamName: "",
      clipart: "",
      accessory: ""
    };
    let guide = null;
    let teamText = null;
    let history = [];
    let historyIndex = -1;
    let isRestoring = false;
    let svgTemplates = [];
    let activeTool = "select";
    let gradientStopOffsets = { start: 0, end: 1 };
    let projectRestoreToken = 0;
    let projectWasOpened = false;
    let layerUidCounter = 0;
    let assetDragState = null;
    let suppressAssetClick = false;
    const imageElementCache = new Map();
    const designCartStorageKey = "team-banner-design-cart:v1";
    let designCart = loadDesignCart();

    canvas.setWidth(WIDTH);
    canvas.setHeight(HEIGHT);
    canvas.backgroundColor = canvasBackgroundColor("#ffffff");
    canvas.clipPath = makeClipPath();

    function hydrateTooltips() {
      root.querySelectorAll("button").forEach((button) => {
        const label = button.dataset.tooltip
          || button.getAttribute("aria-label")
          || button.getAttribute("title")
          || button.textContent.trim().replace(/\s+/g, " ");
        if (!label) return;
        button.dataset.tooltip = label;
        if (!button.getAttribute("aria-label")) button.setAttribute("aria-label", label);
        button.removeAttribute("title");
      });
    }

    function makeClipPath() {
      if (isRectangularShape(ARTBOARD_SHAPE)) {
        return null;
      }

      return new fabric.Polygon(artboardPoints(), { absolutePositioned: true });
    }

    function canvasBackgroundColor(background) {
      const color = background || "#ffffff";
      return !isRectangularShape(ARTBOARD_SHAPE) && String(color).toLowerCase() === "#ffffff"
        ? "rgba(255,255,255,0)"
        : color;
    }

    function artboardBounds() {
      if (ARTBOARD_SHAPE === "polepocket") {
        const sleeve = HEIGHT * POLE_POCKET_SLEEVE_RATIO;
        return {
          left: 0,
          top: sleeve,
          width: WIDTH,
          height: HEIGHT - sleeve * 2
        };
      }
      if (ARTBOARD_SHAPE === "triangle") {
        const height = Math.min(HEIGHT, Math.round(WIDTH * (TRIANGLE_PRINT_HEIGHT / TRIANGLE_WIDTH)));
        return {
          left: 0,
          top: (HEIGHT - height) / 2,
          width: WIDTH,
          height
        };
      }
      return { left: 0, top: 0, width: WIDTH, height: HEIGHT };
    }

    function artboardPoints() {
      const bounds = artboardBounds();
      if (isHomePlateShape(ARTBOARD_SHAPE)) {
        return [
          { x: bounds.left, y: bounds.top },
          { x: bounds.left + bounds.width, y: bounds.top },
          { x: bounds.left + bounds.width, y: bounds.top + bounds.height * 0.56 },
          { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height },
          { x: bounds.left, y: bounds.top + bounds.height * 0.56 }
        ];
      }

      return [
        { x: bounds.left, y: bounds.top },
        { x: bounds.left + bounds.width, y: bounds.top },
        { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height }
      ];
    }

    function defaultAssetForCurrentShape() {
      const category = defaultCategoryForShape(ARTBOARD_SHAPE);
      return assets.find((asset) => asset.category === category)
        || FALLBACK_ASSETS.find((asset) => asset.category === category)
        || assets[0]
        || FALLBACK_ASSETS[0];
    }

    function setStatus(message) {
      if (els.status) els.status.textContent = message || "";
    }

    function syncProductInfo() {
      const size = launch.sizeLabel || defaultSizeForShape(ARTBOARD_SHAPE);
      const productContext = [
        launch.title,
        launch.handle,
        launch.tags,
        launch.collections,
        launch.product && launch.product.title,
        launch.product && launch.product.handle,
        launch.product && launch.product.tags
      ].filter(Boolean).join(" ");
      const displayTitle = launch.headline || defaultHeadlineForShape(ARTBOARD_SHAPE, productContext);
      const price = launch.price ? `$${String(launch.price).replace(/^\$/, "")}` : defaultPriceForShape(ARTBOARD_SHAPE);
      ["rectangle", "polepocket", "triangle", "homeplate", "homeplatepennant"].forEach((shape) => {
        root.classList.toggle(`tbd--shape-${shape}`, ARTBOARD_SHAPE === shape);
      });
      root.classList.toggle("tbd--nonrect", !isRectangularShape(ARTBOARD_SHAPE));
      if (els.productHeadline) els.productHeadline.textContent = displayTitle;
      if (els.productMeta) {
        const material = launch.materialLabel || "heavy duty vinyl banner - Digitally printed on vinyl";
        els.productMeta.textContent = ARTBOARD_SHAPE === "rectangle"
          ? `(Size ${size}) -`
          : `(- Size: ${size} - Material: ${material}) -`;
      }
      if (els.productPrice) els.productPrice.textContent = price;
      const shapeValue = bannerTypeValueForShape(ARTBOARD_SHAPE);
      els.shapeSelects.forEach((select) => {
        select.value = shapeValue;
      });
    }

    function hasTemplateBackgroundLayer() {
      return canvas.getObjects().some((obj) => obj !== guide && obj.data && obj.data.role === "template-background");
    }

    function syncGuideVisibility() {
      if (!guide) return;
      guide.visible = !(isHomePlateShape(ARTBOARD_SHAPE) && hasTemplateBackgroundLayer());
    }

    function keepGuideOnTop() {
      if (!guide) return;
      syncGuideVisibility();
      if (guide.visible) guide.bringToFront();
    }

    function drawGuide() {
      if (guide) canvas.remove(guide);
      const common = {
        fill: "transparent",
        stroke: "#2a2a2a",
        strokeWidth: 3,
        selectable: false,
        evented: false,
        excludeFromExport: true,
        data: { role: "cut-guide" }
      };
      if (ARTBOARD_SHAPE === "polepocket") {
        const bounds = artboardBounds();
        const topSleeve = new fabric.Rect({
          left: 0,
          top: 0,
          width: WIDTH,
          height: bounds.top,
          fill: "rgba(244,244,244,.78)",
          stroke: "transparent"
        });
        const bottomSleeve = new fabric.Rect({
          left: 0,
          top: bounds.top + bounds.height,
          width: WIDTH,
          height: HEIGHT - bounds.top - bounds.height,
          fill: "rgba(244,244,244,.78)",
          stroke: "transparent"
        });
        const printable = new fabric.Rect({
          left: bounds.left,
          top: bounds.top,
          width: bounds.width,
          height: bounds.height,
          fill: "transparent",
          stroke: "transparent",
          strokeWidth: 0
        });
        guide = new fabric.Group([topSleeve, bottomSleeve, printable], {
          selectable: false,
          evented: false,
          excludeFromExport: true,
          data: { role: "cut-guide" }
        });
      } else {
        guide = isRectangularShape(ARTBOARD_SHAPE)
          ? new fabric.Rect({ left: 0, top: 0, width: WIDTH, height: HEIGHT, ...common })
          : new fabric.Polygon(artboardPoints(), common);
      }
      canvas.add(guide);
      keepGuideOnTop();
    }

    function withoutGuide(callback) {
      const wasVisible = guide ? guide.visible : false;
      if (guide) guide.visible = false;
      canvas.discardActiveObject();
      canvas.renderAll();
      try {
        return callback();
      } finally {
        if (guide) guide.visible = wasVisible;
        keepGuideOnTop();
        canvas.renderAll();
      }
    }

    function normalizeAsset(asset) {
      return {
        ...asset,
        name: asset.name || "Untitled asset",
        category: normalizeAssetCategory(asset),
        url: asset.url
      };
    }

    function ensureLayerId(obj) {
      if (!obj || obj === guide) return "";
      const data = { ...(obj.data || {}) };
      if (!data.layerId) {
        layerUidCounter += 1;
        data.layerId = `layer-${layerUidCounter}`;
        obj.set({ data });
      }
      return data.layerId;
    }

    function deburrText(value) {
      return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    }

    function compactWhitespace(value) {
      return String(value || "").replace(/\s+/g, " ").trim();
    }

    function layerMatchText(value) {
      return compactWhitespace(
        deburrText(value)
          .toLowerCase()
          .replace(/&/g, " and ")
          .replace(/\([^)]*\)/g, " ")
          .replace(/\b0+(\d+)\b/g, "$1")
          .replace(/[^a-z0-9]+/g, " ")
      );
    }

    function stripLayerTerms(value) {
      return compactWhitespace(
        layerMatchText(value)
          .replace(/\b(softball|baseball|soccer|football|basketball)\b/g, " ")
          .replace(/\b(homeplate|home|plate|triangle|pennant|banners|banner|hem|grommets|pole|pocket|custom|team|picture|copy)\b/g, " ")
      );
    }

    function productLayerKeys() {
      const raw = [
        launch.title,
        launch.handle,
        launch.product && launch.product.title,
        launch.product && launch.product.handle,
        String(launch.title || "").split(" - ")[0],
        String(launch.handle || "").replace(/-(soccer|baseball|softball|homeplate|home-plate|triangle|banner|banners|pennant).*$/i, "")
      ];
      const keys = [];
      raw.forEach((value) => {
        const key = stripLayerTerms(value);
        if (key.length < 3) return;
        keys.push(key);
        const withoutTrailingNumber = key.replace(/\s+\d+$/g, "").trim();
        if (withoutTrailingNumber.length >= 3) keys.push(withoutTrailingNumber);
      });
      return [...new Set(keys)];
    }

    function productLayerContext() {
      return [
        launch.title,
        launch.handle,
        launch.collections,
        launch.product && launch.product.title,
        launch.product && launch.product.handle,
        launch.product && launch.product.type,
        launch.product && launch.product.productCategory
      ]
        .filter(Boolean)
        .join(" ");
    }

    function sportForProduct() {
      const text = productLayerContext().toLowerCase();
      if (/\bbaseball\b/.test(text)) return "baseball";
      if (/\bsoftball\b/.test(text)) return "softball";
      if (/\bsoccer\b/.test(text)) return "soccer";
      return "";
    }

    function backgroundCategoryForProduct() {
      const text = productLayerContext().toLowerCase();
      if (/pole\s*pocket|polepocket|sleeve/.test(text)) return "BG Pole Pocket";
      return defaultCategoryForShape(ARTBOARD_SHAPE);
    }

    function assetMatchScore(asset, keys) {
      const cleanName = stripLayerTerms(asset.name);
      const rawName = layerMatchText(asset.name);
      if (!cleanName && !rawName) return 0;

      let best = 0;
      keys.forEach((key) => {
        const cleanKey = stripLayerTerms(key);
        if (!cleanKey) return;
        if (cleanName === cleanKey) {
          best = Math.max(best, 120);
          return;
        }
        if (rawName === cleanKey) best = Math.max(best, 110);
        if (cleanName.startsWith(`${cleanKey} `) || cleanKey.startsWith(`${cleanName} `)) best = Math.max(best, 96);
        if (rawName.includes(cleanKey) || cleanKey.includes(cleanName)) best = Math.max(best, 82);

        const assetTokens = new Set(cleanName.split(" ").filter(Boolean));
        const keyTokens = cleanKey.split(" ").filter(Boolean);
        const overlap = keyTokens.filter((token) => assetTokens.has(token)).length;
        if (keyTokens.length && overlap / keyTokens.length >= 0.75) {
          best = Math.max(best, 58 + overlap * 5);
        }
      });

      return best;
    }

    function numericLayerTokens(value) {
      return new Set((layerMatchText(value).match(/\b\d+\b/g) || []).map(String));
    }

    function findProductAsset(category, options = {}) {
      const keys = productLayerKeys();
      if (!keys.length && !options.fallbackSport) return null;
      let best = null;
      let bestScore = 0;
      const sport = sportForProduct();
      assets.forEach((asset) => {
        if (asset.category !== category) return;
        let score = assetMatchScore(asset, keys);
        if (sport && layerMatchText([asset.name, asset.url].join(" ")).includes(sport)) score += 8;
        if (score > bestScore) {
          best = asset;
          bestScore = score;
        }
      });
      if (bestScore >= (options.minimumScore || 72)) return best;

      if (options.fallbackSport) {
        if (sport) {
          const sportAsset = assets.find((asset) => (
            asset.category === category
            && layerMatchText([asset.name, asset.url].join(" ")).includes(sport)
          ));
          if (sportAsset) return sportAsset;
        }
      }

      return null;
    }

    function findProductBackgroundAsset(category) {
      const preferred = findProductAsset(category);
      if (preferred) return preferred;

      const keys = productLayerKeys();
      const productNumbers = new Set(keys.flatMap((key) => [...numericLayerTokens(key)]));
      let best = null;
      let bestScore = 0;
      assets.forEach((asset) => {
        if (!String(asset.category || "").startsWith("BG ")) return;
        const score = assetMatchScore(asset, keys);
        if (productNumbers.size) {
          const assetNumbers = numericLayerTokens(asset.name);
          const hasAllNumbers = [...productNumbers].every((num) => assetNumbers.has(num));
          if (!hasAllNumbers) return;
        }
        if (score > bestScore) {
          best = asset;
          bestScore = score;
        }
      });
      return bestScore >= 90 ? best : null;
    }

    function comparableAssetUrl(value) {
      const raw = String(value || "").trim();
      if (!raw) return "";
      try {
        const url = new URL(raw, window.location.href);
        url.hash = "";
        url.search = "";
        return url.href;
      } catch (error) {
        return raw.split("#")[0].split("?")[0];
      }
    }

    function findAssetBySourceId(sourceId) {
      const id = String(sourceId || "").trim();
      if (!id) return null;
      return assets.find((asset) => String(asset.sourceId || "") === id) || null;
    }

    function findAssetByUrl(url) {
      const target = comparableAssetUrl(url);
      if (!target) return null;
      return assets.find((asset) => (
        comparableAssetUrl(asset.url) === target
        || comparableAssetUrl(asset.svgUrl) === target
      )) || null;
    }

    function exactAssetFromLayerConfig(kind, category, config = currentLayerConfig()) {
      const key = kind === "teamName" ? "logo" : kind;
      const sourceId = config[`${key}AssetId`];
      const exactById = findAssetBySourceId(sourceId);
      if (exactById) return exactById;

      const url = config[`${key}Url`];
      const source = config[`${key}Source`];
      if (source !== "design-tool-asset" || !url) return null;
      const exactByUrl = findAssetByUrl(url);
      if (exactByUrl) return exactByUrl;

      return normalizeAsset({
        name: config[`${key}AssetName`] || config.logoTitle || category,
        category,
        url,
        svgUrl: config[`${key}SvgUrl`] || "",
        sourceId
      });
    }

    function resolveProductAssetSet() {
      const config = currentLayerConfig();
      const backgroundCategory = backgroundCategoryForProduct();
      return {
        backgroundCategory,
        background: exactAssetFromLayerConfig("background", backgroundCategory, config) || findProductBackgroundAsset(backgroundCategory),
        teamName: exactAssetFromLayerConfig("teamName", "Team name", config) || findProductAsset("Team name"),
        clipart: exactAssetFromLayerConfig("clipart", "Clip art", config) || findProductAsset("Clip art"),
        accessory: exactAssetFromLayerConfig("accessory", "Accessory", config) || findProductAsset("Accessory", { fallbackSport: true, minimumScore: 62 }),
        sport: sportForProduct()
      };
    }

    function hasExplicitAssetConfig(kind, config = currentLayerConfig()) {
      const key = kind === "teamName" ? "logo" : kind;
      const source = String(config[`${key}Source`] || "").toLowerCase();
      return Boolean(
        config[`${key}AssetId`]
        || config[`${key}AssetName`]
        || config[`${key}SvgUrl`]
        || config[`${key}SvgId`]
        || (source === "design-tool-asset" && config[`${key}Url`])
      );
    }

    function shouldUseLayerAsset(role, asset, config = currentLayerConfig()) {
      if (!asset || !asset.url) return false;
      if (role === "template-background") return hasExplicitAssetConfig("background", config);
      if (role === "template-team-name") return hasExplicitAssetConfig("teamName", config);
      if (role === "template-clipart" || role === "template-mascot") return hasExplicitAssetConfig("clipart", config);
      if (role === "template-player-icon") return hasExplicitAssetConfig("accessory", config);
      return false;
    }

    function shouldUseProductAssetObjects(assetSet, config = currentLayerConfig()) {
      return Boolean(assetSet && shouldUseLayerAsset("template-background", assetSet.background, config));
    }

    function usesProductImageFallback(config = currentLayerConfig()) {
      const backgroundSource = String(config.backgroundSource || "").toLowerCase();
      const layoutSource = String(config.layoutSource || "").toLowerCase();
      const matchStatus = String(config.assetMatchStatus || "").toLowerCase();
      return !hasExplicitAssetConfig("background", config)
        && (
          backgroundSource === "product-image"
          || layoutSource === "product-image-fallback"
          || matchStatus.includes("product-image")
        );
    }

    function productImageFallbackTextOpacity(value = 1, config = currentLayerConfig()) {
      return usesProductImageFallback(config) ? Math.min(value ?? 1, 0.01) : (value ?? 1);
    }

    function usesProductImageObjectFallback(config = currentLayerConfig()) {
      const layoutSource = String(config.layoutSource || "").toLowerCase();
      const matchStatus = String(config.assetMatchStatus || "").toLowerCase();
      return layoutSource === "product-image-object-fallback"
        || matchStatus === "product-image-object-fallback"
        || Boolean(config.objectLayerMode === "product-image-object-fallback");
    }

    function assetForLayerRole(role, assetSet = resolveProductAssetSet()) {
      if (role === "template-background") return assetSet.background;
      if (role === "template-team-name") return assetSet.teamName;
      if (role === "template-clipart" || role === "template-mascot") return assetSet.clipart;
      if (role === "template-player-icon") return assetSet.accessory;
      return null;
    }

    function assetMetadata(asset) {
      if (!asset || !asset.url) return {};
      return {
        sourceAssetName: asset.name || "",
        sourceAssetCategory: asset.category || "",
        sourceAssetUrl: asset.url,
        sourceAssetSvgUrl: asset.svgUrl || ""
      };
    }

    function roleMatchesCategory(role, category) {
      const categoryRole = categoryLayerRole(category);
      if (!role || !categoryRole) return false;
      if (role === categoryRole) return true;
      return (role === "template-mascot" && categoryRole === "template-clipart");
    }

    function isBackground(asset) {
      return asset.category && asset.category.indexOf("BG") === 0;
    }

    function assetMatchesCurrentBannerType(asset) {
      const category = normalizeAssetCategory(asset);
      return !isBackgroundCategory(category) || category === defaultCategoryForShape(ARTBOARD_SHAPE);
    }

    function visibleAssetPool() {
      return assets.filter(assetMatchesCurrentBannerType);
    }

    function isLayerLocked(obj) {
      return Boolean(obj && obj.data && obj.data.locked);
    }

    function setObjectLocked(obj, locked) {
      if (!obj || obj === guide) return;
      const data = { ...(obj.data || {}), locked: Boolean(locked) };
      obj.set({
        data,
        selectable: !locked,
        evented: !locked,
        lockMovementX: Boolean(locked),
        lockMovementY: Boolean(locked),
        lockScalingX: Boolean(locked),
        lockScalingY: Boolean(locked),
        lockRotation: Boolean(locked),
        hasControls: !locked,
        hasBorders: true
      });
      if (locked && canvas.getActiveObjects().includes(obj)) canvas.discardActiveObject();
    }

    function applyLayerLockStateToAll() {
      canvas.getObjects().forEach((obj) => {
        if (isLayerLocked(obj)) setObjectLocked(obj, true);
      });
    }

    function toggleLayerLock(obj) {
      if (!obj || obj === guide) return;
      const nextLocked = !isLayerLocked(obj);
      setObjectLocked(obj, nextLocked);
      if (!nextLocked) {
        canvas.setActiveObject(obj);
        obj.setCoords();
      }
      canvas.renderAll();
      saveHistory();
      updateSelectionControls();
      setStatus(`${layerLabel(obj)} ${nextLocked ? "locked" : "unlocked for editing"}.`);
    }

    function selectedObject() {
      const obj = canvas.getActiveObject();
      return obj && obj !== guide ? obj : null;
    }

    function setToolMode(mode) {
      activeTool = mode === "move" ? "move" : "select";
      canvas.isDrawingMode = false;
      canvas.selection = true;
      canvas.defaultCursor = activeTool === "move" ? "grab" : "default";
      canvas.hoverCursor = activeTool === "move" ? "move" : "move";
      canvas.moveCursor = "move";
      root.querySelectorAll("[data-tbd-tool]").forEach((button) => {
        const selected = button.dataset.tbdTool === activeTool;
        button.classList.toggle("is-active", selected);
        button.setAttribute("aria-pressed", selected ? "true" : "false");
      });
      setStatus(activeTool === "move" ? "Move tool active. Drag any unlocked layer." : "Select tool active.");
    }

    function activeEditableObjects() {
      return canvas.getActiveObjects().filter((obj) => obj && obj !== guide && !isLayerLocked(obj));
    }

    function clamp01(value, fallback) {
      const number = Number(value);
      if (!Number.isFinite(number)) return fallback;
      return Math.max(0, Math.min(1, number));
    }

    function isTemplateBackground(obj) {
      return Boolean(obj && obj.data && obj.data.role === "template-background");
    }

    function keepObjectInArtboard(obj, padding = 14) {
      if (!obj) return;
      obj.setCoords();
      const rect = obj.getBoundingRect(true, true);
      const bounds = artboardBounds();
      let dx = 0;
      let dy = 0;
      const leftLimit = bounds.left + padding;
      const topLimit = bounds.top + padding;
      const rightLimit = bounds.left + bounds.width - padding;
      const bottomLimit = bounds.top + bounds.height - padding;
      if (rect.left < leftLimit) dx = leftLimit - rect.left;
      if (rect.top < topLimit) dy = topLimit - rect.top;
      if (rect.left + rect.width > rightLimit) dx = rightLimit - rect.left - rect.width;
      if (rect.top + rect.height > bottomLimit) dy = bottomLimit - rect.top - rect.height;
      if (dx || dy) obj.set({ left: obj.left + dx, top: obj.top + dy });
      obj.setCoords();
    }

    function rectsOverlap(a, b, gap = 12) {
      return a.left < b.left + b.width + gap
        && a.left + a.width + gap > b.left
        && a.top < b.top + b.height + gap
        && a.top + a.height + gap > b.top;
    }

    function moveObjectBoundingBoxTo(obj, left, top) {
      obj.setCoords();
      const rect = obj.getBoundingRect(true, true);
      obj.set({ left: obj.left + left - rect.left, top: obj.top + top - rect.top });
      obj.setCoords();
    }

    function placeDuplicateClone(clone, source) {
      const padding = 18;
      const gap = 18;
      source.setCoords();
      clone.setCoords();
      const sourceRect = source.getBoundingRect(true, true);
      const cloneRect = clone.getBoundingRect(true, true);
      const width = Math.min(cloneRect.width, WIDTH - padding * 2);
      const height = Math.min(cloneRect.height, HEIGHT - padding * 2);
      const occupied = layerObjects()
        .filter((obj) => obj !== guide && obj !== clone)
        .map((obj) => obj.getBoundingRect(true, true));
      const candidates = [
        { left: sourceRect.left + sourceRect.width + gap, top: sourceRect.top },
        { left: sourceRect.left, top: sourceRect.top + sourceRect.height + gap },
        { left: sourceRect.left + gap, top: sourceRect.top + gap }
      ];

      for (let top = padding; top <= HEIGHT - height - padding; top += height + gap) {
        for (let left = padding; left <= WIDTH - width - padding; left += width + gap) {
          candidates.push({ left, top });
        }
      }

      const chosen = candidates.find((candidate) => {
        const rect = { left: candidate.left, top: candidate.top, width, height };
        return rect.left >= padding
          && rect.top >= padding
          && rect.left + rect.width <= WIDTH - padding
          && rect.top + rect.height <= HEIGHT - padding
          && !occupied.some((item) => rectsOverlap(rect, item, gap));
      }) || {
        left: Math.min(WIDTH - width - padding, Math.max(padding, sourceRect.left + gap)),
        top: Math.min(HEIGHT - height - padding, Math.max(padding, sourceRect.top + gap))
      };

      moveObjectBoundingBoxTo(clone, chosen.left, chosen.top);
      keepObjectInArtboard(clone, padding);
    }

    function saveHistory() {
      if (isRestoring) return;
      history = history.slice(0, historyIndex + 1);
      history.push(JSON.stringify(canvas.toJSON(["excludeFromExport", "data"])));
      if (history.length > 60) history.shift();
      historyIndex = history.length - 1;
      updateHistoryButtons();
    }

    function restoreHistory(nextIndex) {
      if (nextIndex < 0 || nextIndex >= history.length) return;
      isRestoring = true;
      canvas.loadFromJSON(history[nextIndex], () => {
        canvas.clipPath = makeClipPath();
        applyLayerLockStateToAll();
        canvas.renderAll();
        drawGuide();
        teamText = canvas.getObjects().find((obj) => obj.data && obj.data.role === "team-text") || null;
        historyIndex = nextIndex;
        isRestoring = false;
        updateSelectionControls();
        updateHistoryButtons();
      });
    }

    function updateHistoryButtons() {
      root.querySelector("[data-tbd-undo]")?.toggleAttribute("disabled", historyIndex <= 0);
      root.querySelector("[data-tbd-redo]")?.toggleAttribute("disabled", historyIndex >= history.length - 1);
    }

    function updateSelectionControls() {
      const obj = selectedObject();
      const isText = obj && obj.type === "i-text";
      if (els.selectedName) {
        els.selectedName.textContent = obj ? (obj.data && obj.data.name) || obj.type : "Nothing selected";
      }
      setControls(els.fills, colorValue(obj && obj.fill, "#ffffff"));
      setControls(els.strokes, colorValue(obj && obj.stroke, "#000000"));
      setControls(els.opacities, obj ? Math.round((obj.opacity ?? 1) * 100) : 100);
      setControls(els.opacityValues, cleanNumber(obj ? (obj.opacity ?? 1) : 1));
      setControls(els.strokeWidths, cleanNumber(obj ? (obj.strokeWidth ?? 0.5) : 0.5));
      setControls(els.strokeOpacities, cleanNumber(obj && obj.data ? (obj.data.strokeOpacity ?? 1) : 1));
      setControls(els.sizes, isText ? Math.round(obj.fontSize || 18) : 18);
      setControls(els.angles, cleanNumber(obj ? (obj.angle || 0) : 0));
      setControls(els.angleValues, cleanNumber(obj ? (obj.angle || 0) : 0));
      setControls(els.charSpacings, isText ? Math.round(obj.charSpacing || 0) : 0);
      setControls(els.lineHeights, isText ? cleanNumber(obj.lineHeight || 1) : 1);
      if (els.angle) els.angle.value = obj ? Math.round(obj.angle || 0) : 0;
      if (els.textContent && isText && document.activeElement !== els.textContent) els.textContent.value = obj.text || "Player";
      if (els.mobileTextInput && document.activeElement !== els.mobileTextInput) {
        els.mobileTextInput.value = isText ? (obj.text || "") : "";
      }
      if (els.mobileTextEdit) els.mobileTextEdit.hidden = !isText;
      root.classList.toggle("tbd--mobile-text-active", Boolean(isText));
      if (els.fontFamily && isText) {
        const family = String(obj.fontFamily || "");
        els.fontFamily.value = family.includes("Impact")
          ? "Impact, Arial Black, Arial, sans-serif"
          : family.includes("Georgia")
            ? "Georgia, serif"
            : family.includes("Arial Black")
              ? "Arial Black, Arial, sans-serif"
              : "Arial, sans-serif";
      }
      els.textAlignButtons.forEach((button) => {
        const active = Boolean(isText && (obj.textAlign || "center") === button.dataset.tbdTextAlign);
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", active ? "true" : "false");
      });
      els.textStyleButtons.forEach((button) => {
        const style = button.dataset.tbdTextStyle;
        const active = Boolean(isText && (
          (style === "bold" && (Number(obj.fontWeight) >= 700 || obj.fontWeight === "bold"))
          || (style === "italic" && obj.fontStyle === "italic")
          || (style === "underline" && obj.underline)
        ));
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", active ? "true" : "false");
      });
      renderLayerList();
    }

    function layerObjects() {
      return canvas.getObjects().filter((obj) => obj !== guide && !(obj.data && obj.data.role === "cut-guide"));
    }

    function visibleLayerObjects() {
      return layerObjects().filter((obj) => !(obj.data && obj.data.excludeFromLayerList));
    }

    function layerRole(obj) {
      if (!obj || !obj.data) return obj && obj.type === "i-text" ? "text-layer" : "object-layer";
      return obj.data.role || categoryLayerRole(obj.data.category) || (obj.type === "i-text" ? "text-layer" : "object-layer");
    }

    function layerNumberSuffix(obj) {
      const text = String((obj && obj.data && obj.data.name) || "");
      const match = text.match(/\b(\d+)\b$/);
      return match ? ` ${match[1]}` : "";
    }

    function categoryLayerRole(category) {
      const normalized = String(category || "").toLowerCase();
      if (normalized === "team name") return "template-team-name";
      if (normalized === "clip art") return "template-clipart";
      if (normalized === "accessory") return "template-player-icon";
      if (normalized.startsWith("bg ")) return "template-background";
      return "";
    }

    function layerLabel(obj) {
      if (!obj) return "Layer";
      const role = layerRole(obj);
      if (role === "template-background") return "Background";
      if (role === "template-team-name" || role === "team-text") return "Team name / logo";
      if (role === "template-clipart" || role === "template-mascot") return "Clip art";
      if (role === "template-player-icon") return `Accessory / Player icon${layerNumberSuffix(obj)}`;
      if (role === "template-player-text") return `Player text${layerNumberSuffix(obj)}`;
      if (role === "template-year-text") return "Year text";
      if (role === "svg-layout-guide") return "SVG layout guide";
      if (role === "magic-object-layer") return `Magic object${layerNumberSuffix(obj)}`;
      if (role === "custom-text-layer") return "Text";
      if (obj.type === "i-text" && obj.text) return obj.text;
      if (obj.data && obj.data.name) return obj.data.name.replace(/^.* layer /, "Layer ");
      return obj.type || "Layer";
    }

    function layerThumb(obj) {
      if (obj && obj.type === "i-text") {
        const text = String(obj.text || "T").slice(0, 8);
        return `<span class="tbd__layer-text">${escapeHtml(text)}</span>`;
      }
      if (obj && obj.data && obj.data.sourceAssetUrl) {
        const alt = escapeHtml(obj.data.sourceAssetName || layerLabel(obj));
        return `<img src="${escapeHtml(canvasSafeImageUrl(obj.data.sourceAssetUrl, imageProxyEndpoint))}" alt="${alt}">`;
      }
      let previousOpacity = 1;
      let showHiddenOverlay = false;
      try {
        previousOpacity = Number(obj.opacity);
        showHiddenOverlay = Number.isFinite(previousOpacity) && previousOpacity < 0.05;
        if (showHiddenOverlay) obj.set("opacity", 1);
        const dataUrl = obj.toDataURL({ format: "png", multiplier: 0.18 });
        if (showHiddenOverlay) obj.set("opacity", previousOpacity);
        return `<img src="${dataUrl}" alt="">`;
      } catch (error) {
        if (showHiddenOverlay) obj.set("opacity", previousOpacity);
        if (obj && obj.data && Array.isArray(obj.data.color)) {
          const [r, g, b] = obj.data.color;
          return `<span class="tbd__layer-swatch" style="background: rgb(${r}, ${g}, ${b})"></span>`;
        }
        return `<span class="tbd__layer-swatch tbd__layer-swatch--empty"></span>`;
      }
    }

    function escapeHtml(value) {
      return String(value).replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "\"": "&quot;",
        "'": "&#39;"
      })[char]);
    }

    function renderLayerList() {
      if (!els.layerLists.length) return;
      const active = selectedObject();
      const objects = visibleLayerObjects();
      els.layerLists.forEach((layerList) => {
        layerList.innerHTML = "";
        objects.slice().reverse().forEach((obj, reverseIndex) => {
          const index = objects.length - reverseIndex;
          const locked = isLayerLocked(obj);
          const label = layerLabel(obj);
          const row = document.createElement("div");
          row.className = "tbd__layer-row";
          row.toggleAttribute("aria-current", active === obj);
          row.classList.toggle("is-locked", locked);
          row.setAttribute("role", "button");
          row.setAttribute("tabindex", "0");
          row.setAttribute("aria-label", `${label}${locked ? " locked" : " editable"}`);
          row.dataset.layerRole = layerRole(obj);
          row.dataset.layerSource = obj && obj.data && obj.data.sourceAssetUrl ? "asset" : (obj && obj.data && obj.data.cropSource) || "";
          row.dataset.layerAssetName = (obj && obj.data && obj.data.sourceAssetName) || "";
          row.dataset.tbdLayerRow = "true";
          row.dataset.layerId = ensureLayerId(obj);
          row.dataset.tooltip = label;
          row.draggable = !locked;
          const escapedLabel = escapeHtml(label);
          row.innerHTML = `
            <span class="tbd__layer-index">${index}</span>
            <span class="tbd__layer-thumb">${layerThumb(obj)}</span>
            <span class="tbd__layer-name">${escapedLabel}</span>
            <button class="tbd__lock" type="button" aria-label="${locked ? `Unlock ${escapedLabel}` : `Lock ${escapedLabel}`}" data-tooltip="${locked ? "Unlock layer" : "Lock layer"}"></button>
          `;
          const selectLayer = () => {
            if (isLayerLocked(obj)) {
              setStatus(`${layerLabel(obj)} is locked. Unlock it to edit.`);
              renderLayerList();
              return;
            }
            canvas.setActiveObject(obj);
            canvas.renderAll();
            updateSelectionControls();
            if (window.matchMedia("(max-width: 720px)").matches && layerList.classList.contains("tbd__layer-list--drawer")) {
              togglePanel("");
            }
          };
          row.addEventListener("click", (event) => {
            if (event.target.closest(".tbd__lock")) return;
            selectLayer();
          });
          row.addEventListener("keydown", (event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            selectLayer();
          });
          row.addEventListener("dragstart", (event) => {
            if (isLayerLocked(obj)) {
              event.preventDefault();
              return;
            }
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("application/x-team-banner-layer", ensureLayerId(obj));
          });
          row.addEventListener("dragover", (event) => {
            if (!Array.from(event.dataTransfer.types || []).includes("application/x-team-banner-layer")) return;
            event.preventDefault();
            row.classList.add("is-drop-target");
          });
          row.addEventListener("dragleave", () => row.classList.remove("is-drop-target"));
          row.addEventListener("drop", (event) => {
            const layerId = event.dataTransfer.getData("application/x-team-banner-layer");
            if (!layerId) return;
            event.preventDefault();
            row.classList.remove("is-drop-target");
            reorderLayerById(layerId, ensureLayerId(obj));
          });
          row.querySelector(".tbd__lock")?.addEventListener("click", (event) => {
            event.stopPropagation();
            toggleLayerLock(obj);
          });
          layerList.appendChild(row);
        });
      });
    }

    function findLayerById(layerId) {
      if (!layerId) return null;
      return layerObjects().find((obj) => ensureLayerId(obj) === layerId) || null;
    }

    function reorderLayerById(sourceId, targetId) {
      const source = findLayerById(sourceId);
      const target = findLayerById(targetId);
      if (!source || !target || source === target) return;
      if (isLayerLocked(source)) {
        setStatus(`${layerLabel(source)} is locked. Unlock it before arranging.`);
        return;
      }
      const targetIndex = canvas.getObjects().indexOf(target);
      if (targetIndex < 0) return;
      source.moveTo(targetIndex + 1);
      keepGuideOnTop();
      canvas.setActiveObject(source);
      canvas.renderAll();
      saveHistory();
      updateSelectionControls();
      setStatus(`${layerLabel(source)} moved above ${layerLabel(target)}.`);
    }

    function setControls(controls, value) {
      controls.forEach((control) => {
        if (document.activeElement !== control) control.value = value;
      });
    }

    function cleanNumber(value) {
      const number = Number(value);
      if (!Number.isFinite(number)) return "0";
      return Number(number.toFixed(2)).toString();
    }

    function controlValue(controls, fallback) {
      const control = controls.find((item) => item && item.value !== "");
      return control ? control.value : fallback;
    }

    function colorValue(value, fallback) {
      return typeof value === "string" && value.charAt(0) === "#" ? value : fallback;
    }

    function applySelection(updates) {
      const obj = selectedObject();
      if (!obj) {
        setStatus("Select an item on the canvas first.");
        return;
      }
      if (isLayerLocked(obj)) {
        setStatus(`${layerLabel(obj)} is locked. Unlock it to edit.`);
        return;
      }
      obj.set(updates);
      canvas.renderAll();
      saveHistory();
      updateSelectionControls();
    }

    function normalizeAngle(value) {
      const number = Number(value) || 0;
      return ((number + 180) % 360 + 360) % 360 - 180;
    }

    function setSelectedAngle(value, options = {}) {
      const obj = selectedObject();
      if (!obj) return setStatus("Select a layer first.");
      if (isLayerLocked(obj)) return setStatus(`${layerLabel(obj)} is locked. Unlock it to rotate.`);
      const angle = normalizeAngle(value);
      obj.set({ angle });
      obj.setCoords();
      keepObjectInArtboard(obj, 6);
      keepGuideOnTop();
      canvas.requestRenderAll();
      if (options.save !== false) saveHistory();
      updateSelectionControls();
      if (!options.quiet) setStatus(`Rotated to ${Math.round(angle)} degrees.`);
    }

    function rotateSelected(delta) {
      const obj = selectedObject();
      if (!obj) return setStatus("Select a layer first.");
      setSelectedAngle((Number(obj.angle) || 0) + (Number(delta) || 0));
    }

    function applyTextSelection(updates) {
      const obj = selectedObject();
      if (!obj || obj.type !== "i-text") return setStatus("Select a text layer first.");
      if (isLayerLocked(obj)) return setStatus(`${layerLabel(obj)} is locked. Unlock it to edit text.`);
      obj.set(updates);
      obj.setCoords();
      canvas.renderAll();
      saveHistory();
      updateSelectionControls();
    }

    function toggleTextStyle(style) {
      const obj = selectedObject();
      if (!obj || obj.type !== "i-text") return setStatus("Select a text layer first.");
      if (style === "bold") {
        applyTextSelection({ fontWeight: Number(obj.fontWeight) >= 700 || obj.fontWeight === "bold" ? 400 : 900 });
      } else if (style === "italic") {
        applyTextSelection({ fontStyle: obj.fontStyle === "italic" ? "normal" : "italic" });
      } else if (style === "underline") {
        applyTextSelection({ underline: !obj.underline });
      }
    }

    function supportsGradientFill(obj) {
      return Boolean(obj && ["i-text", "text", "textbox", "rect", "circle", "polygon", "path"].includes(obj.type));
    }

    function updateGradientBar() {
      if (!els.gradientBar) return;
      const start = (els.gradientStart && els.gradientStart.value) || "#ff1010";
      const end = (els.gradientEnd && els.gradientEnd.value) || "#ffff00";
      const startPos = `${Math.round(gradientStopOffsets.start * 100)}%`;
      const endPos = `${Math.round(gradientStopOffsets.end * 100)}%`;
      els.gradientBar.style.setProperty("--tbd-gradient-start", start);
      els.gradientBar.style.setProperty("--tbd-gradient-end", end);
      els.gradientBar.style.setProperty("--tbd-gradient-start-pos", startPos);
      els.gradientBar.style.setProperty("--tbd-gradient-end-pos", endPos);
      els.gradientBar.setAttribute("aria-valuetext", `${startPos} to ${endPos}`);
    }

    function gradientColorStops(start, end) {
      const startOffset = clamp01(gradientStopOffsets.start, 0);
      const endOffset = Math.max(startOffset + 0.02, clamp01(gradientStopOffsets.end, 1));
      const stops = [
        { offset: 0, color: start },
        { offset: startOffset, color: start },
        { offset: endOffset, color: end },
        { offset: 1, color: end }
      ];
      return stops.filter((stop, index) => index === 0 || Math.abs(stop.offset - stops[index - 1].offset) > 0.001);
    }

    function applyGradientToSelection(options = {}) {
      const obj = selectedObject();
      if (!obj) return setStatus("Select a text or shape layer first.");
      if (isLayerLocked(obj)) return setStatus(`${layerLabel(obj)} is locked. Unlock it to edit.`);
      if (!supportsGradientFill(obj)) return setStatus("Gradient works on text and shape layers.");

      updateGradientBar();
      const type = (els.gradientType && els.gradientType.value) || "linear";
      const start = (els.gradientStart && els.gradientStart.value) || "#ff1010";
      const end = (els.gradientEnd && els.gradientEnd.value) || "#ffff00";
      const x1 = clamp01(els.gradientX1 && els.gradientX1.value, 0);
      const y1 = clamp01(els.gradientY1 && els.gradientY1.value, 0);
      const x2 = clamp01(els.gradientX2 && els.gradientX2.value, 1);
      const y2 = clamp01(els.gradientY2 && els.gradientY2.value, 0);
      const coords = type === "radial"
        ? { x1: 0.5, y1: 0.5, r1: 0, x2: 0.5, y2: 0.5, r2: 0.72 }
        : { x1, y1, x2, y2 };

      obj.set("fill", new fabric.Gradient({
        type,
        gradientUnits: "percentage",
        coords,
        colorStops: gradientColorStops(start, end)
      }));
      canvas.renderAll();
      if (!options.preview) saveHistory();
      if (!options.skipControls) updateSelectionControls();
      if (!options.quiet) setStatus("Gradient applied.");
    }

    function setGradientStop(stopName, offset, options = {}) {
      const stop = stopName === "start" ? "start" : "end";
      const next = clamp01(offset, stop === "start" ? 0 : 1);
      if (stop === "start") {
        gradientStopOffsets.start = Math.min(next, gradientStopOffsets.end - 0.02);
      } else {
        gradientStopOffsets.end = Math.max(next, gradientStopOffsets.start + 0.02);
      }
      updateGradientBar();
      applyGradientToSelection({ preview: options.preview, quiet: options.quiet, skipControls: true });
    }

    function setGradientStopFromPointer(event, stopName, options = {}) {
      if (!els.gradientBar) return;
      const rect = els.gradientBar.getBoundingClientRect();
      const offset = rect.width ? (event.clientX - rect.left) / rect.width : 0;
      setGradientStop(stopName, offset, options);
    }

    function nearestGradientStop(event) {
      if (!els.gradientBar) return "end";
      const rect = els.gradientBar.getBoundingClientRect();
      const offset = rect.width ? clamp01((event.clientX - rect.left) / rect.width, 0.5) : 0.5;
      return Math.abs(offset - gradientStopOffsets.start) <= Math.abs(offset - gradientStopOffsets.end) ? "start" : "end";
    }

    function placeSelectedBackground(mode) {
      const obj = selectedObject();
      if (!isTemplateBackground(obj)) return setStatus("Select the background layer first.");
      if (isLayerLocked(obj)) return setStatus("Unlock the background layer before adjusting it.");

      const bounds = artboardBounds();
      const scale = mode === "fit"
        ? fitImageToArtboard(obj.width, obj.height, "contain").scaleX
        : mode === "fill"
          ? fitImageToArtboard(obj.width, obj.height, "cover").scaleX
          : obj.scaleX || 1;
      obj.set({
        scaleX: scale,
        scaleY: scale,
        left: bounds.left + (bounds.width - obj.width * scale) / 2,
        top: bounds.top + (bounds.height - obj.height * scale) / 2
      });
      obj.setCoords();
      canvas.renderAll();
      saveHistory();
      updateSelectionControls();
      setStatus(`Background ${mode === "center" ? "centered" : mode}.`);
    }

    function addTeamText() {
      const textValue = (els.team && els.team.value.trim()) || "TEAM NAME";
      if (teamText && canvas.getObjects().includes(teamText)) {
        teamText.set({ text: textValue });
        canvas.setActiveObject(teamText);
        canvas.renderAll();
        saveHistory();
        updateSelectionControls();
        return;
      }

      const point = recipePoint(0.5, isRectangularShape(ARTBOARD_SHAPE) ? 0.12 : 0.26);
      teamText = new fabric.IText(textValue, {
        left: point.left,
        top: point.top,
        originX: "center",
        fill: (els.fill && els.fill.value) || "#d71920",
        fontFamily: "Arial Black, Arial, sans-serif",
        fontSize: isRectangularShape(ARTBOARD_SHAPE) ? 54 : 78,
        stroke: "#ffffff",
        strokeWidth: 5,
        paintFirst: "stroke",
        textAlign: "center",
        data: { role: "team-text", name: "Team name" }
      });
      canvas.add(teamText);
      keepObjectInArtboard(teamText, 6);
      canvas.setActiveObject(teamText);
      keepGuideOnTop();
      canvas.renderAll();
      saveHistory();
      updateSelectionControls();
    }

    function addShape(type) {
      const point = recipePoint(0.5, 0.5);
      const common = {
        left: point.left,
        top: point.top,
        originX: "center",
        originY: "center",
        fill: "transparent",
        stroke: (els.stroke && els.stroke.value) || "#ffffff",
        strokeWidth: 5,
        data: { name: type === "circle" ? "Circle" : "Rectangle" }
      };
      const shape = type === "circle"
        ? new fabric.Circle({ ...common, radius: 70 })
        : new fabric.Rect({ ...common, width: 160, height: 110, rx: 6, ry: 6 });
      canvas.add(shape);
      keepObjectInArtboard(shape, 6);
      canvas.setActiveObject(shape);
      keepGuideOnTop();
      canvas.renderAll();
      saveHistory();
      updateSelectionControls();
    }

    function canvasPointFromClient(clientX, clientY) {
      const element = canvas.upperCanvasEl || canvas.lowerCanvasEl || canvasEl;
      const rect = element.getBoundingClientRect();
      return {
        x: clamp01((clientX - rect.left) / Math.max(1, rect.width), 0.5) * WIDTH,
        y: clamp01((clientY - rect.top) / Math.max(1, rect.height), 0.5) * HEIGHT
      };
    }

    function isPointInsideStage(clientX, clientY) {
      const rect = els.stage.getBoundingClientRect();
      return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
    }

    function replacementTargetForAsset(asset, point) {
      const categoryRole = categoryLayerRole(asset.category);
      if (!categoryRole || categoryRole === "template-background") return null;

      const active = selectedObject();
      if (active && roleMatchesCategory(layerRole(active), asset.category) && !isLayerLocked(active)) return active;

      const fabricPoint = new fabric.Point(point.x, point.y);
      return visibleLayerObjects()
        .slice()
        .reverse()
        .find((obj) => {
          if (isLayerLocked(obj)) return false;
          if (!roleMatchesCategory(layerRole(obj), asset.category)) return false;
          obj.setCoords();
          return obj.containsPoint(fabricPoint);
        }) || null;
    }

    function addAsset(asset, options = {}) {
      const item = normalizeAsset(asset);
      if (!item.url) return;
      const restoreTokenAtRequest = projectRestoreToken;
      setStatus(`Loading ${item.name}...`);
      fabric.Image.fromURL(
        canvasSafeImageUrl(item.url, imageProxyEndpoint),
        (img) => {
          if (restoreTokenAtRequest !== projectRestoreToken) return;
          if (!img) {
            setStatus("Could not load that asset.");
            return;
          }
          img.set({
            crossOrigin: "anonymous",
            data: { name: item.name, category: item.category, sourceUrl: item.url, role: categoryLayerRole(item.category) }
          });

          if (isBackground(item)) {
            canvas.getObjects()
              .filter((obj) => obj.data && obj.data.role === "template-background")
              .forEach((obj) => canvas.remove(obj));
            canvas.setBackgroundImage(null, () => {});
            const placement = fitImageToArtboard(img.width || WIDTH, img.height || HEIGHT, backgroundFitMode());
            img.set({
              left: placement.left,
              top: placement.top,
              scaleX: placement.scaleX,
              scaleY: placement.scaleY,
              selectable: false,
              evented: false,
              data: { ...assetMetadata(item), name: item.name, category: item.category, role: "template-background", locked: true }
            });
            ensureLayerId(img);
            canvas.add(img);
            img.sendToBack();
            setObjectLocked(img, true);
            keepGuideOnTop();
            canvas.renderAll();
            saveHistory();
            updateSelectionControls();
            setStatus(`${item.name} set as background.`);
            return;
          }

          const replaceTarget = options.replaceTarget && !isLayerLocked(options.replaceTarget)
            ? options.replaceTarget
            : null;
          if (replaceTarget) {
            const targetIndex = canvas.getObjects().indexOf(replaceTarget);
            const targetWidth = Math.max(18, replaceTarget.getScaledWidth ? replaceTarget.getScaledWidth() : WIDTH * 0.18);
            const targetHeight = Math.max(18, replaceTarget.getScaledHeight ? replaceTarget.getScaledHeight() : HEIGHT * 0.18);
            img.scaleToWidth(targetWidth);
            if (targetHeight && img.getScaledHeight() > targetHeight) img.scaleToHeight(targetHeight);
            img.set({
              left: replaceTarget.left,
              top: replaceTarget.top,
              originX: replaceTarget.originX || "center",
              originY: replaceTarget.originY || "center",
              angle: replaceTarget.angle || 0,
              opacity: 1,
              data: {
                ...(replaceTarget.data || {}),
                ...assetMetadata(item),
                name: (replaceTarget.data && replaceTarget.data.name) || item.name,
                category: item.category,
                role: layerRole(replaceTarget),
                sourceUrl: item.url
              }
            });
            ensureLayerId(img);
            canvas.remove(replaceTarget);
            canvas.add(img);
            if (targetIndex >= 0) img.moveTo(targetIndex);
          } else {
            const maxWidth = item.category === "Team name" ? artboardRatioWidth(0.55) : artboardRatioWidth(0.34);
            img.scaleToWidth(options.width || maxWidth);
            img.set({
              left: options.left ?? recipePoint(0.5, 0.5).left,
              top: options.top ?? recipePoint(0.5, 0.5).top,
              originX: "center",
              originY: "center",
              data: { ...assetMetadata(item), name: item.name, category: item.category, sourceUrl: item.url, role: categoryLayerRole(item.category) }
            });
            ensureLayerId(img);
            canvas.add(img);
            keepObjectInArtboard(img);
          }
          canvas.setActiveObject(img);
          keepGuideOnTop();
          canvas.renderAll();
          saveHistory();
          updateSelectionControls();
          setStatus(replaceTarget ? `${layerLabel(img)} replaced with ${item.name}.` : `${item.name} added.`);
        },
        { crossOrigin: "anonymous" }
      );
    }

    function addDroppedAsset(asset, clientX, clientY) {
      if (!els.stage || !isPointInsideStage(clientX, clientY)) {
        setStatus("Drop the asset on the banner area.");
        return;
      }
      const point = canvasPointFromClient(clientX, clientY);
      addAsset(asset, {
        left: point.x,
        top: point.y,
        replaceTarget: replacementTargetForAsset(normalizeAsset(asset), point)
      });
    }

    function renderCategories() {
      if (!els.categories) return;
      const availableAssets = visibleAssetPool();
      const counts = availableAssets.reduce((acc, asset) => {
        const category = normalizeAssetCategory(asset) || "Other";
        acc[category] = (acc[category] || 0) + 1;
        acc.All += 1;
        return acc;
      }, { All: 0 });
      const categories = CATEGORY_ORDER.filter((category) => category === "All" || counts[category]);
      if (!categories.includes(activeCategory)) {
        const preferredCategory = defaultCategoryForShape(ARTBOARD_SHAPE);
        activeCategory = categories.includes(preferredCategory) ? preferredCategory : categories[0] || "All";
      }
      els.categories.innerHTML = "";
      if (els.categorySelect) {
        els.categorySelect.innerHTML = "";
        categories.forEach((category) => {
          const option = document.createElement("option");
          option.value = category;
          option.textContent = categoryLabel(category);
          els.categorySelect.appendChild(option);
        });
        els.categorySelect.value = activeCategory;
      }
      categories.forEach((category) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "tbd__tab";
        button.textContent = `${categoryLabel(category)} (${counts[category] || 0})`;
        button.setAttribute("aria-pressed", String(category === activeCategory));
        button.addEventListener("click", () => {
          activeCategory = category;
          assetPage = 1;
          renderCategories();
          renderAssets();
        });
        els.categories.appendChild(button);
      });
    }

    function pagerPages(totalPages) {
      if (totalPages <= 8) return Array.from({ length: totalPages }, (_, index) => index + 1);
      const pages = [1, 2, 3, 4, 5];
      const windowStart = Math.max(6, assetPage - 1);
      const windowEnd = Math.min(totalPages - 1, assetPage + 1);
      if (windowStart > 6) pages.push("...");
      for (let page = windowStart; page <= windowEnd; page += 1) {
        if (!pages.includes(page)) pages.push(page);
      }
      const numericPages = pages.filter((page) => typeof page === "number");
      const lastPage = numericPages[numericPages.length - 1] || 1;
      if (lastPage < totalPages - 1) pages.push("...");
      if (!pages.includes(totalPages)) pages.push(totalPages);
      return [...new Set(pages)].filter((page, index, list) => page !== "..." || list[index - 1] !== "...");
    }

    function renderAssetPager(totalPages) {
      if (!els.assetPager) return;
      els.assetPager.innerHTML = "";
      if (totalPages <= 1) return;
      const appendPageButton = (page, label = String(page), ariaLabel = `Page ${page}`) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = label;
        button.className = "tbd__pager-button";
        button.setAttribute("aria-label", ariaLabel);
        button.toggleAttribute("aria-current", page === assetPage);
        button.addEventListener("click", () => {
          assetPage = page;
          renderAssets();
        });
        els.assetPager.appendChild(button);
      };
      if (assetPage > 1) appendPageButton(assetPage - 1, "‹", "Previous asset page");
      pagerPages(totalPages).forEach((page) => {
        if (page === "...") {
          const span = document.createElement("span");
          span.textContent = "...";
          els.assetPager.appendChild(span);
          return;
        }
        appendPageButton(page);
      });
      if (assetPage < totalPages) appendPageButton(assetPage + 1, "›", "Next asset page");
    }

    function renderAssets() {
      if (!els.assets) return;
      const filtered = visibleAssetPool()
        .filter((asset) => activeCategory === "All" || asset.category === activeCategory)
        .filter((asset) => asset.name.toLowerCase().includes(searchTerm));
      els.assets.innerHTML = "";
      const totalPages = Math.max(1, Math.ceil(filtered.length / ASSETS_PER_PAGE));
      assetPage = Math.max(1, Math.min(assetPage, totalPages));
      const start = (assetPage - 1) * ASSETS_PER_PAGE;
      const visible = filtered.slice(start, start + ASSETS_PER_PAGE);
      visible.forEach((asset) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "tbd__asset";
        button.classList.toggle("tbd__asset--background", isBackground(asset));
        button.classList.toggle("tbd__asset--art", !isBackground(asset));
        button.dataset.category = asset.category || "Other";
        button.title = asset.name;
        button.draggable = true;
        button.innerHTML = `<img loading="lazy" alt="${asset.name.replace(/"/g, "&quot;")}" src="${asset.url}"><span>${asset.name}</span>`;
        button.addEventListener("click", (event) => {
          if (suppressAssetClick) {
            event.preventDefault();
            suppressAssetClick = false;
            return;
          }
          addAsset(asset);
        });
        button.addEventListener("dragstart", (event) => {
          event.dataTransfer.effectAllowed = "copy";
          const payload = JSON.stringify(asset);
          event.dataTransfer.setData("application/x-team-banner-asset", payload);
          event.dataTransfer.setData("text/plain", payload);
        });
        button.addEventListener("pointerdown", (event) => {
          if (event.pointerType === "mouse" || event.button !== 0) return;
          assetDragState = {
            asset,
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            x: event.clientX,
            y: event.clientY,
            button,
            ghost: null,
            dragging: false
          };
        }, { passive: true });
        els.assets.appendChild(button);
      });
      if (els.assetCount) {
        const shownStart = filtered.length ? start + 1 : 0;
        const shownEnd = Math.min(start + visible.length, filtered.length);
        els.assetCount.textContent = `${shownStart}-${shownEnd} of ${filtered.length} assets`;
      }
      renderAssetPager(totalPages);
    }

    function templateTypeLabel(type) {
      if (type === "polepocket") return "Pole Pocket";
      if (type === "triangle") return "Triangle Banner";
      if (type === "homeplatepennant" || type === "homeplate") return "Home Plate Banner";
      return "Hem Banner";
    }

    function templateSportLabel(sport) {
      if (sport === "baseball") return "Baseball";
      if (sport === "softball") return "Softball";
      if (sport === "soccer") return "Soccer";
      return "All sports";
    }

    function productSport(product) {
      const text = [product.title, product.handle, product.type, product.tags, product.productCategory]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (/\bbaseball\b/.test(text)) return "baseball";
      if (/\bsoftball\b/.test(text)) return "softball";
      if (/\bsoccer\b/.test(text)) return "soccer";
      return "other";
    }

    function productTemplateType(product) {
      const source = [
        product.shape,
        product.type,
        product.title,
        product.handle,
        product.tags
      ].filter(Boolean).join(" ");
      const shape = normalizeShape(source, Boolean(product.image || product.templateSvg));
      if (shape === "polepocket") return "polepocket";
      if (shape === "triangle") return "triangle";
      if (isHomePlateShape(shape)) return "homeplatepennant";
      return "rectangle";
    }

    function normalizeTemplateProduct(product) {
      if (!product || !product.image) return null;
      const title = product.title || product.handle || "Banner template";
      const handle = product.handle || titleSlug(title);
      const type = productTemplateType(product);
      const sport = productSport(product);
      return {
        key: `${handle}-${type}`,
        handle,
        title,
        image: resolveSourceUrl(product.image),
        price: product.price || "",
        type,
        sport,
        product
      };
    }

    function templateMatchesSearch(template) {
      if (!templateSearchTerm) return true;
      return [template.title, template.handle, templateSportLabel(template.sport), templateTypeLabel(template.type)]
        .join(" ")
        .toLowerCase()
        .includes(templateSearchTerm);
    }

    function matchingTemplateProducts() {
      return templateProducts
        .filter((template) => templateSportFilter === "all" || template.sport === templateSportFilter)
        .filter((template) => templateTypeFilter === "all" || template.type === templateTypeFilter)
        .filter(templateMatchesSearch)
        .slice(0, 160);
    }

    function filteredTemplateProducts() {
      const matches = matchingTemplateProducts();
      const pageCount = Math.max(1, Math.ceil(matches.length / TEMPLATE_PAGE_SIZE));
      templatePage = Math.max(1, Math.min(templatePage, pageCount));
      const start = (templatePage - 1) * TEMPLATE_PAGE_SIZE;
      return matches.slice(start, start + TEMPLATE_PAGE_SIZE);
    }

    function renderTemplatePager(total) {
      if (!els.templatePager) return;
      const pageCount = Math.max(1, Math.ceil(total / TEMPLATE_PAGE_SIZE));
      els.templatePager.innerHTML = "";
      if (pageCount <= 1) return;
      const makeButton = (label, page, disabled = false) => {
        const button = document.createElement("button");
        button.className = "tbd__template-page-button";
        button.type = "button";
        button.textContent = label;
        button.disabled = disabled;
        button.addEventListener("click", () => {
          templatePage = Math.max(1, Math.min(page, pageCount));
          renderTemplates();
          els.templateTrack?.scrollTo({ top: 0, left: 0, behavior: "smooth" });
        });
        return button;
      };
      els.templatePager.append(
        makeButton("Prev", templatePage - 1, templatePage <= 1),
        Object.assign(document.createElement("span"), {
          className: "tbd__template-page-status",
          textContent: `${templatePage} / ${pageCount}`
        }),
        makeButton("Next", templatePage + 1, templatePage >= pageCount)
      );
    }

    function scrollTemplateWorkflow(value) {
      const target = value === "preview"
        ? els.templatePreview
        : value === "library"
          ? els.templateTrack
          : els.templateGenerator;
      target?.scrollIntoView({ block: "start", behavior: "smooth" });
    }

    function selectTemplate(template, options = {}) {
      selectedTemplate = template || null;
      if (els.templatePreviewImage) {
        els.templatePreviewImage.src = selectedTemplate ? selectedTemplate.image : "";
        els.templatePreviewImage.alt = selectedTemplate ? `${selectedTemplate.title} preview` : "Selected banner template preview";
      }
      if (els.templatePreviewTitle) els.templatePreviewTitle.textContent = selectedTemplate ? selectedTemplate.title : "Choose a template";
      if (els.templatePreviewMeta) {
        els.templatePreviewMeta.textContent = selectedTemplate
          ? `${templateTypeLabel(selectedTemplate.type)} · ${templateSportLabel(selectedTemplate.sport)}`
          : "Scroll manually or turn on auto scroll.";
      }
      if (els.templateDesign) els.templateDesign.disabled = !selectedTemplate;
      if (els.templateTrack) {
        els.templateTrack.querySelectorAll("[data-tbd-template-key]").forEach((card) => {
          const active = Boolean(selectedTemplate && card.dataset.tbdTemplateKey === selectedTemplate.key);
          card.setAttribute("aria-current", active ? "true" : "false");
          if (active && options.scroll) card.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
        });
      }
    }

    function renderTemplates() {
      if (!els.templateTrack) return;
      const totalMatches = matchingTemplateProducts().length;
      visibleTemplates = filteredTemplateProducts();
      els.templateTrack.innerHTML = "";
      if (els.templateCount) {
        const shownStart = visibleTemplates.length ? ((templatePage - 1) * TEMPLATE_PAGE_SIZE) + 1 : 0;
        const shownEnd = Math.min(templatePage * TEMPLATE_PAGE_SIZE, totalMatches);
        els.templateCount.textContent = visibleTemplates.length
          ? `Showing ${shownStart}-${shownEnd} of ${totalMatches} templates`
          : "No templates found.";
      }
      renderTemplatePager(totalMatches);
      const typeOrder = ["rectangle", "polepocket", "triangle", "homeplatepennant"];
      typeOrder
        .filter((type) => templateTypeFilter === "all" || type === templateTypeFilter)
        .forEach((type) => {
          const group = visibleTemplates.filter((template) => template.type === type);
          if (!group.length) return;
          const section = document.createElement("section");
          section.className = "tbd__template-section";
          const heading = document.createElement("div");
          heading.className = "tbd__template-section-title";
          heading.textContent = templateTypeLabel(type);
          const grid = document.createElement("div");
          grid.className = "tbd__template-grid";
          group.forEach((template) => {
            const card = document.createElement("button");
            card.type = "button";
            card.className = "tbd__template-card";
            card.dataset.tbdTemplateKey = template.key;
            card.setAttribute("aria-current", selectedTemplate && selectedTemplate.key === template.key ? "true" : "false");
            card.innerHTML = `
              <img loading="lazy" alt="${escapeHtml(template.title)} preview" src="${template.image}">
              <strong>${escapeHtml(template.title)}</strong>
              <span>${templateSportLabel(template.sport)}</span>
            `;
            card.addEventListener("click", () => {
              selectTemplate(template, { scroll: false });
              setStatus(`${template.title} preview selected. Tap Design this to edit it.`);
            });
            grid.appendChild(card);
          });
          section.append(heading, grid);
          els.templateTrack.appendChild(section);
        });

      if (!visibleTemplates.length) {
        selectTemplate(null);
      } else if (!selectedTemplate || !visibleTemplates.some((template) => template.key === selectedTemplate.key)) {
        selectTemplate(visibleTemplates[0]);
      } else {
        selectTemplate(selectedTemplate);
      }
      syncTemplateAutoScroll();
    }

    async function loadTemplateProducts() {
      if (!els.templateTrack) return;
      const url = launch.productManifestUrl || root.dataset.productsUrl || (window.location.protocol === "file:" ? "" : resolveSourceUrl("/team-banner-products.json"));
      if (!url) {
        renderTemplates();
        return;
      }
      try {
        const response = await fetch(url, { credentials: "omit" });
        if (!response.ok) throw new Error("Template manifest request failed");
        const data = await response.json();
        const products = Array.isArray(data.products) ? data.products : Array.isArray(data) ? data : [];
        const seen = new Set();
        templateProducts = products
          .filter((product) => !product.status || String(product.status).toLowerCase() === "active")
          .map(normalizeTemplateProduct)
          .filter(Boolean)
          .filter((template) => {
            if (seen.has(template.key)) return false;
            seen.add(template.key);
            return true;
          });
      } catch (error) {
        templateProducts = [];
        setStatus("Template list could not load. Use product Customize buttons or Assets.");
      }
      renderTemplates();
    }

    function stopTemplateAutoScroll() {
      if (!templateAutoTimer) return;
      window.clearInterval(templateAutoTimer);
      templateAutoTimer = 0;
    }

    function syncTemplateAutoScroll() {
      const panelOpen = root.dataset.activePanel === "templates";
      const shouldRun = Boolean(panelOpen && els.templateAuto && els.templateAuto.checked && visibleTemplates.length > 1);
      if (!shouldRun) {
        stopTemplateAutoScroll();
        return;
      }
      if (templateAutoTimer) return;
      templateAutoTimer = window.setInterval(() => {
        if (!visibleTemplates.length) return;
        const currentIndex = Math.max(0, visibleTemplates.findIndex((template) => selectedTemplate && template.key === selectedTemplate.key));
        const nextTemplate = visibleTemplates[(currentIndex + 1) % visibleTemplates.length];
        selectTemplate(nextTemplate, { scroll: true });
      }, 2400);
    }

    async function designSelectedTemplate() {
      if (!selectedTemplate) return setStatus("Choose a template first.");
      const template = selectedTemplate;
      const product = template.product || {};
      const nextShape = normalizeShape(template.type || product.shape, true);
      projectRestoreToken += 1;
      launch.handle = template.handle || product.handle || "";
      launch.product = product;
      launch.productUrl = product.url || product.path || "";
      launch.title = template.title || product.title || "Banner template";
      launch.headline = "";
      launch.tags = product.tags || "";
      launch.collections = [product.type, product.productCategory].filter(Boolean).join(" ");
      launch.image = template.image || product.image || "";
      launch.price = product.price || template.price || "";
      launch.sizeLabel = "";
      launch.shape = nextShape;
      launch.autoLayer = "png";
      launch.autoLoadProduct = true;
      const productLayerConfig = mergeLayerConfig(
        nextShape,
        launch.image,
        parseLayerConfigTags(launch.tags, nextShape, launch.image),
        product.layerConfig
      );
      const productTemplateSvg = product.templateSvg || productLayerConfig.layoutSvgUrl || "";
      const trustedProductSvg = isExactProductSvg(product, productLayerConfig, launch.image, productTemplateSvg);
      launch.templateSvg = trustedProductSvg ? productTemplateSvg : "";
      launch.layerMap = null;
      launch.layerConfig = trustedProductSvg ? productLayerConfig : productImageFallbackConfig(productLayerConfig, launch.image);
      launch.hasDesign = Boolean(launch.image || launch.templateSvg);

      ARTBOARD_SHAPE = nextShape;
      const size = artboardSizeForShape(ARTBOARD_SHAPE);
      WIDTH = size.width;
      HEIGHT = size.height;
      canvasEl.width = WIDTH;
      canvasEl.height = HEIGHT;
      canvas.setWidth(WIDTH);
      canvas.setHeight(HEIGHT);
      canvas.clipPath = makeClipPath();
      activeCategory = defaultCategoryForShape(ARTBOARD_SHAPE);
      assetPage = 1;

      setStatus(`Loading ${template.title} as editable layers...`);
      if (els.templateDesign) els.templateDesign.disabled = true;
      stopTemplateAutoScroll();
      try {
        await detectProductSourceSvgMap(root, launch);
        await detectProductLayerMap(root, launch);
        syncProductInfo();
        renderCategories();
        renderAssets();
        togglePanel("templates");
        await loadProductDesign();
        updateStageScale();
        updateSelectionControls();
      } finally {
        if (els.templateDesign) els.templateDesign.disabled = false;
      }
    }

    function toggleTemplateGenerator() {
      if (!els.templateGenerator || !els.templateGeneratorToggle) return;
      const isCollapsed = els.templateGenerator.classList.toggle("is-collapsed");
      els.templateGeneratorToggle.setAttribute("aria-expanded", isCollapsed ? "false" : "true");
    }

    function generatorValue(element, fallback = "") {
      return compactWhitespace(element && element.value ? element.value : fallback);
    }

    function generatorPlayerCountValue() {
      return Math.max(1, Math.min(20, Number(els.generatorPlayerCount && els.generatorPlayerCount.value) || 12));
    }

    function syncGeneratorPlayerNameCache() {
      if (!els.generatorPlayerNames) return;
      els.generatorPlayerNames.querySelectorAll("[data-tbd-generator-player-name]").forEach((input) => {
        const index = Number(input.dataset.tbdGeneratorPlayerName || 0) - 1;
        if (index >= 0) generatorPlayerNamesCache[index] = input.value;
      });
    }

    function generatorPlayerNames(count = generatorPlayerCountValue()) {
      syncGeneratorPlayerNameCache();
      return Array.from({ length: count }, (_, index) => compactWhitespace(generatorPlayerNamesCache[index] || ""));
    }

    function playerNameForNumber(options, number) {
      const name = options && Array.isArray(options.playerNames) ? options.playerNames[number - 1] : "";
      return compactWhitespace(name) || "Player";
    }

    function renderGeneratorPlayerNameInputs() {
      if (!els.generatorPlayerNames) return;
      syncGeneratorPlayerNameCache();
      const count = generatorPlayerCountValue();
      for (let index = 0; index < count; index += 1) {
        if (generatorPlayerNamesCache[index] === undefined) generatorPlayerNamesCache[index] = "";
      }
      if (els.generatorPlayerSummary) {
        els.generatorPlayerSummary.textContent = count === 1 ? "1 player" : `${count} players`;
      }
      els.generatorPlayerNames.innerHTML = "";
      Array.from({ length: count }, (_, index) => generatorPlayerNamesCache[index] || "").forEach((value, index) => {
        const number = index + 1;
        const label = document.createElement("label");
        label.className = "tbd__template-player-field";
        label.innerHTML = `
          <span>${number}</span>
          <input data-tbd-generator-player-name="${number}" type="text" value="${escapeHtml(value)}" placeholder="Player" autocomplete="off" aria-label="Player ${number} name">
        `;
        label.querySelector("input")?.addEventListener("input", (event) => {
          generatorPlayerNamesCache[index] = event.target.value;
          clearGeneratorPreviewState();
        });
        els.generatorPlayerNames.appendChild(label);
      });
    }

    function captureGeneratorSetup() {
      return {
        team: els.generatorTeam ? els.generatorTeam.value : "",
        manager: els.generatorManager ? els.generatorManager.value : "",
        assistantManager: els.generatorAssistantManager ? els.generatorAssistantManager.value : "",
        coach: els.generatorCoach ? els.generatorCoach.value : "",
        assistantCoach: els.generatorAssistantCoach ? els.generatorAssistantCoach.value : "",
        teamMom: els.generatorTeamMom ? els.generatorTeamMom.value : "",
        sponsor: els.generatorSponsor ? els.generatorSponsor.value : "",
        playerCount: generatorPlayerCountValue(),
        playerNames: generatorPlayerNames(),
        sport: els.generatorSport ? els.generatorSport.value : "baseball",
        shape: els.generatorType ? els.generatorType.value : ARTBOARD_SHAPE,
        svg: els.generatorSvg ? els.generatorSvg.value : "",
        assetSearch: els.generatorAssetSearch ? els.generatorAssetSearch.value : "",
        selectedAssets: { ...selectedGeneratorAssets }
      };
    }

    function applyGeneratorSetup(setup) {
      if (!setup || typeof setup !== "object") return;
      const setValue = (element, value) => {
        if (element && value !== undefined && value !== null) element.value = value;
      };
      setValue(els.generatorTeam, setup.team);
      setValue(els.generatorManager, setup.manager);
      setValue(els.generatorAssistantManager, setup.assistantManager);
      setValue(els.generatorCoach, setup.coach);
      setValue(els.generatorAssistantCoach, setup.assistantCoach);
      setValue(els.generatorTeamMom, setup.teamMom);
      setValue(els.generatorSponsor, setup.sponsor);
      setValue(els.generatorPlayerCount, setup.playerCount);
      setValue(els.generatorSport, setup.sport);
      setValue(els.generatorType, setup.shape);
      setValue(els.generatorSvg, setup.svg);
      setValue(els.generatorAssetSearch, setup.assetSearch);
      Object.assign(selectedGeneratorAssets, setup.selectedAssets || {});
      generatorAssetSearchTerm = layerMatchText(setup.assetSearch || "");
      generatorPlayerNamesCache = Array.isArray(setup.playerNames) ? setup.playerNames.slice(0, 20) : [];
      renderGeneratorPlayerNameInputs();
      clearGeneratorPreviewState();
      renderGeneratorOptionPanels();
    }

    function saveGeneratorSetup() {
      try {
        window.localStorage.setItem(GENERATOR_SETUP_STORAGE_KEY, JSON.stringify(captureGeneratorSetup()));
        if (els.generatorSavedMeta) els.generatorSavedMeta.textContent = "Saved";
        setStatus("Template generator setup saved for reuse.");
      } catch (error) {
        setStatus("Template setup could not be saved in this browser.");
      }
    }

    function loadGeneratorSetup() {
      try {
        const raw = window.localStorage.getItem(GENERATOR_SETUP_STORAGE_KEY);
        if (!raw) {
          setStatus("No saved template generator setup found.");
          return;
        }
        applyGeneratorSetup(JSON.parse(raw));
        if (els.generatorSavedMeta) els.generatorSavedMeta.textContent = "Loaded";
        setStatus("Saved template generator setup loaded.");
      } catch (error) {
        setStatus("Saved template setup could not be loaded.");
      }
    }

    function generatorOptions() {
      const shape = normalizeShape((els.generatorType && els.generatorType.value) || ARTBOARD_SHAPE, false);
      const playerCount = generatorPlayerCountValue();
      return {
        team: generatorValue(els.generatorTeam, "TEAM NAME"),
        manager: generatorValue(els.generatorManager),
        assistantManager: generatorValue(els.generatorAssistantManager),
        coach: generatorValue(els.generatorCoach),
        assistantCoach: generatorValue(els.generatorAssistantCoach),
        teamMom: generatorValue(els.generatorTeamMom),
        sponsor: generatorValue(els.generatorSponsor),
        playerCount,
        playerNames: generatorPlayerNames(playerCount),
        sport: (els.generatorSport && els.generatorSport.value) || "baseball",
        shape
      };
    }

    function syncGeneratorSelectsFromTemplate() {
      if (els.generatorSport && templateSportFilter !== "all") els.generatorSport.value = templateSportFilter;
      if (els.generatorType && templateTypeFilter !== "all") els.generatorType.value = templateTypeFilter;
      renderGeneratorOptionPanels();
    }

    function generatorAssetScore(asset, sport, terms = []) {
      const text = layerMatchText([asset.name, asset.url, asset.category].join(" "));
      let score = 0;
      if (generatorAssetSearchTerm && !text.includes(generatorAssetSearchTerm)) score -= 200;
      if (sport && text.includes(sport)) score += 24;
      terms.forEach((term) => {
        const clean = layerMatchText(term);
        if (!clean) return;
        if (text.includes(clean)) score += 18;
      });
      return score;
    }

    function generatorAssetCandidates(category, options = {}) {
      const sport = options.sport || "";
      const terms = options.terms || [];
      return assets
        .filter((asset) => asset.category === category)
        .map((asset, index) => ({ asset, index, score: generatorAssetScore(asset, sport, terms) }))
        .filter((entry) => !generatorAssetSearchTerm || entry.score > -100)
        .sort((a, b) => b.score - a.score || a.index - b.index)
        .map((entry) => entry.asset);
    }

    function pickGeneratorAsset(category, options = {}) {
      const pool = generatorAssetCandidates(category, options);
      if (!pool.length) return null;
      return pool[0];
    }

    function selectedGeneratorAsset(kind, category, options = {}) {
      const selectedUrl = selectedGeneratorAssets[kind] || "";
      const selected = selectedUrl
        ? assets.find((asset) => asset.category === category && asset.url === selectedUrl)
        : null;
      return selected || pickGeneratorAsset(category, options);
    }

    function explicitGeneratorAsset(kind, category) {
      const selectedUrl = selectedGeneratorAssets[kind] || "";
      if (!selectedUrl) return null;
      return assets.find((asset) => asset.category === category && asset.url === selectedUrl) || null;
    }

    function generatorSvgScore(template, options) {
      const text = layerMatchText([
        template.name,
        template.title,
        template.url,
        template.sport,
        template.type,
        template.sourceUrl
      ].join(" "));
      let score = 0;
      const templateType = bannerTypeValueForShape(template.type || template.shape || "");
      const templatePlayers = Number(template.playerCount || template.players || 0);
      if (template.sport && template.sport === options.sport) score += 42;
      else if (text.includes(options.sport)) score += 18;
      if (templateType === bannerTypeValueForShape(options.shape)) score += 56;
      else if (options.shape === "polepocket" && /pole|pocket/.test(text)) score += 24;
      else if (options.shape === "triangle" && /triangle|pennant/.test(text)) score += 24;
      else if (isHomePlateShape(options.shape) && /home|plate/.test(text)) score += 24;
      else if (options.shape === "rectangle" && /hem|grommet|banner/.test(text)) score += 12;
      if (templatePlayers) {
        score += templatePlayers === options.playerCount
          ? 90
          : Math.max(-40, 24 - Math.abs(templatePlayers - options.playerCount) * 8);
      } else if (text.includes(String(options.playerCount))) {
        score += 8;
      }
      return score;
    }

    function generatorSvgCandidates(options = generatorOptions()) {
      return svgTemplates
        .map((template, index) => ({ template, index, score: generatorSvgScore(template, options) }))
        .filter((entry) => !generatorAssetSearchTerm || entry.score > -100)
        .sort((a, b) => b.score - a.score || a.index - b.index)
        .map((entry) => entry.template);
    }

    function selectedGeneratorSvgTemplate(options = generatorOptions()) {
      const selected = els.generatorSvg && els.generatorSvg.value;
      if (selected) {
        const exact = svgTemplates.find((template) => template.url === selected || template.name === selected);
        if (exact) return exact;
      }
      if (!svgTemplates.length) return null;
      return generatorSvgCandidates(options)[0] || svgTemplates[0];
    }

    function normalizeSvgTemplateEntry(template, index = 0) {
      const rawName = template && template.name ? String(template.name) : "";
      const rawUrl = template && template.url ? String(template.url) : "";
      const type = bannerTypeValueForShape(template.type || template.shape || template.bannerType || "");
      const sport = String(template.sport || "").toLowerCase();
      return {
        ...template,
        name: rawName || rawUrl.split("/").pop() || `svg-layout-${index + 1}`,
        url: rawUrl,
        sourceUrl: template.sourceUrl || template.remoteUrl || "",
        title: template.title || template.label || "",
        type,
        sport: ["baseball", "softball", "soccer"].includes(sport) ? sport : "",
        playerCount: Number(template.playerCount || template.players || 0) || 0
      };
    }

    function svgTemplateDisplayName(template) {
      if (!template) return "generated layout";
      const index = svgTemplates.indexOf(template);
      if (template.title) return template.title;
      const name = template.name || "";
      if (!name || /^\d+$/.test(name)) return `SVG Layout ${index >= 0 ? index + 1 : ""}`.trim();
      return name;
    }

    function renderGeneratorSvgOptions() {
      if (!els.generatorSvg) return;
      const previous = els.generatorSvg.value;
      els.generatorSvg.innerHTML = `<option value="">Auto SVG layout</option>`;
      svgTemplates.forEach((template) => {
        const option = document.createElement("option");
        option.value = template.url || template.name;
        option.textContent = svgTemplateDisplayName(template);
        els.generatorSvg.appendChild(option);
      });
      if (previous && [...els.generatorSvg.options].some((option) => option.value === previous)) {
        els.generatorSvg.value = previous;
      }
      renderGeneratorOptionPanels();
    }

    function generatorCardImage(src, alt) {
      return src
        ? `<img loading="lazy" alt="${escapeHtml(alt || "")}" src="${escapeHtml(resolveSourceUrl(src))}">`
        : `<span class="tbd__generator-option-empty">No preview</span>`;
    }

    function renderGeneratorLayoutOptions(options = generatorOptions()) {
      if (!els.generatorLayoutOptions) return;
      const selectedTemplate = selectedGeneratorSvgTemplate(options);
      const selectedValue = els.generatorSvg && els.generatorSvg.value;
      const candidates = generatorSvgCandidates(options).slice(0, 12);
      els.generatorLayoutOptions.innerHTML = "";
      if (!candidates.length) {
        els.generatorLayoutOptions.innerHTML = `<div class="tbd__generator-option-empty">No layouts found</div>`;
        return;
      }
      candidates.forEach((template) => {
        const active = selectedValue
          ? template.url === selectedValue || template.name === selectedValue
          : template === selectedTemplate;
        const button = document.createElement("button");
        button.type = "button";
        button.className = "tbd__generator-option-card";
        button.setAttribute("aria-current", active ? "true" : "false");
        button.dataset.tbdGeneratorLayoutUrl = template.url || template.name || "";
        button.innerHTML = `
          ${generatorCardImage(template.url, svgTemplateDisplayName(template))}
          <strong>${escapeHtml(svgTemplateDisplayName(template))}</strong>
          <span>${template.playerCount || options.playerCount} players · ${templateTypeLabel(template.type || options.shape)}</span>
        `;
        button.addEventListener("click", () => {
          if (els.generatorSvg) els.generatorSvg.value = template.url || template.name || "";
          clearGeneratorPreviewState();
          renderGeneratorLayoutOptions(generatorOptions());
        });
        els.generatorLayoutOptions.appendChild(button);
      });
    }

    function renderGeneratorAssetOptions(target, kind, category, options = generatorOptions()) {
      if (!target) return;
      const terms = [options.team, options.sport, category, templateTypeLabel(options.shape)].filter(Boolean);
      const candidates = generatorAssetCandidates(category, { sport: options.sport, terms }).slice(0, 12);
      const activeAsset = selectedGeneratorAsset(kind, category, { sport: options.sport, terms });
      target.innerHTML = "";
      if (!candidates.length) {
        target.innerHTML = `<div class="tbd__generator-option-empty">No assets found</div>`;
        return;
      }
      candidates.forEach((asset) => {
        const active = activeAsset && asset.url === activeAsset.url;
        const button = document.createElement("button");
        button.type = "button";
        button.className = "tbd__generator-option-card";
        button.setAttribute("aria-current", active ? "true" : "false");
        button.dataset.tbdGeneratorAssetKind = kind;
        button.dataset.tbdGeneratorAssetUrl = asset.url;
        button.innerHTML = `
          ${generatorCardImage(asset.url, asset.name)}
          <strong>${escapeHtml(asset.name || category)}</strong>
          <span>${escapeHtml(categoryLabel(asset.category || category))}</span>
        `;
        button.addEventListener("click", () => {
          selectedGeneratorAssets[kind] = asset.url;
          clearGeneratorPreviewState();
          renderGeneratorOptionPanels();
        });
        target.appendChild(button);
      });
    }

    function renderGeneratorOptionPanels() {
      const options = generatorOptions();
      renderGeneratorLayoutOptions(options);
      renderGeneratorAssetOptions(
        els.generatorBackgroundOptions,
        "background",
        defaultCategoryForShape(options.shape),
        options
      );
      renderGeneratorAssetOptions(els.generatorLogoOptions, "teamName", "Team name", options);
      renderGeneratorAssetOptions(els.generatorClipartOptions, "clipart", "Clip art", options);
      renderGeneratorAssetOptions(els.generatorAccessoryOptions, "accessory", "Accessory", options);
    }

    function generatedLayerConfig(options, svgTemplate) {
      const headerCount = [
        options.manager,
        options.assistantManager,
        options.coach || "Coach's name",
        options.assistantCoach,
        options.teamMom || "Team mom's name",
        options.sponsor
      ].filter(Boolean).length;
      return mergeLayerConfig(options.shape, "", {
        layerCount: 2 + options.playerCount * 2 + headerCount,
        backgroundCount: 1,
        teamLogoCount: 1,
        clipartCount: 1,
        playerCount: options.playerCount,
        playerIconCount: options.playerCount,
        playerTextCount: options.playerCount,
        textLayerCount: options.playerCount + headerCount,
        headerTextCount: headerCount,
        yearTextCount: isRectangularShape(options.shape) ? 0 : 1,
        playerLabel: "Player",
        backgroundSource: "design-tool-generator",
        logoSource: "design-tool-generator",
        clipartSource: "design-tool-generator",
        accessorySource: "design-tool-generator",
        layoutSource: svgTemplate ? "svg-template" : "generated",
        layoutSvgUrl: svgTemplate && svgTemplate.url ? svgTemplate.url : ""
      });
    }

    function configureGeneratedArtboard(options, svgTemplate) {
      ARTBOARD_SHAPE = options.shape;
      const size = artboardSizeForShape(ARTBOARD_SHAPE);
      WIDTH = size.width;
      HEIGHT = size.height;
      canvasEl.width = WIDTH;
      canvasEl.height = HEIGHT;
      canvas.setWidth(WIDTH);
      canvas.setHeight(HEIGHT);
      canvas.clipPath = makeClipPath();
      activeCategory = defaultCategoryForShape(ARTBOARD_SHAPE);
      assetPage = 1;
      launch.handle = "generated-template";
      launch.product = null;
      launch.productUrl = "";
      launch.title = `${options.team || "Generated"} ${templateTypeLabel(ARTBOARD_SHAPE)}`;
      launch.headline = defaultHeadlineForShape(ARTBOARD_SHAPE);
      launch.sizeLabel = defaultSizeForShape(ARTBOARD_SHAPE);
      launch.price = defaultPriceForShape(ARTBOARD_SHAPE);
      launch.tags = "";
      launch.collections = options.sport;
      launch.image = "";
      launch.shape = ARTBOARD_SHAPE;
      launch.autoLayer = "generated";
      launch.autoLoadProduct = false;
      launch.templateSvg = svgTemplate && svgTemplate.url ? svgTemplate.url : "";
      launch.layerMap = null;
      launch.layerConfig = generatedLayerConfig(options, svgTemplate);
      launch.hasDesign = false;
      syncProductInfo();
      renderCategories();
      renderAssets();
    }

    function addGeneratedBackgroundLayer(options) {
      const bounds = artboardBounds();
      const category = defaultCategoryForShape(ARTBOARD_SHAPE);
      const backgroundAsset = selectedGeneratorAsset("background", category, {
        sport: options.sport,
        terms: [templateTypeLabel(ARTBOARD_SHAPE)]
      });
      if (backgroundAsset) {
        return addAssetImageLayer(backgroundAsset, {
          name: "Background",
          role: "template-background",
          cover: true,
          fitMode: backgroundFitMode(),
          locked: true
        });
      }

      const common = {
        fill: "#ffffff",
        stroke: "#475569",
        strokeWidth: 2,
        data: {
          name: "Background",
          role: "template-background",
          locked: true,
          showInLayerList: true
        }
      };
      const background = isRectangularShape(ARTBOARD_SHAPE)
        ? new fabric.Rect({ left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height, ...common })
        : new fabric.Polygon(artboardPoints(), common);
      ensureLayerId(background);
      canvas.add(background);
      background.sendToBack();
      setObjectLocked(background, true);
      return background;
    }

    async function addSvgLayoutGuide(svgTemplate) {
      if (!svgTemplate || !svgTemplate.url) return null;
      try {
        const response = await fetch(resolveSourceUrl(svgTemplate.url), { credentials: "omit" });
        if (!response.ok) throw new Error("SVG layout failed to load.");
        const svgText = await response.text();
        const image = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`);
        const layer = addImageElementLayer(image, {
          name: "SVG layout guide",
          role: "svg-layout-guide",
          cover: false,
          widthRatio: isRectangularShape(ARTBOARD_SHAPE) ? 0.94 : 0.72,
          heightRatio: 0.9,
          opacity: 0.18,
          locked: true,
          data: {
            name: "SVG layout guide",
            role: "svg-layout-guide",
            sourceUrl: svgTemplate.url,
            showInLayerList: true
          }
        });
        setObjectLocked(layer, true);
        layer.sendToBack();
        const background = canvas.getObjects().find((obj) => obj.data && obj.data.role === "template-background");
        if (background) background.sendToBack();
        return layer;
      } catch (error) {
        return null;
      }
    }

    function svgMatrixMultiply(first, second) {
      return [
        first[0] * second[0] + first[2] * second[1],
        first[1] * second[0] + first[3] * second[1],
        first[0] * second[2] + first[2] * second[3],
        first[1] * second[2] + first[3] * second[3],
        first[0] * second[4] + first[2] * second[5] + first[4],
        first[1] * second[4] + first[3] * second[5] + first[5]
      ];
    }

    function svgTranslateMatrix(tx, ty) {
      return [1, 0, 0, 1, tx || 0, ty || 0];
    }

    function svgScaleMatrix(sx, sy) {
      const x = sx ?? 1;
      return [x, 0, 0, sy ?? x, 0, 0];
    }

    function svgRotateMatrix(angle, cx = 0, cy = 0) {
      const radians = (Number(angle) || 0) * Math.PI / 180;
      const cos = Math.cos(radians);
      const sin = Math.sin(radians);
      const rotate = [cos, sin, -sin, cos, 0, 0];
      if (!cx && !cy) return rotate;
      return svgMatrixMultiply(
        svgTranslateMatrix(cx, cy),
        svgMatrixMultiply(rotate, svgTranslateMatrix(-cx, -cy))
      );
    }

    function svgSkewXMatrix(angle) {
      return [1, 0, Math.tan((Number(angle) || 0) * Math.PI / 180), 1, 0, 0];
    }

    function svgSkewYMatrix(angle) {
      return [1, Math.tan((Number(angle) || 0) * Math.PI / 180), 0, 1, 0, 0];
    }

    function svgTransformMatrix(transform) {
      let matrix = [1, 0, 0, 1, 0, 0];
      const pattern = /(matrix|translate|scale|rotate|skewX|skewY)\(([^)]*)\)/gi;
      let match;
      while ((match = pattern.exec(String(transform || "")))) {
        const values = match[2].split(/[\s,]+/).map(Number).filter(Number.isFinite);
        let next = [1, 0, 0, 1, 0, 0];
        const type = match[1].toLowerCase();
        if (type === "matrix" && values.length >= 6) {
          next = values.slice(0, 6);
        } else if (type === "translate") {
          next = svgTranslateMatrix(values[0] || 0, values[1] || 0);
        } else if (type === "scale") {
          next = svgScaleMatrix(values[0] ?? 1, values[1]);
        } else if (type === "rotate") {
          next = svgRotateMatrix(values[0] || 0, values[1] || 0, values[2] || 0);
        } else if (type === "skewx") {
          next = svgSkewXMatrix(values[0] || 0);
        } else if (type === "skewy") {
          next = svgSkewYMatrix(values[0] || 0);
        }
        matrix = svgMatrixMultiply(matrix, next);
      }
      return matrix;
    }

    function svgElementMatrix(element, svgRoot) {
      const chain = [];
      let current = element;
      while (current && current !== svgRoot) {
        chain.unshift(current);
        current = current.parentElement;
      }
      return chain.reduce((matrix, node) => (
        svgMatrixMultiply(matrix, svgTransformMatrix(node.getAttribute("transform")))
      ), [1, 0, 0, 1, 0, 0]);
    }

    function svgApplyMatrix(matrix, x, y) {
      return {
        x: matrix[0] * x + matrix[2] * y + matrix[4],
        y: matrix[1] * x + matrix[3] * y + matrix[5]
      };
    }

    function svgTransformedBox(matrix, x, y, width, height) {
      const corners = [
        svgApplyMatrix(matrix, x, y),
        svgApplyMatrix(matrix, x + width, y),
        svgApplyMatrix(matrix, x, y + height),
        svgApplyMatrix(matrix, x + width, y + height)
      ];
      const xs = corners.map((point) => point.x);
      const ys = corners.map((point) => point.y);
      const left = Math.min(...xs);
      const top = Math.min(...ys);
      const right = Math.max(...xs);
      const bottom = Math.max(...ys);
      return {
        left,
        top,
        width: Math.max(1, right - left),
        height: Math.max(1, bottom - top),
        centerX: left + Math.max(1, right - left) / 2,
        centerY: top + Math.max(1, bottom - top) / 2
      };
    }

    function svgAttrNumber(element, name, fallback = 0) {
      if (!element) return fallback;
      const raw = element.getAttribute(name);
      if (raw === null || raw === "") return fallback;
      const value = Number(raw);
      return Number.isFinite(value) ? value : fallback;
    }

    function svgAttrValue(element, name, fallback = "") {
      if (!element) return fallback;
      const raw = element.getAttribute(name);
      return raw === null || raw === "" ? fallback : raw;
    }

    function svgViewBox(svgRoot) {
      const raw = String(svgRoot.getAttribute("viewBox") || "").trim().split(/[\s,]+/).map(Number);
      if (raw.length >= 4 && raw.every(Number.isFinite)) {
        return { x: raw[0], y: raw[1], width: raw[2], height: raw[3] };
      }
      return {
        x: 0,
        y: 0,
        width: svgAttrNumber(svgRoot, "width", 500) || 500,
        height: svgAttrNumber(svgRoot, "height", 300) || 300
      };
    }

    function svgTemplatePlacement(viewBox, options = {}) {
      const fillArtboard = Boolean(options.fillArtboard || options.preserveSvgAssets);
      const bounds = fillArtboard && ARTBOARD_SHAPE === "polepocket"
        ? { left: 0, top: 0, width: WIDTH, height: HEIGHT }
        : artboardBounds();
      const maxWidth = fillArtboard
        ? bounds.width
        : WIDTH * (isRectangularShape(ARTBOARD_SHAPE) ? 0.94 : 0.76);
      const maxHeight = fillArtboard
        ? bounds.height
        : HEIGHT * (isRectangularShape(ARTBOARD_SHAPE) ? 0.9 : 0.88);
      const stretchToBounds = Boolean(options.stretchToBounds || String(options.preserveAspectRatio || "").toLowerCase() === "none");
      const scaleX = stretchToBounds ? maxWidth / viewBox.width : Math.min(maxWidth / viewBox.width, maxHeight / viewBox.height);
      const scaleY = stretchToBounds ? maxHeight / viewBox.height : scaleX;
      return {
        scale: Math.min(scaleX, scaleY),
        scaleX,
        scaleY,
        left: fillArtboard
          ? bounds.left + (bounds.width - viewBox.width * scaleX) / 2
          : (WIDTH - viewBox.width * scaleX) / 2,
        top: fillArtboard
          ? bounds.top + (bounds.height - viewBox.height * scaleY) / 2
          : (HEIGHT - viewBox.height * scaleY) / 2
      };
    }

    function svgBoxToCanvas(box, viewBox, placement) {
      const scaleX = placement.scaleX || placement.scale || 1;
      const scaleY = placement.scaleY || placement.scale || 1;
      return {
        left: placement.left + (box.left - viewBox.x) * scaleX,
        top: placement.top + (box.top - viewBox.y) * scaleY,
        width: box.width * scaleX,
        height: box.height * scaleY,
        centerX: placement.left + (box.centerX - viewBox.x) * scaleX,
        centerY: placement.top + (box.centerY - viewBox.y) * scaleY
      };
    }

    function svgPointToCanvas(point, viewBox, placement) {
      const scaleX = placement.scaleX || placement.scale || 1;
      const scaleY = placement.scaleY || placement.scale || 1;
      return {
        left: placement.left + (point.x - viewBox.x) * scaleX,
        top: placement.top + (point.y - viewBox.y) * scaleY
      };
    }

    function svgCanvasMatrix(viewBox, placement) {
      const scaleX = placement.scaleX || placement.scale || 1;
      const scaleY = placement.scaleY || placement.scale || 1;
      return [scaleX, 0, 0, scaleY, placement.left - viewBox.x * scaleX, placement.top - viewBox.y * scaleY];
    }

    function svgImageMatrixToCanvas(entry, viewBox, placement, naturalWidth, naturalHeight) {
      const localImageMatrix = [
        (entry.width || naturalWidth || 1) / Math.max(1, naturalWidth || 1),
        0,
        0,
        (entry.height || naturalHeight || 1) / Math.max(1, naturalHeight || 1),
        entry.x || 0,
        entry.y || 0
      ];
      return svgMatrixMultiply(
        svgMatrixMultiply(svgCanvasMatrix(viewBox, placement), entry.matrix || [1, 0, 0, 1, 0, 0]),
        localImageMatrix
      );
    }

    function applyCanvasMatrixToImage(layer, matrix, naturalWidth, naturalHeight) {
      const centerMatrix = svgMatrixMultiply(
        matrix,
        svgTranslateMatrix((naturalWidth || 1) / 2, (naturalHeight || 1) / 2)
      );
      if (fabric.util && typeof fabric.util.qrDecompose === "function") {
        const decomposed = fabric.util.qrDecompose(centerMatrix);
        layer.set({
          originX: "center",
          originY: "center",
          left: decomposed.translateX,
          top: decomposed.translateY,
          angle: decomposed.angle,
          scaleX: decomposed.scaleX,
          scaleY: decomposed.scaleY,
          skewX: decomposed.skewX || 0,
          skewY: decomposed.skewY || 0,
          flipX: false,
          flipY: false
        });
      } else {
        layer.set({
          originX: "left",
          originY: "top",
          transformMatrix: matrix
        });
      }
    }

    function svgTemplateTypeFromInfo(type) {
      const value = String(type || "").toLowerCase();
      if (/pole/.test(value)) return "polepocket";
      if (/triangle|pennant/.test(value)) return "triangle";
      if (/home/.test(value) || /plate/.test(value)) return "homeplatepennant";
      return "rectangle";
    }

    function svgTextRole(text) {
      const lower = String(text || "").toLowerCase();
      if (/^player$/i.test(text)) return "template-player-text";
      if (/^year$/i.test(text)) return "template-year-text";
      return "template-text-layer";
    }

    function svgTextName(text, role, index) {
      const lower = String(text || "").toLowerCase();
      if (role === "template-player-text") return `Player text ${index}`;
      if (role === "template-year-text") return "Year text";
      if (/coach/.test(lower)) return "Coach name";
      if (/team mom|mom\/dad|mom/.test(lower)) return "Team mom name";
      if (/manager/.test(lower)) return "Team manager";
      if (/sponsor/.test(lower)) return "Team sponsor";
      return text || `Text ${index}`;
    }

    function svgTextAnchor(element, tspan) {
      const raw = String((tspan && tspan.getAttribute("text-anchor")) || element.getAttribute("text-anchor") || "").toLowerCase();
      if (raw === "middle") return { originX: "center", textAlign: "center" };
      if (raw === "end") return { originX: "right", textAlign: "right" };
      return { originX: "left", textAlign: "left" };
    }

    function svgReplacementText(text, options) {
      const lower = String(text || "").toLowerCase();
      if (/^player$/i.test(text)) return "Player";
      if (/^year$/i.test(text)) return "Year";
      if (/team mom|mom\/dad|mom/.test(lower)) return `Team mom: ${options.teamMom || "Team mom's name"}`;
      if (/asst\.?\s*coach|assistant coach/.test(lower)) return `Asst. Coach: ${options.assistantCoach || "Name"}`;
      if (/coach/.test(lower)) return `Coach: ${options.coach || "Coach's name"}`;
      if (/asst\.?\s*manager|assistant manager/.test(lower)) return `Asst. Manager: ${options.assistantManager || "Name"}`;
      if (/manager/.test(lower)) return `Team Manager: ${options.manager || "Name"}`;
      if (/sponsor/.test(lower)) return `Sponsor: ${options.sponsor || "Name"}`;
      return text;
    }

    function layerAssetKey(value) {
      return imageFileKey(value).replace(/\.[a-z0-9]+$/i, "");
    }

    function layerAssetMatches(href, candidates) {
      const hrefKey = layerAssetKey(href);
      if (!hrefKey) return false;
      return candidates
        .filter(Boolean)
        .some((candidate) => {
          const candidateKey = layerAssetKey(candidate);
          if (!candidateKey) return false;
          return candidateKey === hrefKey || String(candidate || "") === String(href || "");
        });
    }

    function layerConfigCount(layerConfig = {}, key) {
      const value = Number(layerConfig[key] || 0);
      return Number.isFinite(value) ? value : 0;
    }

    function layerRoleExpected(layerConfig = {}, key) {
      if (!Object.prototype.hasOwnProperty.call(layerConfig || {}, key)) return true;
      const raw = layerConfig[key];
      if (raw === undefined || raw === null || raw === "") return true;
      return layerConfigCount(layerConfig, key) > 0;
    }

    function svgConfiguredImageRole(href, layerConfig = {}) {
      const list = (values) => values.flatMap((value) => Array.isArray(value) ? value : [value]).filter(Boolean);
      if (layerRoleExpected(layerConfig, "backgroundCount") && layerAssetMatches(href, list([layerConfig.backgroundUrl, layerConfig.backgroundSvgUrl, layerConfig.backgroundUrls]))) return "template-background";
      if (layerRoleExpected(layerConfig, "teamLogoCount") && layerAssetMatches(href, list([layerConfig.logoUrl, layerConfig.logoSvgUrl, layerConfig.logoUrls]))) return "template-team-name";
      if (layerRoleExpected(layerConfig, "clipartCount") && layerAssetMatches(href, list([layerConfig.clipartUrl, layerConfig.clipartSvgUrl, layerConfig.clipartUrls]))) return "template-clipart";
      if (layerRoleExpected(layerConfig, "playerIconCount") && layerAssetMatches(href, list([layerConfig.accessoryUrl, layerConfig.accessorySvgUrl, layerConfig.accessoryUrls]))) return "template-player-icon";
      return "";
    }

    function svgRoleFromSourceSummary(index, layerConfig = {}) {
      const entry = Array.isArray(layerConfig.sourceRoleSummary)
        ? layerConfig.sourceRoleSummary.find((item) => Number(item.index) === Number(index))
        : null;
      const role = String(entry && entry.role ? entry.role : "").toLowerCase();
      if (role === "background") return "template-background";
      if (role === "teamlogo" || role === "team-name" || role === "team_name") return "template-team-name";
      if (role === "clipart" || role === "mascot") return "template-clipart";
      if (role === "playericon" || role === "accessory" || role === "player-icon") return "template-player-icon";
      return "";
    }

    function classifySvgTemplateImages(imageEntries, layerConfig = {}) {
      imageEntries.forEach((entry) => {
        const configuredRole = svgRoleFromSourceSummary(entry.index, layerConfig) || svgConfiguredImageRole(entry.href, layerConfig);
        if (configuredRole) entry.role = configuredRole;
      });

      const hrefCounts = imageEntries.reduce((map, entry) => {
        if (entry.href) map.set(entry.href, (map.get(entry.href) || 0) + 1);
        return map;
      }, new Map());
      const background = imageEntries.find((entry) => entry.role === "template-background")
        || imageEntries.find((entry) => /background|locked/.test(entry.className))
        || imageEntries.slice().sort((a, b) => b.area - a.area)[0]
        || imageEntries[0];
      if (background) background.role = "template-background";

      const capRole = (role, key) => {
        if (!layerRoleExpected(layerConfig, key)) return;
        const expected = layerConfigCount(layerConfig, key);
        if (!expected) return;
        const entries = imageEntries
          .filter((entry) => entry.role === role && entry !== background)
          .sort((a, b) => b.area - a.area);
        entries.slice(expected).forEach((entry) => { entry.role = "svg-layer"; });
      };
      capRole("template-team-name", "teamLogoCount");
      capRole("template-clipart", "clipartCount");
      capRole("template-player-icon", "playerIconCount");

      const repeated = [...hrefCounts.entries()]
        .filter(([href, count]) => count > 1 && (!background || href !== background.href))
        .sort((a, b) => b[1] - a[1])[0];
      if (repeated) {
        imageEntries
          .filter((entry) => entry.href === repeated[0] && entry !== background && entry.role === "svg-layer")
          .forEach((entry) => { entry.role = "template-player-icon"; });
      }

      const artEntries = imageEntries
        .filter((entry) => entry.role === "svg-layer" && entry !== background)
        .sort((a, b) => b.area - a.area);
      if (layerRoleExpected(layerConfig, "teamLogoCount") && !imageEntries.some((entry) => entry.role === "template-team-name")) {
        const teamCandidate = artEntries
          .filter((entry) => entry.box.width / Math.max(1, entry.box.height) > 1.25)
          .sort((a, b) => (b.box.width / Math.max(1, b.box.height)) - (a.box.width / Math.max(1, a.box.height)))[0]
          || artEntries[1]
          || artEntries[0];
        if (teamCandidate) teamCandidate.role = "template-team-name";
      }
      const neededPlayerIcons = layerConfigCount(layerConfig, "playerTextCount") - imageEntries.filter((entry) => entry.role === "template-player-icon").length;
      if (neededPlayerIcons > 0 && layerConfigCount(layerConfig, "playerTextCount") >= 2) {
        const playerCandidates = imageEntries
          .filter((entry) => entry.role === "svg-layer" && entry !== background)
          .sort((a, b) => a.area - b.area);
        if (playerCandidates.length >= neededPlayerIcons) {
          playerCandidates
            .slice(0, neededPlayerIcons)
            .forEach((entry) => { entry.role = "template-player-icon"; });
        }
      }
      if (layerRoleExpected(layerConfig, "clipartCount")) {
        imageEntries
          .filter((entry) => entry.role === "svg-layer" && entry !== background)
          .forEach((entry) => { entry.role = "template-clipart"; });
      }
    }

    function parseSvgTemplateLayers(svgText, layerConfig = {}) {
      const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
      const svgRoot = doc.documentElement;
      if (!svgRoot || svgRoot.querySelector("parsererror")) return null;
      const viewBox = svgViewBox(svgRoot);
      const preserveAspectRatio = String(svgRoot.getAttribute("preserveAspectRatio") || "").trim().toLowerCase();
      const imageEntries = Array.from(svgRoot.querySelectorAll("image")).map((element, index) => {
        const href = element.getAttribute("href") || element.getAttribute("xlink:href") || "";
        const matrix = svgElementMatrix(element, svgRoot);
        const width = svgAttrNumber(element, "width", 1);
        const height = svgAttrNumber(element, "height", 1);
        const x = svgAttrNumber(element, "x", 0);
        const y = svgAttrNumber(element, "y", 0);
        const box = svgTransformedBox(matrix, x, y, width, height);
        return {
          tag: "image",
          index,
          href,
          className: String(element.getAttribute("class") || "").toLowerCase(),
          matrix,
          x,
          y,
          width,
          height,
          box,
          area: box.width * box.height,
          role: "svg-layer"
        };
      });
      classifySvgTemplateImages(imageEntries, layerConfig);

      let playerTextIndex = 0;
      let genericTextIndex = 0;
      const textEntries = Array.from(svgRoot.querySelectorAll("text")).flatMap((element) => {
        const text = compactWhitespace(element.textContent || "");
        if (!text) return [];
        const role = svgTextRole(text);
        if (role === "template-player-text") playerTextIndex += 1;
        else genericTextIndex += 1;
        const tspan = element.querySelector("tspan");
        const fontSize = svgAttrNumber(tspan, "font-size", svgAttrNumber(element, "font-size", 18));
        const x = svgAttrNumber(tspan || element, "x", svgAttrNumber(element, "x", 0))
          + svgAttrNumber(tspan || element, "dx", 0);
        const y = svgAttrNumber(tspan || element, "y", svgAttrNumber(element, "y", 0))
          + svgAttrNumber(tspan || element, "dy", 0);
        const width = Math.max(18, text.length * fontSize * 0.58);
        const height = fontSize * 1.25;
        const matrix = svgElementMatrix(element, svgRoot);
        const box = svgTransformedBox(matrix, x, y - fontSize, width, height);
        const anchor = svgTextAnchor(element, tspan);
        const anchorPoint = svgApplyMatrix(matrix, x, y - fontSize * 0.375);
        return [{
          tag: "text",
          text,
          role,
          playerNumber: role === "template-player-text" ? playerTextIndex : 0,
          textNumber: genericTextIndex,
          box,
          anchorPoint,
          originX: anchor.originX,
          textAlign: anchor.textAlign,
          fill: svgAttrValue(tspan, "fill", svgAttrValue(element, "fill", "#ffffff")),
          stroke: svgAttrValue(tspan, "stroke", svgAttrValue(element, "stroke", "#000000")),
          strokeWidth: svgAttrNumber(tspan, "stroke-width", svgAttrNumber(element, "stroke-width", 0.5)),
          fontFamily: svgAttrValue(tspan, "font-family", svgAttrValue(element, "font-family", "Impact")),
          fontSize: fontSize * Math.max(Math.abs(matrix[0]), Math.abs(matrix[3]), 0.1)
        }];
      });

      return { viewBox, imageEntries, textEntries, preserveAspectRatio };
    }

    async function loadCachedLayerImage(sourceUrl) {
      const resolvedUrl = canvasSafeImageUrl(sourceUrl, imageProxyEndpoint);
      if (imageElementCache.has(resolvedUrl)) return imageElementCache.get(resolvedUrl);
      const image = await loadImage(resolvedUrl);
      imageElementCache.set(resolvedUrl, image);
      return image;
    }

    async function addSvgTemplateImageLayer(entry, box, options, viewBox, placementContext) {
      const role = entry.role || "svg-layer";
      const preserveSvgAssets = Boolean(options && options.preserveSvgAssets);
      const layerConfig = options && options.layerConfig ? options.layerConfig : {};
      const roleRasterUrl = role === "template-background"
        ? layerConfig.backgroundUrl
        : role === "template-team-name"
          ? layerConfig.logoUrl
          : role === "template-clipart"
            ? layerConfig.clipartUrl
            : role === "template-player-icon"
              ? layerConfig.accessoryUrl
              : "";
      const roleSvgUrl = role === "template-background"
        ? layerConfig.backgroundSvgUrl
        : role === "template-team-name"
          ? layerConfig.logoSvgUrl
          : role === "template-clipart"
            ? layerConfig.clipartSvgUrl
            : role === "template-player-icon"
              ? layerConfig.accessorySvgUrl
              : "";
      const explicitAsset = preserveSvgAssets ? null : role === "template-background"
        ? explicitGeneratorAsset("background", defaultCategoryForShape(ARTBOARD_SHAPE))
        : role === "template-team-name"
          ? explicitGeneratorAsset("teamName", "Team name")
          : role === "template-clipart"
            ? explicitGeneratorAsset("clipart", "Clip art")
            : role === "template-player-icon"
              ? explicitGeneratorAsset("accessory", "Accessory")
              : null;
      const sourceUrl = (explicitAsset && explicitAsset.url) || (preserveSvgAssets && entry.href) || roleSvgUrl || entry.href;
      if (!sourceUrl) return null;
      const fallbackUrls = preserveSvgAssets
        ? [entry.href, roleSvgUrl, roleRasterUrl].filter(Boolean)
        : [roleSvgUrl, roleRasterUrl, entry.href].filter(Boolean);
      let image;
      let finalSourceUrl = sourceUrl;
      try {
        image = await loadCachedLayerImage(sourceUrl);
      } catch (error) {
        let fallbackError = error;
        for (const fallbackUrl of fallbackUrls) {
          if (!fallbackUrl || fallbackUrl === sourceUrl) continue;
          try {
            image = await loadCachedLayerImage(fallbackUrl);
            finalSourceUrl = fallbackUrl;
            fallbackError = null;
            break;
          } catch (nextError) {
            fallbackError = nextError;
          }
        }
        if (fallbackError) throw fallbackError;
      }
      const naturalWidth = image.naturalWidth || image.width || 1;
      const naturalHeight = image.naturalHeight || image.height || 1;
      const name = role === "template-background"
        ? "Background"
        : role === "template-team-name"
          ? "Team name / logo"
          : role === "template-clipart"
            ? "Clip art"
            : role === "template-player-icon"
              ? "Accessory / Player icon"
              : "SVG image layer";
      const coverBackground = role === "template-background" && !preserveSvgAssets;
      const placement = coverBackground ? fitImageToArtboard(naturalWidth, naturalHeight, backgroundFitMode()) : null;
      const layer = new fabric.Image(image, {
        left: placement ? placement.left : box.left,
        top: placement ? placement.top : box.top,
        width: naturalWidth,
        height: naturalHeight,
        originX: "left",
        originY: "top",
        scaleX: placement ? placement.scaleX : box.width / naturalWidth,
        scaleY: placement ? placement.scaleY : box.height / naturalHeight,
        data: {
          ...assetMetadata(explicitAsset || { name, category: "", url: sourceUrl }),
          name,
          role,
          sourceUrl: finalSourceUrl,
          source: explicitAsset ? "generator-selected-asset" : finalSourceUrl === sourceUrl ? "svg-template-asset" : "svg-template-asset-fallback",
          showInLayerList: true,
          locked: role === "template-background"
        }
      });
      layer.set({
        width: naturalWidth,
        height: naturalHeight
      });
      if (!placement && viewBox && placementContext && entry.matrix) {
        applyCanvasMatrixToImage(
          layer,
          svgImageMatrixToCanvas(entry, viewBox, placementContext, naturalWidth, naturalHeight),
          naturalWidth,
          naturalHeight
        );
      }
      ensureLayerId(layer);
      canvas.add(layer);
      if (role === "template-background") setObjectLocked(layer, true);
      return layer;
    }

    function addSvgTemplateTextLayer(entry, box, options, viewBox, placement) {
      if (entry.role === "template-player-text" && entry.playerNumber > options.playerCount) return null;
      const text = entry.role === "template-player-text"
        ? playerNameForNumber(options, entry.playerNumber || 1)
        : svgReplacementText(entry.text, options);
      const anchor = entry.anchorPoint && viewBox && placement
        ? svgPointToCanvas(entry.anchorPoint, viewBox, placement)
        : null;
      const layer = addTemplateText({
        text,
        name: svgTextName(entry.text, entry.role, entry.playerNumber || entry.textNumber || 1),
        role: entry.role,
        left: anchor ? anchor.left : box.centerX,
        top: anchor ? anchor.top : box.centerY,
        originX: entry.originX || "center",
        textAlign: entry.textAlign || "center",
        fontSize: Math.max(14, Math.round(entry.fontSize * box.height / Math.max(1, entry.box.height))),
        fill: entry.fill,
        stroke: entry.stroke,
        strokeWidth: Math.max(0, entry.strokeWidth * box.height / Math.max(1, entry.box.height)),
        fontFamily: entry.fontFamily,
        shadow: entry.role === "template-player-text" ? "1px 1px 0 rgba(0,0,0,.35)" : "none"
      });
      return layer;
    }

    async function addSvgTemplateRecipeLayers(svgTemplate, options = generatorOptions()) {
      if (!svgTemplate || !svgTemplate.url) return false;
      try {
        const response = await fetch(resolveSourceUrl(svgTemplate.url), { credentials: "omit" });
        if (!response.ok) throw new Error("SVG template failed to load.");
        const parsed = parseSvgTemplateLayers(await response.text(), options.layerConfig || {});
        if (!parsed || !parsed.imageEntries.length) return false;
        const placement = svgTemplatePlacement(parsed.viewBox, {
          ...options,
          preserveAspectRatio: parsed.preserveAspectRatio
        });
        const sourcePlayerCount = Math.max(
          parsed.imageEntries.filter((entry) => entry.role === "template-player-icon").length,
          parsed.textEntries.filter((entry) => entry.role === "template-player-text").length
        );
        const playerCount = options.preserveSvgAssets
          ? Math.max(Number(options.playerCount || 0), sourcePlayerCount)
          : Number(options.playerCount || 0);
        const effectiveOptions = { ...options, playerCount };
        let addedPlayerIcons = 0;
        for (const entry of parsed.imageEntries) {
          if (entry.role === "template-player-icon") {
            addedPlayerIcons += 1;
            if (addedPlayerIcons > playerCount) continue;
          }
          try {
            await addSvgTemplateImageLayer(entry, svgBoxToCanvas(entry.box, parsed.viewBox, placement), effectiveOptions, parsed.viewBox, placement);
          } catch (error) {
            console.warn("Could not load source SVG image layer", entry.href, error);
          }
        }
        parsed.textEntries.forEach((entry) => {
          addSvgTemplateTextLayer(entry, svgBoxToCanvas(entry.box, parsed.viewBox, placement), effectiveOptions, parsed.viewBox, placement);
        });
        const background = canvas.getObjects().find((obj) => obj.data && obj.data.role === "template-background");
        if (background) background.sendToBack();
        return visibleLayerObjects().length > 0;
      } catch (error) {
        return false;
      }
    }

    function generatorPlayerSlots(count, shape) {
      const slots = [];
      const capped = Math.max(1, Math.min(20, count));
      if (isRectangularShape(shape)) {
        const cols = capped <= 4 ? capped : capped <= 8 ? 4 : capped <= 15 ? 5 : 5;
        const rows = Math.ceil(capped / cols);
        const xMin = 0.16;
        const xMax = 0.86;
        const yMin = shape === "polepocket" ? 0.36 : 0.38;
        const yMax = shape === "polepocket" ? 0.74 : 0.82;
        for (let index = 0; index < capped; index += 1) {
          const row = Math.floor(index / cols);
          const col = index % cols;
          const itemsInRow = row === rows - 1 ? capped - row * cols || cols : cols;
          const xStep = itemsInRow > 1 ? (xMax - xMin) / (itemsInRow - 1) : 0;
          const yStep = rows > 1 ? (yMax - yMin) / (rows - 1) : 0;
          slots.push({
            x: itemsInRow > 1 ? xMin + col * xStep : 0.5,
            y: rows > 1 ? yMin + row * yStep : 0.56,
            iconWidth: Math.max(0.052, Math.min(0.095, 0.46 / Math.max(cols, 1))),
            iconHeight: Math.max(0.07, Math.min(0.12, 0.36 / Math.max(rows, 1))),
            textOffset: Math.max(0.05, Math.min(0.075, 0.24 / Math.max(rows, 1)))
          });
        }
        return slots;
      }

      const cols = capped <= 3 ? capped : capped <= 8 ? 3 : 4;
      const rows = Math.ceil(capped / cols);
      const yMin = isHomePlateShape(shape) ? 0.24 : 0.26;
      const yMax = isHomePlateShape(shape) ? 0.76 : 0.7;
      for (let index = 0; index < capped; index += 1) {
        const row = Math.floor(index / cols);
        const col = index % cols;
        const y = rows > 1 ? yMin + row * ((yMax - yMin) / (rows - 1)) : 0.48;
        const rowWidth = isHomePlateShape(shape)
          ? (y < 0.56 ? 0.66 : Math.max(0.22, 0.66 - (y - 0.56) * 1.55))
          : Math.max(0.18, 0.74 * (1 - y * 0.74));
        const itemsInRow = row === rows - 1 ? capped - row * cols || cols : cols;
        const xStart = 0.5 - rowWidth / 2;
        const xStep = itemsInRow > 1 ? rowWidth / (itemsInRow - 1) : 0;
        slots.push({
          x: itemsInRow > 1 ? xStart + col * xStep : 0.5,
          y,
          iconWidth: Math.max(0.07, Math.min(0.14, rowWidth / Math.max(itemsInRow * 1.8, 1))),
          iconHeight: 0.1,
          textOffset: 0.075
        });
      }
      return slots;
    }

    function generatedHeaderFields(options) {
      const fields = [
        options.manager ? { text: `Team Manager: ${options.manager}`, name: "Team manager" } : null,
        options.assistantManager ? { text: `Asst. Manager: ${options.assistantManager}`, name: "Assistant manager" } : null,
        { text: `Coach: ${options.coach || "Coach's name"}`, name: "Coach name" },
        options.assistantCoach ? { text: `Asst. Coach: ${options.assistantCoach}`, name: "Assistant coach" } : null,
        { text: `Team mom: ${options.teamMom || "Team mom's name"}`, name: "Team mom name" },
        options.sponsor ? { text: `Sponsor: ${options.sponsor}`, name: "Team sponsor" } : null
      ].filter(Boolean);
      return fields.slice(0, 6);
    }

    function addGeneratedHeaderText(options) {
      const fields = generatedHeaderFields(options);
      if (!fields.length) return;
      const rows = fields.length > 3 ? 2 : 1;
      const perRow = Math.ceil(fields.length / rows);
      fields.forEach((field, index) => {
        const row = Math.floor(index / perRow);
        const rowItems = fields.slice(row * perRow, row * perRow + perRow);
        const col = index - row * perRow;
        const x = rowItems.length > 1 ? 0.14 + (0.72 / (rowItems.length - 1)) * col : 0.5;
        const y = isRectangularShape(ARTBOARD_SHAPE)
          ? 0.075 + row * 0.07
          : 0.15 + row * 0.075;
        const point = recipePoint(x, y);
        addTemplateText({
          text: field.text,
          name: field.name,
          role: "template-text-layer",
          left: point.left,
          top: point.top,
          fontSize: artboardTextSize(isRectangularShape(ARTBOARD_SHAPE) ? 0.042 : 0.052, 22),
          fill: "#ffffff",
          stroke: "#1E3A8A",
          strokeWidth: 2,
          shadow: "1px 1px 0 rgba(0,0,0,.35)"
        });
      });
    }

    async function addGeneratedTeamName(options) {
      const point = recipePoint(0.5, isRectangularShape(ARTBOARD_SHAPE) ? 0.23 : 0.32);
      const asset = selectedGeneratorAsset("teamName", "Team name", { sport: options.sport, terms: [options.team] });
      if (asset) {
        const layer = await addAssetImageLayer(asset, {
          name: "Team name",
          role: "template-team-name",
          left: point.left,
          top: point.top,
          widthRatio: isRectangularShape(ARTBOARD_SHAPE) ? 0.42 : 0.52,
          heightRatio: isRectangularShape(ARTBOARD_SHAPE) ? 0.18 : 0.2
        });
        if (layer) return layer;
      }
      const layer = addTemplateText({
        text: options.team || "TEAM NAME",
        name: "Team name",
        role: "template-team-name",
        left: point.left,
        top: point.top,
        fontSize: artboardTextSize(isRectangularShape(ARTBOARD_SHAPE) ? 0.11 : 0.12, 44),
        fill: "#ffffff",
        stroke: "#1E3A8A",
        strokeWidth: 5,
        shadow: "2px 2px 0 rgba(0,0,0,.35)"
      });
      layer.set({ textAlign: "center" });
      return layer;
    }

    async function addGeneratedClipart(options) {
      const asset = selectedGeneratorAsset("clipart", "Clip art", { sport: options.sport, terms: [options.team] });
      if (!asset) return null;
      const point = recipePoint(
        isRectangularShape(ARTBOARD_SHAPE) ? 0.24 : 0.5,
        isRectangularShape(ARTBOARD_SHAPE) ? 0.58 : 0.55
      );
      return addAssetImageLayer(asset, {
        name: "Clip art",
        role: "template-clipart",
        left: point.left,
        top: point.top,
        widthRatio: isRectangularShape(ARTBOARD_SHAPE) ? 0.25 : 0.32,
        heightRatio: isRectangularShape(ARTBOARD_SHAPE) ? 0.42 : 0.26
      });
    }

    function addGeneratedPlaceholderIcon(slot, number) {
      const point = recipePoint(slot.x, slot.y);
      const radius = Math.max(18, artboardRatioWidth(slot.iconWidth) / 2);
      const icon = new fabric.Circle({
        left: point.left,
        top: point.top,
        originX: "center",
        originY: "center",
        radius,
        fill: "#ffffff",
        stroke: "#1E3A8A",
        strokeWidth: 5,
        data: {
          name: `Player icon ${number}`,
          role: "template-player-icon",
          showInLayerList: true
        }
      });
      ensureLayerId(icon);
      canvas.add(icon);
      return icon;
    }

    async function addGeneratedPlayerLayers(options) {
      const accessory = selectedGeneratorAsset("accessory", "Accessory", { sport: options.sport });
      const slots = generatorPlayerSlots(options.playerCount, ARTBOARD_SHAPE);
      for (const [index, slot] of slots.entries()) {
        const number = index + 1;
        const point = recipePoint(slot.x, slot.y);
        if (accessory) {
          const icon = await addAssetImageLayer(accessory, {
            name: `Player icon ${number}`,
            role: "template-player-icon",
            left: point.left,
            top: point.top,
            widthRatio: slot.iconWidth,
            heightRatio: slot.iconHeight
          });
          if (!icon) addGeneratedPlaceholderIcon(slot, number);
        } else {
          addGeneratedPlaceholderIcon(slot, number);
        }

        const textPoint = recipePoint(slot.x, Math.min(0.9, slot.y + slot.textOffset));
        addTemplateText({
          text: playerNameForNumber(options, number),
          name: `Player text ${number}`,
          role: "template-player-text",
          left: textPoint.left,
          top: textPoint.top,
          fontSize: artboardTextSize(isRectangularShape(ARTBOARD_SHAPE) ? 0.045 : 0.065, 22),
          fill: "#ffffff",
          stroke: "#1E3A8A",
          strokeWidth: 3,
          shadow: "1px 1px 0 rgba(0,0,0,.35)"
        });
      }
    }

    function updateGeneratorPreview(options, svgTemplate) {
      generatedTemplateMeta = `${options.playerCount} players · ${templateSportLabel(options.sport)} · ${templateTypeLabel(options.shape)}${svgTemplate ? ` · ${svgTemplateDisplayName(svgTemplate)}` : ""}`;
      if (els.generatorPreviewImage) els.generatorPreviewImage.src = exportDesign(0.25).image;
      if (els.generatorPreviewMeta) els.generatorPreviewMeta.textContent = generatedTemplateMeta;
      if (els.generatorPreviewBox) els.generatorPreviewBox.hidden = false;
    }

    function clearGeneratorPreviewState(optionsChanged = true) {
      if (els.generatorPreviewBox) els.generatorPreviewBox.hidden = true;
      if (optionsChanged) {
        generatorAllPreviewItems = [];
        if (els.generatorAllPreviews) {
          els.generatorAllPreviews.hidden = true;
          els.generatorAllPreviews.innerHTML = "";
        }
      }
    }

    function setGeneratorButtonsBusy(isBusy) {
      generatorPreviewBusy = isBusy;
      [els.generatorPreview, els.generatorPreviewAll, els.generatorDesign, els.generatorClear].forEach((button) => {
        if (button) button.disabled = isBusy;
      });
    }

    function captureGeneratorDesignerState() {
      return {
        json: canvas.toJSON(["excludeFromExport", "data"]),
        shape: ARTBOARD_SHAPE,
        width: WIDTH,
        height: HEIGHT,
        backgroundColor: canvas.backgroundColor,
        activeCategory,
        assetPage,
        history: history.slice(),
        historyIndex,
        launch: { ...launch }
      };
    }

    async function restoreGeneratorDesignerState(state) {
      if (!state) return;
      ARTBOARD_SHAPE = state.shape;
      WIDTH = state.width;
      HEIGHT = state.height;
      canvasEl.width = WIDTH;
      canvasEl.height = HEIGHT;
      canvas.setWidth(WIDTH);
      canvas.setHeight(HEIGHT);
      activeCategory = state.activeCategory;
      assetPage = state.assetPage;
      Object.keys(launch).forEach((key) => {
        if (!(key in state.launch)) delete launch[key];
      });
      Object.assign(launch, state.launch);
      isRestoring = true;
      await loadCanvasJson(state.json);
      canvas.backgroundColor = state.backgroundColor;
      canvas.clipPath = makeClipPath();
      applyLayerLockStateToAll();
      teamText = canvas.getObjects().find((obj) => obj.data && obj.data.role === "team-text") || null;
      history = state.history.slice();
      historyIndex = state.historyIndex;
      isRestoring = false;
      drawGuide();
      canvas.renderAll();
      syncProductInfo();
      renderCategories();
      renderAssets();
      updateHistoryButtons();
      updateSelectionControls();
      updateStageScale();
    }

    function renderGeneratorAllPreviews() {
      if (!els.generatorAllPreviews) return;
      if (!generatorAllPreviewItems.length) {
        els.generatorAllPreviews.hidden = true;
        els.generatorAllPreviews.innerHTML = "";
        return;
      }
      const selected = els.generatorSvg && els.generatorSvg.value;
      const cards = generatorAllPreviewItems.map((item) => `
        <button class="tbd__template-generator-all-card" type="button" data-tbd-generator-preview-layout="${escapeHtml(item.value)}" aria-current="${selected === item.value ? "true" : "false"}">
          <img alt="${escapeHtml(item.title)} preview" src="${item.image}">
          <strong>${escapeHtml(item.title)}</strong>
          <span>${escapeHtml(item.meta)}</span>
        </button>
      `).join("");
      els.generatorAllPreviews.innerHTML = `
        <div class="tbd__template-generator-all-head">Generated layout previews</div>
        <div class="tbd__template-generator-all-grid">${cards}</div>
      `;
      els.generatorAllPreviews.hidden = false;
      els.generatorAllPreviews.querySelectorAll("[data-tbd-generator-preview-layout]").forEach((button) => {
        button.addEventListener("click", () => {
          const value = button.dataset.tbdGeneratorPreviewLayout || "";
          const item = generatorAllPreviewItems.find((preview) => preview.value === value);
          if (!item) return;
          if (els.generatorSvg) els.generatorSvg.value = value;
          if (els.generatorPreviewImage) els.generatorPreviewImage.src = item.image;
          if (els.generatorPreviewMeta) els.generatorPreviewMeta.textContent = item.meta;
          if (els.generatorPreviewBox) els.generatorPreviewBox.hidden = false;
          generatedTemplateMeta = item.meta;
          renderGeneratorLayoutOptions(generatorOptions());
          renderGeneratorAllPreviews();
          setStatus(`${item.title} preview selected. Tap Use This Design to place it on the canvas.`);
        });
      });
    }

    async function applyGeneratedTemplate(options = generatorOptions(), behavior = {}) {
      const svgTemplate = behavior.svgTemplate || selectedGeneratorSvgTemplate(options);
      projectRestoreToken += 1;
      configureGeneratedArtboard(options, svgTemplate);
      resetCanvas("#ffffff");
      const usedSvgRecipe = await addSvgTemplateRecipeLayers(svgTemplate, options);
      if (!usedSvgRecipe) {
        await addGeneratedBackgroundLayer(options);
        await addSvgLayoutGuide(svgTemplate);
        addGeneratedHeaderText(options);
        await addGeneratedTeamName(options);
        await addGeneratedClipart(options);
        await addGeneratedPlayerLayers(options);
      }
      const selectable = visibleLayerObjects().filter((obj) => !isLayerLocked(obj));
      if (selectable.length) canvas.setActiveObject(selectable[selectable.length - 1]);
      keepGuideOnTop();
      canvas.renderAll();
      if (!behavior.skipHistory) {
        history = [];
        historyIndex = -1;
        saveHistory();
      }
      updateSelectionControls();
      updateStageScale();
      if (!behavior.skipPreview) updateGeneratorPreview(options, svgTemplate);
      if (!behavior.skipStatus) {
        setStatus(usedSvgRecipe
          ? `Generated editable SVG product-quality layers from ${svgTemplateDisplayName(svgTemplate)}.`
          : `Generated ${options.playerCount} editable player layers from ${svgTemplateDisplayName(svgTemplate)}.`);
      }
      if (behavior.closePanel && root.dataset.activePanel === "templates") togglePanel("templates");
    }

    async function previewAllGeneratedLayouts() {
      if (generatorPreviewBusy) return;
      const options = generatorOptions();
      const candidates = generatorSvgCandidates(options).slice(0, 12);
      if (!candidates.length) {
        setStatus("No layout SVGs found for this player count.");
        return;
      }
      const savedState = captureGeneratorDesignerState();
      const previousSvgValue = els.generatorSvg && els.generatorSvg.value;
      setGeneratorButtonsBusy(true);
      if (els.generatorPreviewAll) els.generatorPreviewAll.textContent = "Generating...";
      setStatus(`Pre-loading ${candidates.length} layout previews...`);
      const previews = [];
      try {
        for (const [index, svgTemplate] of candidates.entries()) {
          if (els.generatorPreviewAll) els.generatorPreviewAll.textContent = `Generating ${index + 1}/${candidates.length}`;
          await applyGeneratedTemplate(options, {
            svgTemplate,
            skipHistory: true,
            skipPreview: true,
            skipStatus: true
          });
          const title = svgTemplateDisplayName(svgTemplate);
          previews.push({
            title,
            value: svgTemplate.url || svgTemplate.name || "",
            image: exportDesign(0.22).image,
            meta: `${options.playerCount} players · ${templateSportLabel(options.sport)} · ${templateTypeLabel(options.shape)} · ${title}`
          });
        }
      } finally {
        await restoreGeneratorDesignerState(savedState);
        if (els.generatorSvg) els.generatorSvg.value = previousSvgValue || "";
        if (els.generatorPreviewAll) els.generatorPreviewAll.textContent = "Preview All Layouts";
        setGeneratorButtonsBusy(false);
      }
      generatorAllPreviewItems = previews;
      renderGeneratorLayoutOptions(generatorOptions());
      renderGeneratorAllPreviews();
      if (previews[0]) {
        if (els.generatorSvg) els.generatorSvg.value = previews[0].value;
        if (els.generatorPreviewImage) els.generatorPreviewImage.src = previews[0].image;
        if (els.generatorPreviewMeta) els.generatorPreviewMeta.textContent = previews[0].meta;
        if (els.generatorPreviewBox) els.generatorPreviewBox.hidden = false;
        generatedTemplateMeta = previews[0].meta;
        renderGeneratorLayoutOptions(generatorOptions());
        renderGeneratorAllPreviews();
      }
      setStatus(`Generated ${previews.length} layout previews. Choose one, then tap Use This Design.`);
    }

    function createAssetDragGhost(asset) {
      const ghost = document.createElement("div");
      ghost.className = "tbd__drag-ghost";
      ghost.innerHTML = `<img alt="" src="${asset.url}"><span>${escapeHtml(asset.name || "Asset")}</span>`;
      document.body.appendChild(ghost);
      return ghost;
    }

    function positionAssetDragGhost(state) {
      if (!state.ghost) return;
      state.ghost.style.left = `${state.x + 12}px`;
      state.ghost.style.top = `${state.y + 12}px`;
    }

    function parseDroppedAsset(event) {
      const raw = event.dataTransfer.getData("application/x-team-banner-asset")
        || event.dataTransfer.getData("text/plain");
      if (!raw) return null;
      try {
        const asset = JSON.parse(raw);
        return asset && asset.url ? asset : null;
      } catch (error) {
        return null;
      }
    }

    async function loadAssetManifest() {
      const url = launch.assetManifestUrl || root.dataset.assetsUrl;
      if (!url) {
        assets = FALLBACK_ASSETS;
        return;
      }
      try {
        const response = await fetch(url, { credentials: "omit" });
        if (!response.ok) throw new Error("Asset manifest request failed");
        const data = await response.json();
        assets = (Array.isArray(data.assets) ? data.assets : data).map(normalizeAsset);
        renderGeneratorOptionPanels();
        setStatus(`${assets.length} assets loaded.`);
      } catch (error) {
        assets = FALLBACK_ASSETS;
        activeCategory = defaultCategoryForShape(ARTBOARD_SHAPE);
        assetPage = 1;
        renderGeneratorOptionPanels();
        setStatus("Using fallback assets. Check the manifest URL.");
      }
    }

    function exportDesign(multiplier) {
      return withoutGuide(() => ({
        json: canvas.toJSON(["excludeFromExport", "data"]),
        image: canvas.toDataURL({ format: "png", multiplier: multiplier || 1.25 })
      }));
    }

    function exportProject() {
      const jsonExporter = typeof canvas.toDatalessJSON === "function"
        ? canvas.toDatalessJSON.bind(canvas)
        : canvas.toJSON.bind(canvas);
      return withoutGuide(() => ({
        app: "team-banner-designer",
        version: 1,
        savedAt: new Date().toISOString(),
        artboard: {
          width: WIDTH,
          height: HEIGHT,
          shape: ARTBOARD_SHAPE,
          backgroundColor: canvas.backgroundColor || "#ffffff"
        },
        product: {
          title: launch.title || "",
          handle: launch.handle || "",
          headline: launch.headline || "",
          sizeLabel: launch.sizeLabel || defaultSizeForShape(ARTBOARD_SHAPE),
          price: launch.price || defaultPriceForShape(ARTBOARD_SHAPE),
          tags: launch.tags || "",
          collections: launch.collections || ""
        },
        teamName: (els.team && els.team.value) || "",
        canvas: jsonExporter(["excludeFromExport", "data"])
      }));
    }

    function compactProjectJson(project) {
      return JSON.stringify(project);
    }

    function projectFileName() {
      const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
      const title = String(launch.handle || launch.title || "team-banner")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40) || "team-banner";
      return `${title}-${stamp}.tsbd`;
    }

    async function projectBlobFromText(text) {
      const raw = new Blob([text], { type: "application/json" });
      if (!window.CompressionStream) return { blob: raw, compressed: false };
      const stream = raw.stream().pipeThrough(new CompressionStream("gzip"));
      return { blob: await new Response(stream).blob(), compressed: true };
    }

    function downloadBlobFile(filename, blob) {
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.download = filename;
      link.href = url;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      return blob.size;
    }

    async function downloadProjectFile() {
      try {
        const payload = compactProjectJson(exportProject());
        const { blob, compressed } = await projectBlobFromText(payload);
        const bytes = downloadBlobFile(projectFileName(), blob);
        const size = bytes < 1024 ? `${bytes} B` : `${Math.ceil(bytes / 1024)} KB`;
        if (els.savedMeta) els.savedMeta.textContent = `Editable design file saved (${size}${compressed ? ", compressed" : ""}). Upload it later to continue editing.`;
        setStatus(`Editable design file downloaded (${size}).`);
      } catch (error) {
        setStatus("Could not save editable file. Try again after the artwork finishes loading.");
      }
    }

    async function saveDesign() {
      const saveUrl = root.dataset.saveUrl;
      const design = exportDesign(1);
      const localId = `design_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      try {
        window.localStorage.setItem(`team-banner-design:${localId}`, JSON.stringify(design.json));
      } catch (error) {
        // Local storage is a convenience for the MVP. The API save below is the source of truth when configured.
      }

      if (els.preview) els.preview.src = design.image;
      if (!saveUrl) return { id: localId, previewUrl: "", jsonUrl: "", proofImage: design.image };

      const response = await fetch(saveUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(design)
      });
      if (!response.ok) throw new Error("Design save failed");
      const saved = await response.json();
      return { ...saved, proofImage: design.image };
    }

    function currentCartVariantId() {
      const selectors = [
        'product-info form[action*="/cart/add"] input[name="id"]',
        'form[action*="/cart/add"] input[name="id"]',
        'input[name="id"][form^="product-form"]'
      ];
      for (const selector of selectors) {
        const input = document.querySelector(selector);
        if (input && input.value) return input.value;
      }
      return cartVariantId;
    }

    function checkoutUrlWithDesignAttributes(checkoutUrl, saved) {
      try {
        const url = new URL(checkoutUrl, SHOPIFY_STORE_ORIGIN);
        const attributes = {
          "Design ID": saved && saved.id,
          "Design Preview": saved && saved.previewUrl,
          "Editable Design": saved && saved.jsonUrl,
          "Source Product": launch.title || "",
          "Source Handle": launch.handle || ""
        };
        Object.entries(attributes).forEach(([key, value]) => {
          if (value) url.searchParams.set(`attributes[${key}]`, value);
        });
        return url.href;
      } catch (error) {
        return checkoutUrl;
      }
    }

    async function sendProofEmail(saved, checkoutUrl) {
      if (!proofEmailEndpoint) return { skipped: true };
      const payload = {
        designId: saved && saved.id,
        previewUrl: saved && saved.previewUrl,
        jsonUrl: saved && saved.jsonUrl,
        proofImage: saved && !saved.previewUrl ? saved.proofImage : "",
        productTitle: launch.title || "",
        productHandle: launch.handle || "",
        productUrl: launch.productUrl || "",
        productImage: launch.image || "",
        teamName: (els.team && els.team.value) || "",
        checkoutUrl,
        to: proofEmailTo
      };
      const response = await fetch(proofEmailEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Proof email failed");
      return result;
    }

    function loadDesignCart() {
      try {
        const parsed = JSON.parse(window.localStorage.getItem(designCartStorageKey) || "[]");
        return Array.isArray(parsed) ? parsed.filter((item) => item && item.id && item.variantId).slice(-30) : [];
      } catch (error) {
        return [];
      }
    }

    function persistDesignCart() {
      try {
        window.localStorage.setItem(designCartStorageKey, JSON.stringify(designCart));
      } catch (error) {
        // If local storage is full, the visible cart still works for the current session.
      }
    }

    function cartLineUrl(items = designCart) {
      const counts = items.reduce((map, item) => {
        const id = String(item.variantId || "").trim();
        if (!id) return map;
        map.set(id, (map.get(id) || 0) + 1);
        return map;
      }, new Map());
      const lines = [...counts.entries()].map(([id, quantity]) => `${encodeURIComponent(id)}:${quantity}`).join(",");
      return `${SHOPIFY_STORE_ORIGIN}/cart/${lines || `${DEFAULT_CUSTOM_DESIGN_VARIANT_ID}:1`}?return_to=/checkout`;
    }

    function redirectToShopifyCheckout() {
      if (!designCart.length) {
        setStatus("Add a design to cart first.");
        return;
      }
      const checkoutUrl = cartLineUrl(designCart);
      setStatus("Opening Shopify checkout...");
      window.location.assign(checkoutUrl);
    }

    function setCartPanelOpen(open = true) {
      if (open) {
        root.dataset.activePanel = "cart";
        root.classList.add("tbd--panel-open", "tbd--panel-cart");
        ["assets", "templates", "text", "properties", "layers", "inspector"].forEach((name) => {
          root.classList.remove(`tbd--panel-${name}`);
        });
        root.querySelectorAll("[data-tbd-panel]").forEach((panel) => {
          panel.hidden = panel.dataset.tbdPanel !== "cart";
        });
      } else if (root.dataset.activePanel === "cart") {
        togglePanel("cart");
      }
      updateStageScale();
    }

    function renderDesignCart() {
      const count = designCart.length;
      if (els.cartCount) {
        els.cartCount.textContent = String(count);
        els.cartCount.hidden = count === 0;
      }
      if (els.cartEmpty) els.cartEmpty.hidden = count > 0;
      if (els.cartSummary) {
        els.cartSummary.textContent = count === 1 ? "1 item in cart" : `${count} items in cart`;
        els.cartSummary.hidden = count === 0;
      }
      if (els.cartCheckout) els.cartCheckout.disabled = count === 0;
      if (!els.cartItems) return;
      els.cartItems.innerHTML = "";
      designCart.slice().reverse().forEach((item, reverseIndex) => {
        const row = document.createElement("article");
        row.className = "tbd__cart-item";
        row.dataset.cartItemId = item.id;
        const itemNumber = count - reverseIndex;
        const preview = item.previewUrl || item.proofImage || "";
        row.innerHTML = `
          <div class="tbd__cart-thumb">${preview ? `<img src="${preview}" alt="">` : "<span>Saved</span>"}</div>
          <div class="tbd__cart-copy">
            <span class="tbd__cart-item-number">Item ${itemNumber}</span>
            <strong>${escapeHtml(item.title || "Custom banner design")}</strong>
            <span>${escapeHtml(item.shapeLabel || item.shape || "Banner")} · ${escapeHtml(item.designId || item.id)}</span>
          </div>
          <button class="tbd__cart-remove" type="button" aria-label="Remove saved design">Remove</button>
        `;
        row.querySelector(".tbd__cart-remove")?.addEventListener("click", () => {
          designCart = designCart.filter((cartItem) => cartItem.id !== item.id);
          persistDesignCart();
          renderDesignCart();
          setStatus("Removed design from cart.");
        });
        els.cartItems.appendChild(row);
      });
    }

    async function addCurrentDesignToToolCart() {
      setStatus("Saving design to cart...");

      try {
        const saved = await saveDesign();
        const variantId = currentCustomDesignVariantId() || currentCartVariantId();
        if (!variantId) throw new Error("No custom design variant selected");
        const item = {
          id: `cart_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          designId: saved.id || "",
          previewUrl: saved.previewUrl || "",
          jsonUrl: saved.jsonUrl || "",
          proofImage: saved.previewUrl ? "" : (String(saved.proofImage || "").length < 180000 ? saved.proofImage : ""),
          variantId: String(variantId),
          shape: ARTBOARD_SHAPE,
          shapeLabel: defaultHeadlineForShape(ARTBOARD_SHAPE),
          title: launch.title || "Custom banner design",
          handle: launch.handle || "",
          teamName: (els.team && els.team.value) || "",
          addedAt: new Date().toISOString()
        };
        designCart = [...designCart, item].slice(-30);
        persistDesignCart();
        renderDesignCart();
        const checkoutUrl = checkoutUrlWithDesignAttributes(cartLineUrl(designCart), saved);
        setStatus("Sending proof email...");
        await sendProofEmail(saved, checkoutUrl);
        setCartPanelOpen(true);
        setStatus(`Added design to cart. ${designCart.length} saved design${designCart.length === 1 ? "" : "s"} ready.`);
      } catch (error) {
        setStatus("Could not save this design to cart. Try Save editable file, then try Add To Cart again.");
      }
    }

    async function saveOrAddToCart() {
      await addCurrentDesignToToolCart();
    }

    function downloadProof() {
      try {
        const link = document.createElement("a");
        link.download = "team-banner-proof.png";
        link.href = exportDesign(1).image;
        link.click();
        setStatus("Proof downloaded.");
      } catch (error) {
        setStatus("Could not export. Check that the selected asset allows image export.");
      }
    }

    function cloneCanvasObject(obj) {
      return new Promise((resolve) => obj.clone((clone) => resolve(clone), ["data"]));
    }

    async function duplicateSelected() {
      const selected = activeEditableObjects();
      if (!selected.length) {
        const locked = selectedObject();
        if (locked && isLayerLocked(locked)) return setStatus(`${layerLabel(locked)} is locked. Unlock it before duplicating.`);
        return setStatus("Select an item to duplicate.");
      }

      canvas.discardActiveObject();
      const clones = [];
      for (const obj of selected) {
        const clone = await cloneCanvasObject(obj);
        const copyData = { ...(obj.data || {}) };
        if (copyData.role === "team-text") delete copyData.role;
        delete copyData.locked;
        copyData.name = `${layerLabel(obj)} copy`;
        clone.set({
          left: obj.left || 0,
          top: obj.top || 0,
          data: copyData,
          selectable: true,
          evented: true,
          lockMovementX: false,
          lockMovementY: false,
          lockScalingX: false,
          lockScalingY: false,
          lockRotation: false,
          hasControls: true
        });
        placeDuplicateClone(clone, obj);
        canvas.add(clone);
        clones.push(clone);
      }

      if (clones.length === 1) {
        canvas.setActiveObject(clones[0]);
      } else {
        const selection = new fabric.ActiveSelection(clones, { canvas });
        canvas.setActiveObject(selection);
      }
      keepGuideOnTop();
      canvas.requestRenderAll();
      saveHistory();
      updateSelectionControls();
      setStatus(`${clones.length} item${clones.length === 1 ? "" : "s"} duplicated.`);
    }

    function deleteSelected() {
      const selected = canvas.getActiveObjects().filter((obj) => obj !== guide && !isLayerLocked(obj));
      if (!selected.length) return setStatus("Select an item to delete.");
      selected.forEach((obj) => canvas.remove(obj));
      canvas.discardActiveObject();
      if (selected.includes(teamText)) teamText = null;
      canvas.renderAll();
      saveHistory();
      updateSelectionControls();
    }

    function clearDesign(options = {}) {
      if (!options.skipConfirm && !window.confirm("Clear this design?")) return;
      isRestoring = true;
      canvas.clear();
      canvas.backgroundColor = canvasBackgroundColor((els.bgColor && els.bgColor.value) || "#ffffff");
      canvas.clipPath = makeClipPath();
      teamText = null;
      isRestoring = false;
      drawGuide();
      activeCategory = defaultCategoryForShape(ARTBOARD_SHAPE);
      assetPage = 1;
      saveHistory();
      updateSelectionControls();
      clearGeneratorPreviewState();
      setStatus("Blank canvas ready. Use Assets, Upload, or Text to start.");
    }

    function resetCanvas(background) {
      isRestoring = true;
      canvas.clear();
      canvas.backgroundColor = canvasBackgroundColor(background || "#ffffff");
      canvas.clipPath = makeClipPath();
      teamText = null;
      isRestoring = false;
      drawGuide();
      canvas.renderAll();
    }

    function switchShape(nextShape) {
      if (MVP_5X3_ONLY && String(nextShape || "rectangle").toLowerCase() !== "rectangle") {
        els.shapeSelects.forEach((select) => {
          select.value = "rectangle";
        });
        return setStatus("5x3 Banner is enabled first for this MVP.");
      }
      const normalized = normalizeShape(nextShape, false);
      if (normalized === ARTBOARD_SHAPE) return;
      ARTBOARD_SHAPE = normalized;
      const size = artboardSizeForShape(ARTBOARD_SHAPE);
      WIDTH = size.width;
      HEIGHT = size.height;
      launch.headline = "";
      launch.sizeLabel = "";
      launch.price = "";
      canvasEl.width = WIDTH;
      canvasEl.height = HEIGHT;
      canvas.setWidth(WIDTH);
      canvas.setHeight(HEIGHT);
      activeCategory = defaultCategoryForShape(ARTBOARD_SHAPE);
      assetPage = 1;
      resetCanvas("#ffffff");
      syncProductInfo();
      renderCategories();
      renderAssets();
      history = [];
      historyIndex = -1;
      saveHistory();
      updateStageScale();
      updateSelectionControls();
      setStatus(`${defaultHeadlineForShape(ARTBOARD_SHAPE)} blank canvas selected.`);
    }

    function cropRatio(image, crop) {
      const sourceWidth = image.naturalWidth || image.width || WIDTH;
      const sourceHeight = image.naturalHeight || image.height || HEIGHT;
      return {
        x: Math.round(crop.x * sourceWidth),
        y: Math.round(crop.y * sourceHeight),
        width: Math.round(crop.width * sourceWidth),
        height: Math.round(crop.height * sourceHeight)
      };
    }

    function sourceImageSize(image) {
      return {
        width: image.naturalWidth || image.width || WIDTH,
        height: image.naturalHeight || image.height || HEIGHT
      };
    }

    function scaledTemplatePoint(image, x, y) {
      const size = sourceImageSize(image);
      return {
        x: (x / size.width) * WIDTH,
        y: (y / size.height) * HEIGHT
      };
    }

    function normalizedCropFromPixels(image, crop) {
      const size = sourceImageSize(image);
      const x = Math.max(0, crop.x);
      const y = Math.max(0, crop.y);
      const right = Math.min(size.width, x + crop.width);
      const bottom = Math.min(size.height, y + crop.height);
      return {
        x: x / size.width,
        y: y / size.height,
        width: Math.max(1, right - x) / size.width,
        height: Math.max(1, bottom - y) / size.height
      };
    }

    function cropAroundPixelPoint(image, centerX, centerY, width, height) {
      return normalizedCropFromPixels(image, {
        x: centerX - width / 2,
        y: centerY - height / 2,
        width,
        height
      });
    }

    function isTemplateBackdropColor(r, g, b) {
      const isTan = r > 210 && g > 135 && g < 232 && b > 55 && b < 190 && r >= g;
      const isOrangeBand = r > 185 && g > 80 && g < 185 && b < 110 && r > g;
      const isWhite = r > 238 && g > 238 && b > 238;
      const isLightGray = Math.abs(r - g) < 12 && Math.abs(g - b) < 12 && r > 205;
      const isLightBlue = r > 170 && g > 190 && b > 190 && Math.max(r, g, b) - Math.min(r, g, b) < 70;
      const isPaleYellow = r > 215 && g > 195 && b > 120 && r >= g;
      const isPalePink = r > 220 && g > 185 && b > 185;
      const isPaleGreen = r > 170 && g > 195 && b > 145 && g >= r;
      return isTan || isOrangeBand || isWhite || isLightGray || isLightBlue || isPaleYellow || isPalePink || isPaleGreen;
    }

    function cropTemplateCanvas(image, crop, options = {}) {
      const area = cropRatio(image, crop);
      const layerCanvas = document.createElement("canvas");
      layerCanvas.width = Math.max(1, area.width);
      layerCanvas.height = Math.max(1, area.height);
      const ctx = layerCanvas.getContext("2d", { willReadFrequently: Boolean(options.transparentBackdrop) });
      ctx.drawImage(image, area.x, area.y, area.width, area.height, 0, 0, area.width, area.height);

      if (options.transparentBackdrop) {
        const imageData = ctx.getImageData(0, 0, area.width, area.height);
        for (let i = 0; i < imageData.data.length; i += 4) {
          const alpha = imageData.data[i + 3];
          if (alpha < 24) continue;
          const r = imageData.data[i];
          const g = imageData.data[i + 1];
          const b = imageData.data[i + 2];
          if (isTemplateBackdropColor(r, g, b)) imageData.data[i + 3] = 0;
        }
        ctx.putImageData(imageData, 0, 0);
      }

      return layerCanvas;
    }

    function addCroppedLayer(image, config) {
      const cropped = cropTemplateCanvas(image, config.crop, { transparentBackdrop: config.transparentBackdrop });
      const cropSource = !config.cropSource || config.cropSource === "crop" ? "product-image" : config.cropSource;
      const role = config.role || "template-image-layer";
      const isObjectFallbackCrop = cropSource === "product-image"
        && ["template-team-name", "template-clipart", "template-mascot", "template-player-icon"].includes(role);
      const shouldHideDuplicateCrop = isObjectFallbackCrop && !config.visibleObjectFallback;
      const data = {
        ...(cropSource === "design-tool-asset" ? assetMetadata(config.asset) : {}),
        name: config.name,
        role
      };
      if (Object.prototype.hasOwnProperty.call(config, "showInLayerList")) {
        data.showInLayerList = Boolean(config.showInLayerList);
      }
      if (config.sourceUrl) data.sourceUrl = config.sourceUrl;
      data.cropSource = cropSource;
      const layerImage = new fabric.Image(cropped, {
        left: config.left,
        top: config.top,
        originX: config.originX || "center",
        originY: config.originY || "center",
        angle: config.angle || 0,
        opacity: shouldHideDuplicateCrop ? Math.min(config.opacity ?? 1, 0.01) : (config.opacity ?? 1),
        data
      });
      if (config.width) layerImage.scaleToWidth(config.width);
      if (config.height && layerImage.getScaledHeight() > config.height) layerImage.scaleToHeight(config.height);
      ensureLayerId(layerImage);
      canvas.add(layerImage);
      if (config.locked) setObjectLocked(layerImage, true);
      return layerImage;
    }

    function addTemplateText(config) {
      const textLayer = new fabric.IText(config.text, {
        left: config.left,
        top: config.top,
        originX: config.originX || "center",
        originY: config.originY || "center",
        fill: config.fill || "#ffffff",
        fontFamily: config.fontFamily || "Impact, Arial Black, Arial, sans-serif",
        fontSize: config.fontSize,
        fontWeight: 900,
        stroke: config.stroke || "#6b6b6b",
        strokeWidth: config.strokeWidth ?? 3,
        paintFirst: "stroke",
        shadow: config.shadow || "2px 2px 0 rgba(0,0,0,.45)",
        opacity: config.opacity ?? 1,
        textAlign: config.textAlign || "center",
        data: { ...(config.data || {}), name: config.name, role: config.role || "template-text-layer", showInLayerList: true }
      });
      ensureLayerId(textLayer);
      canvas.add(textLayer);
      keepObjectInArtboard(textLayer, 6);
      return textLayer;
    }

    function recipePoint(x, y) {
      const bounds = artboardBounds();
      return { left: bounds.left + bounds.width * x, top: bounds.top + bounds.height * y };
    }

    function artboardTextSize(scale, minimum) {
      return Math.max(minimum || 24, Math.round(artboardBounds().height * scale));
    }

    function artboardRatioWidth(ratio) {
      return artboardBounds().width * ratio;
    }

    function artboardRatioHeight(ratio) {
      return artboardBounds().height * ratio;
    }

    function fitImageToArtboard(imageWidth, imageHeight, mode = "cover") {
      const bounds = ARTBOARD_SHAPE === "polepocket" && mode === "cover-full"
        ? { left: 0, top: 0, width: WIDTH, height: HEIGHT }
        : artboardBounds();
      const fitMode = mode === "cover-full" ? "cover" : mode;
      const fit = fitMode === "contain" ? Math.min : Math.max;
      const scale = fit(bounds.width / imageWidth, bounds.height / imageHeight);
      return {
        left: bounds.left + (bounds.width - imageWidth * scale) / 2,
        top: bounds.top + (bounds.height - imageHeight * scale) / 2,
        scaleX: scale,
        scaleY: scale
      };
    }

    function backgroundFitMode() {
      if (ARTBOARD_SHAPE === "polepocket") return "cover-full";
      if (isHomePlateShape(ARTBOARD_SHAPE)) return "cover";
      return isRectangularShape(ARTBOARD_SHAPE) ? "cover" : "contain";
    }

    function currentLayerConfig() {
      return mergeLayerConfig(
        ARTBOARD_SHAPE,
        launch.image,
        parseLayerConfigTags(launch.tags, ARTBOARD_SHAPE, launch.image),
        launch.layerConfig
      );
    }

    function productSvgTemplateOptions() {
      const config = currentLayerConfig();
      const product = launch.product || {};
      return {
        team: config.logoTitle || config.assetKey || launch.title || product.title || "TEAM NAME",
        manager: "",
        assistantManager: "",
        coach: "",
        assistantCoach: "",
        teamMom: "",
        sponsor: "",
        playerCount: Math.max(
          1,
          Number(config.playerIconCount || 0),
          Number(config.playerTextCount || 0),
          Number(config.playerCount || 0)
        ),
        sport: productSport(product),
        shape: ARTBOARD_SHAPE
      };
    }

    function productLayerRecipe() {
      const config = currentLayerConfig();
      if (isHomePlateShape(ARTBOARD_SHAPE)) {
        return {
          type: "homeplate",
          teamName: config.teamLogoCount > 0 ? { x: 0.5, y: 0.42, width: 0.48, height: 0.22 } : null,
          clipart: config.clipartCount > 0 ? { x: 0.5, y: 0.6, width: 0.46, height: 0.26 } : null,
          accessory: config.playerIconCount > 0 ? { x: 0.33, y: 0.62, width: 0.26, height: 0.18 } : null,
          texts: [
            ...(config.playerTextCount > 0 ? [{ text: "Player", name: "Player name", x: 0.5, y: 0.18, size: 0.12 }] : []),
            ...(config.yearTextCount > 0 ? [{ text: "Year", name: "Year", x: 0.5, y: 0.84, size: 0.08 }] : [])
          ],
          config
        };
      }

      if (!isRectangularShape(ARTBOARD_SHAPE)) {
        return {
          type: "triangle",
          teamName: config.teamLogoCount > 0 ? { x: 0.5, y: 0.22, width: 0.62, height: 0.2 } : null,
          clipart: config.clipartCount > 0 ? { x: 0.25, y: 0.26, width: 0.2, height: 0.16 } : null,
          accessory: config.playerIconCount > 0 ? { x: 0.5, y: 0.48, width: 0.44, height: 0.32 } : null,
          texts: [
            ...(config.playerTextCount > 0 ? [{ text: "Player", name: "Player name", x: 0.5, y: 0.43, size: 0.11 }] : []),
            ...(config.yearTextCount > 0 ? [{ text: "Year", name: "Year", x: 0.5, y: 0.66, size: 0.08 }] : [])
          ],
          config
        };
      }

      const playerSlots = [
        [0.48, 0.48], [0.62, 0.48], [0.76, 0.48], [0.9, 0.48],
        [0.48, 0.64], [0.62, 0.64], [0.76, 0.64], [0.9, 0.64],
        [0.48, 0.8], [0.62, 0.8], [0.76, 0.8], [0.9, 0.8],
        [0.41, 0.56], [0.55, 0.56], [0.69, 0.56], [0.83, 0.56]
      ].slice(0, Math.max(config.playerCount, config.playerIconCount, config.playerTextCount, 0));

      return {
        type: "rectangle",
        teamName: config.teamLogoCount > 0 ? { x: 0.62, y: 0.28, width: 0.46, height: 0.22 } : null,
        clipart: config.clipartCount > 0 ? { x: 0.22, y: 0.54, width: 0.34, height: 0.52 } : null,
        topTexts: [
          ...(config.headerTextCount > 0 ? [{ text: "Coach: Coach's name", name: "Coach name", x: 0.22, y: 0.075, size: 0.045 }] : []),
          ...(config.headerTextCount > 1 ? [{ text: "Team mom: Team mom's name", name: "Team mom name", x: 0.74, y: 0.075, size: 0.04 }] : [])
        ],
        players: playerSlots.map(([x, y], index) => ({
          number: index + 1,
          icon: { x, y, width: 0.085, height: 0.1 },
          text: { x, y: y + 0.075, size: 0.05 }
        })),
        config
      };
    }

    function addImageElementLayer(image, config) {
      const naturalWidth = image.naturalWidth || image.width || 1;
      const naturalHeight = image.naturalHeight || image.height || 1;
      const data = {
        ...(config.data || {}),
        ...assetMetadata(config.asset),
        name: config.name,
        role: config.role || "template-image-layer"
      };
      if (config.category) data.category = config.category;
      if (config.sourceUrl) data.sourceUrl = config.sourceUrl;
      if (Object.prototype.hasOwnProperty.call(config, "showInLayerList")) {
        data.showInLayerList = Boolean(config.showInLayerList);
      }

      const defaultPoint = recipePoint(0.5, 0.5);
      const layerImage = new fabric.Image(image, {
        left: config.left ?? defaultPoint.left,
        top: config.top ?? defaultPoint.top,
        originX: config.originX || "center",
        originY: config.originY || "center",
        angle: config.angle || 0,
        opacity: config.opacity ?? 1,
        data
      });

      if (config.cover) {
        const placement = fitImageToArtboard(naturalWidth, naturalHeight, config.fitMode || "cover");
        layerImage.set({
          originX: "left",
          originY: "top",
          left: placement.left,
          top: placement.top,
          scaleX: placement.scaleX,
          scaleY: placement.scaleY
        });
      } else {
        const maxWidth = (config.widthRatio ? artboardRatioWidth(config.widthRatio) : config.width) || artboardRatioWidth(0.3);
        const maxHeight = (config.heightRatio ? artboardRatioHeight(config.heightRatio) : config.height) || 0;
        layerImage.scaleToWidth(maxWidth);
        if (maxHeight && layerImage.getScaledHeight() > maxHeight) layerImage.scaleToHeight(maxHeight);
      }

      ensureLayerId(layerImage);
      canvas.add(layerImage);
      if (config.locked) setObjectLocked(layerImage, true);
      return layerImage;
    }

    async function addAssetImageLayer(asset, config) {
      if (!asset || !asset.url) return null;
      const source = canvasSafeImageUrl(asset.url, imageProxyEndpoint);
      try {
        const image = imageElementCache.get(source) || await loadImage(source);
        imageElementCache.set(source, image);
        return addImageElementLayer(image, {
          ...config,
          name: config.name || asset.name,
          category: asset.category,
          asset,
          sourceUrl: asset.url
        });
      } catch (error) {
        return null;
      }
    }

    async function addRecipeAsset(asset, placement, config = {}) {
      if (!asset || !placement) return null;
      const point = recipePoint(placement.x, placement.y);
      return addAssetImageLayer(asset, {
        ...point,
        widthRatio: placement.width,
        heightRatio: placement.height,
        ...config
      });
    }

    function addRecipeCropLayer(image, placement, config = {}) {
      if (!image || !placement) return null;
      const size = sourceImageSize(image);
      const point = recipePoint(placement.x, placement.y);
      return addCroppedLayer(image, {
        name: config.name,
        role: config.role,
        crop: cropAroundPixelPoint(
          image,
          placement.x * size.width,
          placement.y * size.height,
          Math.max(1, placement.width * size.width),
          Math.max(1, placement.height * size.height)
        ),
        left: point.left,
        top: point.top,
        width: artboardRatioWidth(placement.width),
        height: artboardRatioHeight(placement.height),
        transparentBackdrop: true,
        opacity: config.opacity,
        showInLayerList: config.showInLayerList,
        sourceUrl: config.sourceUrl || launch.image,
        cropSource: config.cropSource || "product-image"
      });
    }

    async function buildProductTemplateFromAssets(image, name) {
      const assetSet = resolveProductAssetSet();
      const recipe = productLayerRecipe();
      const config = recipe.config || currentLayerConfig();
      if (!assetSet.background) return false;

      const backgroundLayer = await addAssetImageLayer(assetSet.background, {
        name: "Background",
        role: "template-background",
        cover: true,
        fitMode: backgroundFitMode(),
        locked: true
      });
      if (!backgroundLayer) {
        addExactProductBackground(image, { asset: assetSet.background, sourceUrl: config.backgroundUrl || launch.image });
      }

      if (recipe.topTexts) {
        recipe.topTexts.forEach((item) => {
          const point = recipePoint(item.x, item.y);
          addTemplateText({
            text: item.text,
            name: item.name,
            left: point.left,
            top: point.top,
            fontSize: artboardTextSize(item.size, 24)
          });
        });
      }

      const teamNameLayer = shouldUseLayerAsset("template-team-name", assetSet.teamName, config)
        ? await addRecipeAsset(assetSet.teamName, recipe.teamName, {
          name: "Team name",
          role: "template-team-name"
        })
        : null;
      if (!teamNameLayer && recipe.teamName && !recipe.players) {
        addRecipeCropLayer(image, recipe.teamName, {
          name: "Team name",
          role: "template-team-name"
        });
      }

      const clipartLayer = shouldUseLayerAsset("template-clipart", assetSet.clipart, config)
        ? await addRecipeAsset(assetSet.clipart, recipe.clipart, {
          name: "Clipart",
          role: "template-clipart"
        })
        : null;
      if (!clipartLayer && recipe.clipart && !recipe.players) {
        addRecipeCropLayer(image, recipe.clipart, {
          name: "Clipart",
          role: "template-clipart"
        });
      }

      if (recipe.players) {
        const layout = detectTemplateLayout(image);
        const sourceSize = sourceImageSize(image);
        const toCanvas = (point) => scaledTemplatePoint(image, point.x, point.y);
        const canvasWidth = (pixels) => (pixels / sourceSize.width) * WIDTH;
        const canvasHeight = (pixels) => (pixels / sourceSize.height) * HEIGHT;

        if (!teamNameLayer && recipe.teamName) {
          const teamName = toCanvas({ x: layout.teamName.centerX, y: layout.teamName.centerY });
          addCroppedLayer(image, {
            name: "Team name",
            role: "template-team-name",
            crop: cropAroundPixelPoint(image, layout.teamName.centerX, layout.teamName.centerY, layout.teamName.width, layout.teamName.height),
            left: teamName.x,
            top: teamName.y,
            width: canvasWidth(layout.teamName.width),
            transparentBackdrop: true
          });
        }

        if (!clipartLayer && recipe.clipart) {
          const mascot = toCanvas({ x: layout.mascot.centerX, y: layout.mascot.centerY });
          addCroppedLayer(image, {
            name: "Clipart",
            role: "template-clipart",
            crop: cropAroundPixelPoint(image, layout.mascot.centerX, layout.mascot.centerY, layout.mascot.width, layout.mascot.height),
            left: mascot.x,
            top: mascot.y,
            width: canvasWidth(layout.mascot.width),
            transparentBackdrop: true
          });
        }

        for (const [index, player] of recipe.players.entries()) {
          const iconPoint = recipePoint(player.icon.x, player.icon.y);
          const textPoint = recipePoint(player.text.x, player.text.y);
          if (index < config.playerIconCount && shouldUseLayerAsset("template-player-icon", assetSet.accessory, config)) {
            const playerIconLayer = await addAssetImageLayer(assetSet.accessory, {
              name: `Player icon ${player.number}`,
              role: "template-player-icon",
              left: iconPoint.left,
              top: iconPoint.top,
              widthRatio: player.icon.width,
              heightRatio: player.icon.height
            });
            if (!playerIconLayer) {
              const fallback = layout.players[index];
              if (fallback) {
                addCroppedLayer(image, {
                  name: `Player icon ${player.number}`,
                  role: "template-player-icon",
                  crop: cropAroundPixelPoint(image, fallback.iconX, fallback.iconY, fallback.iconWidth, fallback.iconHeight),
                  left: iconPoint.left,
                  top: iconPoint.top,
                  width: canvasWidth(fallback.iconWidth),
                  height: canvasHeight(fallback.iconHeight),
                  transparentBackdrop: true
                });
              }
            }
          } else if (index < config.playerIconCount) {
            const fallback = layout.players[index];
            if (fallback) {
              addCroppedLayer(image, {
                name: `Player icon ${player.number}`,
                role: "template-player-icon",
                crop: cropAroundPixelPoint(image, fallback.iconX, fallback.iconY, fallback.iconWidth, fallback.iconHeight),
                left: iconPoint.left,
                top: iconPoint.top,
                width: canvasWidth(fallback.iconWidth),
                height: canvasHeight(fallback.iconHeight),
                transparentBackdrop: true
              });
            }
          }
          if (index < config.playerTextCount) {
            addTemplateText({
              text: config.playerLabel || "Player",
              name: `Player text ${player.number}`,
              role: "template-player-text",
              left: textPoint.left,
              top: textPoint.top,
              fontSize: artboardTextSize(player.text.size, 24),
              stroke: "#8e959d",
              strokeWidth: 3,
              shadow: "2px 2px 0 rgba(0,0,0,.42)"
            });
          }
        }
      } else {
        const accessoryLayer = shouldUseLayerAsset("template-player-icon", assetSet.accessory, config)
          ? await addRecipeAsset(assetSet.accessory, recipe.accessory, {
            name: "Accessory",
            role: "template-player-icon"
          })
          : null;
        if (!accessoryLayer && recipe.accessory) {
          addRecipeCropLayer(image, recipe.accessory, {
            name: "Accessory",
            role: "template-player-icon"
          });
        }
        recipe.texts.forEach((item) => {
          const point = recipePoint(item.x, item.y);
          const isPlayerLabel = item.text.toLowerCase() === "player";
          addTemplateText({
            text: isPlayerLabel ? config.playerLabel || "Player" : item.text,
            name: item.name,
            role: item.text.toLowerCase() === "year" ? "template-year-text" : "template-player-text",
            left: point.left,
            top: point.top,
            fontSize: artboardTextSize(item.size, 34),
            stroke: "#000000",
            strokeWidth: 4,
            shadow: "2px 2px 0 rgba(0,0,0,.35)"
          });
        });
      }

      canvas.discardActiveObject();
      keepGuideOnTop();
      canvas.renderAll();
      saveHistory();
      updateSelectionControls();
      setStatus(`${name} loaded as editable product layers.`);
      return true;
    }

    function detectTemplateLayout(image) {
      const size = sourceImageSize(image);
      const xScale = size.width / 760;
      const yScale = size.height / 454;
      const px = (value) => value * xScale;
      const py = (value) => value * yScale;
      const playerColumns = [373, 482, 589, 696].map(px);
      const iconRows = [192, 290, 386].map(py);
      const labelRows = [254, 353, 442].map(py);
      const iconWidth = Math.max(42, px(92));
      const iconHeight = Math.max(40, py(86));
      return {
        coach: { x: px(118), y: py(32), fontSize: Math.max(22, py(42)) },
        teamMom: { x: px(604), y: py(32), fontSize: Math.max(20, py(35)) },
        teamName: {
          centerX: px(520),
          centerY: py(106),
          width: px(470),
          height: py(132)
        },
        mascot: {
          centerX: px(160),
          centerY: py(246),
          width: px(338),
          height: py(382)
        },
        players: playerColumns.flatMap((x, columnIndex) => iconRows.map((y, rowIndex) => ({
          number: rowIndex * playerColumns.length + columnIndex + 1,
          iconX: x,
          iconY: y,
          iconWidth,
          iconHeight,
          textX: x,
          textY: labelRows[rowIndex],
          fontSize: Math.max(22, py(rowIndex === 2 ? 36 : 40))
        })))
      };
    }

    function productLayoutOverride() {
      const handle = String((launch.product && launch.product.handle) || launch.handle || "").toLowerCase();
      if (launch.layerMap && launch.layerMap.mode) return launch.layerMap;
      if (handle === "assault-2-triangle-softball-pennant") {
        return {
          mode: "exact-overlay",
          teamName: { x: 0.5, y: 0.53, width: 0.36, height: 0.16, opacity: 1 },
          clipart: { x: 0.5, y: 0.43, width: 0.34, height: 0.28, opacity: 1 },
          players: [
            {
              x: 0.5,
              y: 0.43,
              width: 0.34,
              height: 0.28,
              opacity: 1,
              textX: 0.5,
              textY: 0.17,
              textSize: 0.09,
              textFill: "#000000",
              textStroke: "#000000",
              textStrokeWidth: 0,
              textShadow: "none",
              textOpacity: 1
            }
          ],
          texts: [
            {
              text: "Year",
              name: "Year text",
              role: "template-year-text",
              x: 0.5,
              y: 0.72,
              size: 0.07,
              fill: "#000000",
              stroke: "#000000",
              strokeWidth: 0,
              shadow: "none",
              opacity: 1
            }
          ]
        };
      }
      if (handle === "all-star-2-triangle-baseball-banners") {
        return {
          mode: "exact-overlay",
          backgroundUrl: designerAssetUrl("imgi_23_all-star-2-baseball-banner-1640253703505-bg-triangle.png"),
          clipart: {
            url: designerAssetUrl("imgi_13_all-star-2-baseball-banner-1640253743215.png"),
            x: 0.33,
            y: 0.36,
            width: 0.13,
            height: 0.14
          },
          teamName: {
            url: designerAssetUrl("imgi_22_all-star-2-baseball-banner-1640253760856.png"),
            x: 0.5,
            y: 0.34,
            width: 0.22,
            height: 0.15
          },
          texts: [
            {
              text: "Player",
              name: "Player text",
              role: "template-player-text",
              x: 0.5,
              y: 0.52,
              size: 0.08,
              fill: "#ffffff",
              stroke: "#000000",
              strokeWidth: 3,
              opacity: 1
            },
            {
              text: "Year",
              name: "Year text",
              role: "template-year-text",
              x: 0.5,
              y: 0.64,
              size: 0.064,
              fill: "#ffffff",
              stroke: "#000000",
              strokeWidth: 3,
              opacity: 1
            }
          ]
        };
      }
      if (handle === "pokemon-go-soccer-banner") {
        return {
          mode: "exact-overlay",
          teamName: { x: 0.285, y: 0.16, width: 0.58, height: 0.3 },
          clipart: { x: 0.8, y: 0.52, width: 0.42, height: 0.72 },
          topTexts: [
            { text: "Team mom: Team mom's name", name: "Team mom name", x: 0.22, y: 0.915, size: 0.04, fill: "#ffffff", stroke: "#305f9d", strokeWidth: 2 },
            { text: "Coach: Coach's name", name: "Coach name", x: 0.83, y: 0.915, size: 0.04, fill: "#ffffff", stroke: "#305f9d", strokeWidth: 2 }
          ],
          players: [
            { x: 0.088, y: 0.455, textY: 0.565, width: 0.085, height: 0.11, textFill: "#ffe028", textStroke: "#245da2" },
            { x: 0.234, y: 0.455, textY: 0.565, width: 0.085, height: 0.11, textFill: "#ffe028", textStroke: "#245da2" },
            { x: 0.405, y: 0.455, textY: 0.565, width: 0.085, height: 0.11, textFill: "#ffe028", textStroke: "#245da2" },
            { x: 0.548, y: 0.455, textY: 0.565, width: 0.085, height: 0.11, textFill: "#ffe028", textStroke: "#245da2" },
            { x: 0.088, y: 0.73, textY: 0.835, width: 0.085, height: 0.11, textFill: "#ffe028", textStroke: "#245da2" },
            { x: 0.24, y: 0.73, textY: 0.835, width: 0.085, height: 0.11, textFill: "#ffe028", textStroke: "#245da2" },
            { x: 0.395, y: 0.73, textY: 0.835, width: 0.085, height: 0.11, textFill: "#ffe028", textStroke: "#245da2" },
            { x: 0.543, y: 0.73, textY: 0.835, width: 0.085, height: 0.11, textFill: "#ffe028", textStroke: "#245da2" }
          ]
        };
      }
      if (handle !== "super-heroes-soccer-banner") return null;
      return {
        mode: "exact-overlay",
        teamName: { x: 0.5, y: 0.83, width: 0.64, height: 0.22 },
        clipart: { x: 0.51, y: 0.42, width: 0.3, height: 0.54 },
        topTexts: [
          { text: "Team mom: Team mom's name", name: "Team mom name", x: 0.2, y: 0.06, size: 0.035, fill: "#000000", stroke: "#000000", strokeWidth: 0 },
          { text: "Coach: Coach's name", name: "Coach name", x: 0.84, y: 0.06, size: 0.035, fill: "#000000", stroke: "#000000", strokeWidth: 0 }
        ],
        players: [
          { x: 0.088, y: 0.19, textY: 0.295, width: 0.096, height: 0.13 },
          { x: 0.248, y: 0.3, textY: 0.405, width: 0.096, height: 0.13 },
          { x: 0.088, y: 0.48, textY: 0.59, width: 0.096, height: 0.13 },
          { x: 0.248, y: 0.59, textY: 0.7, width: 0.096, height: 0.13 },
          { x: 0.088, y: 0.75, textY: 0.855, width: 0.096, height: 0.13 },
          { x: 0.718, y: 0.3, textY: 0.405, width: 0.096, height: 0.13 },
          { x: 0.89, y: 0.19, textY: 0.295, width: 0.096, height: 0.13 },
          { x: 0.724, y: 0.5, textY: 0.595, width: 0.15, height: 0.17 },
          { x: 0.89, y: 0.48, textY: 0.59, width: 0.096, height: 0.13 },
          { x: 0.89, y: 0.75, textY: 0.855, width: 0.096, height: 0.13 }
        ]
      };
    }

    function addExactProductBackground(image, config = {}) {
      const size = sourceImageSize(image);
      const background = new fabric.Image(image, {
        originX: "left",
        originY: "top",
        data: {
          ...(config.source === "design-tool-asset" ? assetMetadata(config.asset) : {}),
          name: "Background",
          role: "template-background",
          locked: true,
          sourceUrl: config.sourceUrl || launch.image,
          source: config.source || "product-image"
        }
      });
      const placement = fitImageToArtboard(size.width, size.height, backgroundFitMode());
      background.set({
        left: placement.left,
        top: placement.top,
        scaleX: placement.scaleX,
        scaleY: placement.scaleY
      });
      ensureLayerId(background);
      canvas.add(background);
      setObjectLocked(background, true);
      return background;
    }

    async function addEditableFallbackBackground(image, layerConfig, assetSet) {
      if (shouldUseLayerAsset("template-background", assetSet && assetSet.background, layerConfig)) {
        const backgroundLayer = await addAssetImageLayer(assetSet.background, {
          name: "Background",
          role: "template-background",
          cover: true,
          fitMode: backgroundFitMode(),
          locked: true
        });
        if (backgroundLayer) return backgroundLayer;
      }
      return addExactProductBackground(image, {
        asset: assetSet && assetSet.background,
        sourceUrl: layerConfig.backgroundUrl || launch.image,
        source: usesProductImageObjectFallback(layerConfig) ? "product-image-object-fallback" : "product-image"
      });
    }

    function addExactOverlayCrop(image, placement, config = {}) {
      if (!placement) return null;
      const size = sourceImageSize(image);
      const point = recipePoint(placement.x, placement.y);
      return addCroppedLayer(image, {
        name: config.name,
        role: config.role,
        asset: config.useAsset ? config.asset : null,
        crop: cropAroundPixelPoint(
          image,
          placement.x * size.width,
          placement.y * size.height,
          Math.max(1, placement.width * size.width),
          Math.max(1, placement.height * size.height)
        ),
        left: point.left,
        top: point.top,
        width: artboardRatioWidth(placement.width),
        height: artboardRatioHeight(placement.height),
        transparentBackdrop: true,
        opacity: config.opacity ?? placement.opacity,
        showInLayerList: config.showInLayerList,
        sourceUrl: config.sourceUrl || placement.url || launch.image,
        cropSource: config.cropSource || placement.cropSource || "product-image"
      });
    }

    async function addExactOverlayAsset(placement, config = {}) {
      if (!placement || !placement.url) return null;
      const image = await loadImage(canvasSafeImageUrl(placement.url, imageProxyEndpoint));
      const size = sourceImageSize(image);
      const point = recipePoint(placement.x, placement.y);
      const targetWidth = artboardRatioWidth(placement.width);
      const targetHeight = artboardRatioHeight(placement.height);
      const scale = Math.min(targetWidth / size.width, targetHeight / size.height);
      const layer = new fabric.Image(image, {
        left: point.left,
        top: point.top,
        originX: "center",
        originY: "center",
        angle: Number(placement.angle) || 0,
        scaleX: scale,
        scaleY: scale,
        opacity: config.opacity ?? placement.opacity ?? 1,
        data: {
          ...assetMetadata(config.asset || placement),
          name: config.name || placement.name || "Image",
          role: config.role || placement.role || "template-clipart",
          showInLayerList: config.showInLayerList !== false
        }
      });
      ensureLayerId(layer);
      canvas.add(layer);
      return layer;
    }

    async function addExactOverlayLayer(image, placement, config = {}) {
      if (!placement) return null;
      if (config.useAsset && config.asset && config.asset.url) {
        const assetPlacement = {
          ...placement,
          url: config.asset.url,
          name: config.asset.name
        };
        if (Number(assetPlacement.opacity) < 0.05) assetPlacement.opacity = 1;
        return addExactOverlayAsset(assetPlacement, config);
      }
      if (placement.url) return addExactOverlayAsset(placement, config);
      return addExactOverlayCrop(image, placement, config);
    }

    async function buildExactProductOverlayLayers(image, name, override, options = {}) {
      const assetSet = resolveProductAssetSet();
      const layerConfig = currentLayerConfig();
      const useBackgroundAsset = Boolean(options.useAssetObjects && shouldUseLayerAsset("template-background", assetSet.background, layerConfig));
      if (useBackgroundAsset) {
        const backgroundLayer = await addAssetImageLayer(assetSet.background, {
          name: "Background",
          role: "template-background",
          cover: true,
          locked: true
        });
        if (!backgroundLayer) {
          addExactProductBackground(image, { asset: assetSet.background, sourceUrl: override.backgroundUrl || launch.image });
        }
      } else {
        let backgroundImage = image;
        if (override.backgroundUrl) {
          try {
            backgroundImage = await loadImage(canvasSafeImageUrl(override.backgroundUrl, imageProxyEndpoint));
          } catch (error) {
            backgroundImage = image;
          }
        }
        addExactProductBackground(backgroundImage, { asset: assetSet.background, sourceUrl: override.backgroundUrl || launch.image });
      }

      (override.topTexts || []).forEach((item) => {
        const point = recipePoint(item.x, item.y);
        addTemplateText({
          text: item.text,
          name: item.name,
          role: "template-text-layer",
          left: point.left,
          top: point.top,
          fontSize: artboardTextSize(item.size, 22),
          fill: item.fill,
          fontFamily: item.fontFamily,
          stroke: item.stroke,
          strokeWidth: item.strokeWidth,
          shadow: item.shadow || "none",
          opacity: productImageFallbackTextOpacity(item.opacity ?? 1, layerConfig),
          data: { exactOverlayText: true }
        });
      });

      await addExactOverlayLayer(image, override.teamName, {
        name: "Team name",
        role: "template-team-name",
        asset: assetSet.teamName,
        useAsset: shouldUseLayerAsset("template-team-name", assetSet.teamName, layerConfig) && !override.teamName?.url,
        showInLayerList: true
      });
      const clipartPlacements = Array.isArray(override.cliparts)
        ? override.cliparts
        : (override.clipart ? [override.clipart] : []);
      for (const [index, clipart] of clipartPlacements.entries()) {
        await addExactOverlayLayer(image, clipart, {
          name: clipart.name || (clipartPlacements.length > 1 ? `Clip art ${index + 1}` : "Clip art"),
          role: clipart.role || "template-clipart",
          asset: assetSet.clipart,
          useAsset: shouldUseLayerAsset(clipart.role || "template-clipart", assetSet.clipart, layerConfig) && !clipart.url,
          showInLayerList: true
        });
      }

      for (const [index, player] of (override.players || []).entries()) {
        await addExactOverlayLayer(image, player, {
          name: `Player icon ${index + 1}`,
          role: "template-player-icon",
          asset: assetSet.accessory,
          useAsset: shouldUseLayerAsset("template-player-icon", assetSet.accessory, layerConfig) && !player.url,
          showInLayerList: true
        });
        const textPoint = recipePoint(player.textX || player.x, player.textY || player.y + 0.09);
        addTemplateText({
          text: layerConfig.playerLabel || "Player",
          name: `Player text ${index + 1}`,
          role: "template-player-text",
          left: textPoint.left,
          top: textPoint.top,
          fontSize: artboardTextSize(player.textSize || 0.043, 24),
          fill: player.textFill || "#13c4da",
          fontFamily: player.fontFamily,
          stroke: player.textStroke || "#073b48",
          strokeWidth: player.textStrokeWidth ?? 2,
          shadow: player.textShadow || "1px 1px 0 rgba(255,255,255,.35)",
          opacity: productImageFallbackTextOpacity(player.textOpacity ?? 1, layerConfig),
          data: { exactOverlayText: true }
        });
      }

      (override.texts || []).forEach((item) => {
        const point = recipePoint(item.x, item.y);
        addTemplateText({
          text: item.text,
          name: item.name,
          role: item.role || "template-text-layer",
          left: point.left,
          top: point.top,
          fontSize: artboardTextSize(item.size, 28),
          fill: item.fill,
          fontFamily: item.fontFamily,
          stroke: item.stroke,
          strokeWidth: item.strokeWidth,
          shadow: item.shadow || "none",
          opacity: productImageFallbackTextOpacity(item.opacity ?? 1, layerConfig),
          data: { exactOverlayText: true }
        });
      });

      canvas.discardActiveObject();
      keepGuideOnTop();
      canvas.renderAll();
      saveHistory();
      updateSelectionControls();
      setStatus(`${name} loaded with exact product layout layers.`);
    }

    function addOrUpdateTextFromPanel() {
      const textValue = (els.textContent && els.textContent.value.trim()) || "Player";
      const obj = selectedObject();
      if (obj && obj.type === "i-text") {
        if (isLayerLocked(obj)) return setStatus(`${layerLabel(obj)} is locked. Unlock it to edit text.`);
        obj.set({
          text: textValue,
          fill: controlValue(els.fills, "#ffffff"),
          stroke: controlValue(els.strokes, "#000000"),
          strokeWidth: Number(controlValue(els.strokeWidths, 0.5)) || 0,
          fontSize: Number(controlValue(els.sizes, 40)) || 40,
          fontFamily: els.fontFamily ? els.fontFamily.value : "Impact, Arial Black, Arial, sans-serif",
          charSpacing: Number(controlValue(els.charSpacings, 0)) || 0,
          lineHeight: Math.max(0.6, Number(controlValue(els.lineHeights, 1)) || 1),
          opacity: 1
        });
        canvas.renderAll();
        saveHistory();
        updateSelectionControls();
        return;
      }

      const point = recipePoint(0.5, 0.5);
      const textLayer = new fabric.IText(textValue, {
        left: point.left,
        top: point.top,
        originX: "center",
        originY: "center",
        fill: controlValue(els.fills, "#ffffff"),
        fontFamily: els.fontFamily ? els.fontFamily.value : "Impact, Arial Black, Arial, sans-serif",
        fontSize: Number(controlValue(els.sizes, 40)) || 40,
        fontWeight: 900,
        charSpacing: Number(controlValue(els.charSpacings, 0)) || 0,
        lineHeight: Math.max(0.6, Number(controlValue(els.lineHeights, 1)) || 1),
        stroke: controlValue(els.strokes, "#000000"),
        strokeWidth: Number(controlValue(els.strokeWidths, 0.5)) || 0,
        paintFirst: "stroke",
        shadow: "2px 2px 0 rgba(0,0,0,.42)",
        textAlign: "center",
        data: { name: textValue, role: "custom-text-layer" }
      });
      canvas.add(textLayer);
      keepObjectInArtboard(textLayer, 6);
      canvas.setActiveObject(textLayer);
      keepGuideOnTop();
      canvas.renderAll();
      saveHistory();
      updateSelectionControls();
    }

    function buildTemplateBackground() {
      const backgroundCanvas = document.createElement("canvas");
      backgroundCanvas.width = WIDTH;
      backgroundCanvas.height = HEIGHT;
      const ctx = backgroundCanvas.getContext("2d");
      ctx.fillStyle = "#facb82";
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.fillStyle = "#d9892d";
      ctx.fillRect(0, Math.round(HEIGHT * 0.035), WIDTH, Math.round(HEIGHT * 0.075));
      ctx.fillRect(0, Math.round(HEIGHT * 0.89), WIDTH, Math.round(HEIGHT * 0.074));
      ctx.globalAlpha = 0.16;
      ctx.strokeStyle = "#fff3d4";
      ctx.lineWidth = 4;
      for (let i = 0; i < 58; i += 1) {
        const x = (i * 97) % WIDTH;
        const y = (i * 53) % HEIGHT;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.bezierCurveTo(x + 34, y - 24, x + 76, y + 44, x + 116, y + 4);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      const background = new fabric.Image(backgroundCanvas, {
        left: 0,
        top: 0,
        originX: "left",
        originY: "top",
        selectable: false,
        evented: false,
        data: { name: "Background", role: "template-background", locked: true }
      });
      canvas.add(background);
      setObjectLocked(background, true);
      return background;
    }

    async function buildProductTemplateLayers(image, name) {
      const override = productLayoutOverride();
      const layerConfig = currentLayerConfig();
      const assetSet = resolveProductAssetSet();
      const useAssetObjects = shouldUseProductAssetObjects(assetSet, layerConfig);
      const useObjectFallbackLayers = usesProductImageObjectFallback(layerConfig);
      if (override && override.mode === "exact-overlay") {
        await buildExactProductOverlayLayers(image, name, override, { useAssetObjects });
        return;
      }

      // For Shopify product launches, keep the visual design exact to the clicked product.
      // The asset manifest is still used by the picker, but not for guessing product art.
      if (useAssetObjects && !useObjectFallbackLayers) {
        await buildProductTemplateFromAssets(image, name);
        return;
      }

      if (!isRectangularShape(ARTBOARD_SHAPE)) {
        const recipe = productLayerRecipe();
        await addEditableFallbackBackground(image, layerConfig, assetSet);
        const teamNameLayer = shouldUseLayerAsset("template-team-name", assetSet.teamName, layerConfig)
          ? await addRecipeAsset(assetSet.teamName, recipe.teamName, {
            name: "Team name",
            role: "template-team-name",
            opacity: 1
          })
          : null;
        if (!teamNameLayer) addRecipeCropLayer(image, recipe.teamName, {
          name: "Team name",
          role: "template-team-name",
          asset: assetSet.teamName,
          opacity: 1,
          visibleObjectFallback: useObjectFallbackLayers
        });
        const clipartLayer = shouldUseLayerAsset("template-clipart", assetSet.clipart, layerConfig)
          ? await addRecipeAsset(assetSet.clipart, recipe.clipart, {
            name: "Clipart",
            role: "template-clipart",
            opacity: 1
          })
          : null;
        if (!clipartLayer) addRecipeCropLayer(image, recipe.clipart, {
          name: "Clipart",
          role: "template-clipart",
          asset: assetSet.clipart,
          opacity: 1,
          visibleObjectFallback: useObjectFallbackLayers
        });
        const accessoryLayer = shouldUseLayerAsset("template-player-icon", assetSet.accessory, layerConfig)
          ? await addRecipeAsset(assetSet.accessory, recipe.accessory, {
            name: "Accessory",
            role: "template-player-icon",
            opacity: 1
          })
          : null;
        if (!accessoryLayer) addRecipeCropLayer(image, recipe.accessory, {
          name: "Accessory",
          role: "template-player-icon",
          asset: assetSet.accessory,
          opacity: 1,
          visibleObjectFallback: useObjectFallbackLayers
        });
        recipe.texts.forEach((item) => {
          const point = recipePoint(item.x, item.y);
          addTemplateText({
            text: item.text,
            name: item.name,
            role: item.text.toLowerCase() === "year" ? "template-year-text" : "template-player-text",
            left: point.left,
            top: point.top,
            fontSize: artboardTextSize(item.size, 34),
            stroke: "#000000",
            strokeWidth: 4,
            shadow: "2px 2px 0 rgba(0,0,0,.35)",
            opacity: productImageFallbackTextOpacity(1, layerConfig),
            data: { exactOverlayText: true }
          });
        });
        canvas.discardActiveObject();
        keepGuideOnTop();
        canvas.renderAll();
        saveHistory();
        updateSelectionControls();
        setStatus(`${name} loaded as editable product layers with fallback object crops.`);
        return;
      }

      const layout = detectTemplateLayout(image);
      const toCanvas = (point) => scaledTemplatePoint(image, point.x, point.y);
      const canvasWidth = (pixels) => (pixels / sourceImageSize(image).width) * WIDTH;
      const canvasHeight = (pixels) => (pixels / sourceImageSize(image).height) * HEIGHT;
      const coach = toCanvas(layout.coach);
      const teamMom = toCanvas(layout.teamMom);
      const teamName = toCanvas({ x: layout.teamName.centerX, y: layout.teamName.centerY });
      const mascot = toCanvas({ x: layout.mascot.centerX, y: layout.mascot.centerY });

      await addEditableFallbackBackground(image, layerConfig, assetSet);
      if (layerConfig.headerTextCount > 0) {
        addTemplateText({
          text: "Coach: Coach's name",
          name: "Coach name",
          left: coach.x,
          top: coach.y,
          fontSize: layout.coach.fontSize,
          opacity: productImageFallbackTextOpacity(1, layerConfig),
          data: { exactOverlayText: true }
        });
      }
      if (layerConfig.headerTextCount > 1) {
        addTemplateText({
          text: "Team mom: Team mom's name",
          name: "Team mom name",
          left: teamMom.x,
          top: teamMom.y,
          fontSize: layout.teamMom.fontSize,
          opacity: productImageFallbackTextOpacity(1, layerConfig),
          data: { exactOverlayText: true }
        });
      }
      if (layerConfig.teamLogoCount > 0) {
        const teamNameAssetLayer = shouldUseLayerAsset("template-team-name", assetSet.teamName, layerConfig)
          ? await addAssetImageLayer(assetSet.teamName, {
            name: "Team name",
            role: "template-team-name",
            left: teamName.x,
            top: teamName.y,
            width: canvasWidth(layout.teamName.width),
            height: canvasHeight(layout.teamName.height),
            opacity: 1
          })
          : null;
        if (!teamNameAssetLayer) {
          addCroppedLayer(image, {
            name: "Team name",
            role: "template-team-name",
            asset: assetSet.teamName,
            crop: cropAroundPixelPoint(image, layout.teamName.centerX, layout.teamName.centerY, layout.teamName.width, layout.teamName.height),
            left: teamName.x,
            top: teamName.y,
            width: canvasWidth(layout.teamName.width),
            transparentBackdrop: true,
            opacity: 1,
            sourceUrl: layerConfig.logoUrl || launch.image,
            cropSource: layerConfig.logoSource || "product-image",
            visibleObjectFallback: useObjectFallbackLayers
          });
        }
      }
      if (layerConfig.clipartCount > 0) {
        const clipartAssetLayer = shouldUseLayerAsset("template-mascot", assetSet.clipart, layerConfig)
          ? await addAssetImageLayer(assetSet.clipart, {
            name: "Mascot art",
            role: "template-mascot",
            left: mascot.x,
            top: mascot.y,
            width: canvasWidth(layout.mascot.width),
            height: canvasHeight(layout.mascot.height),
            opacity: 1
          })
          : null;
        if (!clipartAssetLayer) {
          addCroppedLayer(image, {
            name: "Mascot art",
            role: "template-mascot",
            asset: assetSet.clipart,
            crop: cropAroundPixelPoint(image, layout.mascot.centerX, layout.mascot.centerY, layout.mascot.width, layout.mascot.height),
            left: mascot.x,
            top: mascot.y,
            width: canvasWidth(layout.mascot.width),
            transparentBackdrop: true,
            opacity: 1,
            sourceUrl: layerConfig.clipartUrl || launch.image,
            cropSource: layerConfig.clipartSource || "product-image",
            visibleObjectFallback: useObjectFallbackLayers
          });
        }
      }

      const visiblePlayers = layout.players.slice(0, Math.max(layerConfig.playerCount, layerConfig.playerIconCount, layerConfig.playerTextCount, 0));
      for (const [index, player] of visiblePlayers.entries()) {
        const iconPoint = toCanvas({ x: player.iconX, y: player.iconY });
        const textPoint = toCanvas({ x: player.textX, y: player.textY });
        if (index < layerConfig.playerIconCount) {
          const playerAssetLayer = shouldUseLayerAsset("template-player-icon", assetSet.accessory, layerConfig)
            ? await addAssetImageLayer(assetSet.accessory, {
              name: `Player icon ${player.number}`,
              role: "template-player-icon",
              left: iconPoint.x,
              top: iconPoint.y,
              width: canvasWidth(player.iconWidth),
              height: canvasHeight(player.iconHeight),
              showInLayerList: true,
              opacity: 1
            })
            : null;
          if (!playerAssetLayer) {
            addCroppedLayer(image, {
              name: `Player icon ${player.number}`,
              role: "template-player-icon",
              asset: assetSet.accessory,
              showInLayerList: true,
              crop: cropAroundPixelPoint(image, player.iconX, player.iconY, player.iconWidth, player.iconHeight),
              left: iconPoint.x,
              top: iconPoint.y,
              width: canvasWidth(player.iconWidth),
              height: canvasHeight(player.iconHeight),
              transparentBackdrop: true,
              opacity: 1,
              sourceUrl: launch.image,
              cropSource: "product-image",
              visibleObjectFallback: useObjectFallbackLayers
            });
          }
        }
        if (index < layerConfig.playerTextCount) {
          addTemplateText({
            text: "Player",
            name: `Player text ${player.number}`,
            role: "template-player-text",
            left: textPoint.x,
            top: textPoint.y,
            fontSize: player.fontSize,
            stroke: "#8e959d",
            strokeWidth: 3,
            shadow: "2px 2px 0 rgba(0,0,0,.42)",
            opacity: productImageFallbackTextOpacity(1, layerConfig),
            data: { exactOverlayText: true }
          });
        }
      }

      canvas.discardActiveObject();
      keepGuideOnTop();
      canvas.renderAll();
      saveHistory();
      updateSelectionControls();
      setStatus(`${name} loaded as editable object layers.`);
    }

    function fitImagePlacement(image, margin) {
      const imageWidth = image.naturalWidth || image.width || WIDTH;
      const imageHeight = image.naturalHeight || image.height || HEIGHT;
      const bounds = artboardBounds();
      const insetWidth = bounds.width * (margin || 0.92);
      const insetHeight = bounds.height * (margin || 0.92);
      const scale = Math.min(insetWidth / imageWidth, insetHeight / imageHeight);
      return {
        left: bounds.left + bounds.width / 2,
        top: bounds.top + bounds.height / 2,
        originX: "center",
        originY: "center",
        scaleX: scale,
        scaleY: scale
      };
    }

    function addLoadedImageLayer(image, name, placement) {
      const layerImage = new fabric.Image(image, {
        left: placement.left,
        top: placement.top,
        originX: placement.originX || "center",
        originY: placement.originY || "center",
        angle: placement.angle || 0,
        scaleX: placement.scaleX,
        scaleY: placement.scaleY,
        data: { name, role: "product-image-layer" }
      });
      canvas.add(layerImage);
      canvas.setActiveObject(layerImage);
      keepGuideOnTop();
      canvas.renderAll();
      saveHistory();
      updateSelectionControls();
      setStatus(`${name} loaded as an editable image layer.`);
    }

    function layer(direction) {
      const obj = selectedObject();
      if (!obj) return setStatus("Select an item first.");
      if (isLayerLocked(obj)) return setStatus(`${layerLabel(obj)} is locked. Unlock it before arranging.`);
      if (direction === "front") obj.bringToFront();
      if (direction === "forward") obj.bringForward();
      if (direction === "backward") obj.sendBackwards();
      if (direction === "back") obj.sendToBack();
      keepGuideOnTop();
      canvas.renderAll();
      saveHistory();
    }

    function alignSelected(direction) {
      const obj = selectedObject();
      const selected = activeEditableObjects();
      if (!obj || !selected.length) return setStatus("Select an unlocked item first.");
      if (obj !== canvas.getActiveObject() && isLayerLocked(obj)) return setStatus(`${layerLabel(obj)} is locked. Unlock it before aligning.`);

      const rect = obj.getBoundingRect(true, true);
      const target = artboardBounds();
      let dx = 0;
      let dy = 0;

      if (direction === "left") dx = target.left - rect.left;
      if (direction === "center-x") dx = target.left + target.width / 2 - (rect.left + rect.width / 2);
      if (direction === "right") dx = target.left + target.width - (rect.left + rect.width);
      if (direction === "top") dy = target.top - rect.top;
      if (direction === "center-y") dy = target.top + target.height / 2 - (rect.top + rect.height / 2);
      if (direction === "bottom") dy = target.top + target.height - (rect.top + rect.height);

      if (!dx && !dy) return setStatus("Selected layer is already aligned.");
      obj.set({
        left: (obj.left || 0) + dx,
        top: (obj.top || 0) + dy
      });
      obj.setCoords();
      keepGuideOnTop();
      canvas.requestRenderAll();
      saveHistory();
      updateSelectionControls();
      setStatus("Aligned to artboard.");
    }

    function isProjectFile(file) {
      const name = String(file && file.name || "").toLowerCase();
      return name.endsWith(".tsbd") || name.endsWith(".json") || file.type === "application/json";
    }

    async function importProjectFile(file) {
      if (!file) return;
      try {
        setStatus("Opening editable design file...");
        await restoreProject(await readProjectFileText(file), file.name);
      } catch (error) {
        setStatus(error.message || "Could not open that design file.");
      }
    }

    async function handleUpload(event) {
      const files = Array.from(event.target.files || []);
      event.target.value = "";
      for (const file of files) {
        if (isProjectFile(file)) {
          await importProjectFile(file);
          continue;
        }
        if (!file.type.startsWith("image/")) continue;
        const reader = new FileReader();
        reader.onload = () => addAsset({ name: file.name, category: "Upload", url: reader.result });
        reader.readAsDataURL(file);
      }
    }

    function layerCount() {
      const raw = Number(els.layerCount && els.layerCount.value);
      return Math.max(2, Math.min(16, Number.isFinite(raw) ? raw : 5));
    }

    function readFileAsDataUrl(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    }

    function readFileAsText(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsText(file);
      });
    }

    async function readProjectFileText(file) {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const isGzip = bytes[0] === 0x1f && bytes[1] === 0x8b;
      if (!isGzip) return new TextDecoder().decode(bytes);
      if (!window.DecompressionStream) {
        throw new Error("This browser cannot open compressed design files. Try Chrome, Edge, or Safari 17+.");
      }
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
      return new Response(stream).text();
    }

    function loadCanvasJson(json) {
      return new Promise((resolve) => {
        canvas.loadFromJSON(json, () => resolve());
      });
    }

    async function restoreProject(text, fileName) {
      let project;
      try {
        project = JSON.parse(text);
      } catch (error) {
        throw new Error("That file is not a valid editable design file.");
      }
      const canvasJson = project.canvas || project.json || project;
      if (!canvasJson || !Array.isArray(canvasJson.objects)) {
        throw new Error("That file does not contain editable banner layers.");
      }

      const nextShape = normalizeShape(project.artboard && project.artboard.shape, true);
      ARTBOARD_SHAPE = MVP_5X3_ONLY ? "rectangle" : nextShape;
      const size = artboardSizeForShape(ARTBOARD_SHAPE);
      WIDTH = MVP_5X3_ONLY ? BANNER_WIDTH : Number(project.artboard && project.artboard.width) || size.width;
      HEIGHT = MVP_5X3_ONLY ? BANNER_HEIGHT : Number(project.artboard && project.artboard.height) || size.height;
      projectWasOpened = true;
      projectRestoreToken += 1;
      launch.headline = (project.product && project.product.headline) || launch.headline || "";
      launch.sizeLabel = (project.product && project.product.sizeLabel) || launch.sizeLabel || "";
      launch.price = (project.product && project.product.price) || launch.price || "";
      if (els.team && project.teamName) els.team.value = project.teamName;

      isRestoring = true;
      canvas.clear();
      canvasEl.width = WIDTH;
      canvasEl.height = HEIGHT;
      canvas.setWidth(WIDTH);
      canvas.setHeight(HEIGHT);
      await loadCanvasJson(canvasJson);
      canvas.getObjects()
        .filter((obj) => obj.data && obj.data.role === "cut-guide")
        .forEach((obj) => canvas.remove(obj));
      canvas.backgroundColor = canvasBackgroundColor((project.artboard && project.artboard.backgroundColor) || canvasJson.background || "#ffffff");
      canvas.clipPath = makeClipPath();
      teamText = canvas.getObjects().find((obj) => obj.data && obj.data.role === "team-text") || null;
      isRestoring = false;
      applyLayerLockStateToAll();
      drawGuide();
      canvas.discardActiveObject();
      canvas.renderAll();
      history = [];
      historyIndex = -1;
      saveHistory();
      syncProductInfo();
      updateStageScale();
      updateSelectionControls();
      setStatus(`${fileName || "Design file"} opened. Continue editing your custom design.`);
    }

    async function importProjectUpload(event) {
      const file = event.target.files && event.target.files[0];
      event.target.value = "";
      await importProjectFile(file);
    }

    function loadImage(src) {
      return new Promise((resolve, reject) => {
        const image = new Image();
        const timeout = window.setTimeout(() => {
          image.onload = null;
          image.onerror = null;
          reject(new Error("Image load timed out."));
        }, IMAGE_LOAD_TIMEOUT_MS);
        image.crossOrigin = "anonymous";
        image.onload = () => {
          window.clearTimeout(timeout);
          if (image.naturalWidth && image.naturalHeight) {
            image.width = image.naturalWidth;
            image.height = image.naturalHeight;
          }
          resolve(image);
        };
        image.onerror = () => {
          window.clearTimeout(timeout);
          reject(new Error("Image could not be loaded for layer conversion."));
        };
        image.src = src;
      });
    }

    function distanceSq(a, b) {
      const dr = a[0] - b[0];
      const dg = a[1] - b[1];
      const db = a[2] - b[2];
      return dr * dr + dg * dg + db * db;
    }

    function nearestPaletteIndex(color, palette) {
      let best = 0;
      let bestDistance = Infinity;
      palette.forEach((candidate, index) => {
        const dist = distanceSq(color, candidate);
        if (dist < bestDistance) {
          best = index;
          bestDistance = dist;
        }
      });
      return best;
    }

    function paletteFromImageData(data, count) {
      const buckets = new Map();
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 24) continue;
        const r = data[i] >> 4;
        const g = data[i + 1] >> 4;
        const b = data[i + 2] >> 4;
        const key = `${r},${g},${b}`;
        buckets.set(key, (buckets.get(key) || 0) + 1);
      }
      return [...buckets.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, count)
        .map(([key]) => key.split(",").map((part) => Number(part) * 16 + 8));
    }

    function componentScanCanvas(image) {
      const naturalWidth = image.naturalWidth || image.width || WIDTH;
      const naturalHeight = image.naturalHeight || image.height || HEIGHT;
      const sampleWidth = Math.max(120, Math.min(720, naturalWidth));
      const sampleHeight = Math.max(1, Math.round(sampleWidth * naturalHeight / naturalWidth));
      const sampleCanvas = document.createElement("canvas");
      sampleCanvas.width = sampleWidth;
      sampleCanvas.height = sampleHeight;
      const ctx = sampleCanvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(image, 0, 0, sampleWidth, sampleHeight);
      return { canvas: sampleCanvas, ctx, width: sampleWidth, height: sampleHeight };
    }

    function borderColorFromImageData(imageData, width, height) {
      const totals = [0, 0, 0, 0];
      const add = (x, y) => {
        const i = (y * width + x) * 4;
        const a = imageData[i + 3];
        if (a < 24) return;
        totals[0] += imageData[i];
        totals[1] += imageData[i + 1];
        totals[2] += imageData[i + 2];
        totals[3] += 1;
      };
      for (let x = 0; x < width; x += 1) {
        add(x, 0);
        add(x, height - 1);
      }
      for (let y = 1; y < height - 1; y += 1) {
        add(0, y);
        add(width - 1, y);
      }
      if (!totals[3]) return [255, 255, 255];
      return totals.slice(0, 3).map((value) => value / totals[3]);
    }

    function imageAlphaStats(imageData) {
      let transparent = 0;
      let semiTransparent = 0;
      const total = imageData.length / 4;
      for (let i = 0; i < imageData.length; i += 4) {
        const alpha = imageData[i + 3];
        if (alpha < 32) transparent += 1;
        if (alpha < 220) semiTransparent += 1;
      }
      return {
        transparentRatio: transparent / Math.max(1, total),
        semiTransparentRatio: semiTransparent / Math.max(1, total)
      };
    }

    function findMagicComponents(image) {
      const sample = componentScanCanvas(image);
      const { width, height } = sample;
      const pixels = sample.ctx.getImageData(0, 0, width, height);
      const data = pixels.data;
      const stats = imageAlphaStats(data);
      const hasRealTransparency = stats.transparentRatio > 0.018 || stats.semiTransparentRatio > 0.08;
      const background = borderColorFromImageData(data, width, height);
      const totalPixels = width * height;
      const mask = new Uint8Array(totalPixels);
      const visited = new Uint8Array(totalPixels);

      for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
        const alpha = data[i + 3];
        if (alpha < 36) continue;
        if (hasRealTransparency) {
          mask[p] = 1;
          continue;
        }
        const distance = Math.sqrt(distanceSq([data[i], data[i + 1], data[i + 2]], background));
        const saturation = Math.max(data[i], data[i + 1], data[i + 2]) - Math.min(data[i], data[i + 1], data[i + 2]);
        if (distance > 74 && saturation > 16) mask[p] = 1;
      }

      const minArea = Math.max(28, Math.round(totalPixels * 0.0012));
      const maxWholeImageArea = Math.round(totalPixels * (hasRealTransparency ? 0.92 : 0.42));
      const components = [];
      const stack = [];

      for (let start = 0; start < totalPixels; start += 1) {
        if (!mask[start] || visited[start]) continue;
        let area = 0;
        let minX = width;
        let maxX = 0;
        let minY = height;
        let maxY = 0;
        stack.length = 0;
        stack.push(start);
        visited[start] = 1;

        while (stack.length) {
          const idx = stack.pop();
          const x = idx % width;
          const y = Math.floor(idx / width);
          area += 1;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;

          const neighbors = [
            x > 0 ? idx - 1 : -1,
            x < width - 1 ? idx + 1 : -1,
            y > 0 ? idx - width : -1,
            y < height - 1 ? idx + width : -1
          ];
          neighbors.forEach((next) => {
            if (next < 0 || visited[next] || !mask[next]) return;
            visited[next] = 1;
            stack.push(next);
          });
        }

        const boxWidth = maxX - minX + 1;
        const boxHeight = maxY - minY + 1;
        if (area < minArea || boxWidth < 7 || boxHeight < 7) continue;
        if (!hasRealTransparency && area > maxWholeImageArea) continue;
        components.push({ area, minX, minY, maxX, maxY, boxWidth, boxHeight });
      }

      return components
        .sort((a, b) => b.area - a.area)
        .slice(0, layerCount())
        .map((component) => {
          const pad = hasRealTransparency ? 4 : 2;
          const minX = Math.max(0, component.minX - pad);
          const minY = Math.max(0, component.minY - pad);
          const maxX = Math.min(width - 1, component.maxX + pad);
          const maxY = Math.min(height - 1, component.maxY + pad);
        return {
          x: minX / width,
          y: minY / height,
          width: Math.max(1, maxX - minX + 1) / width,
          height: Math.max(1, maxY - minY + 1) / height,
          area: component.area,
            areaRatio: component.area / Math.max(1, totalPixels),
            backgroundColor: background,
            alphaBased: hasRealTransparency
          };
        });
    }

    function imagePlacementForComponents(image, originalPlacement) {
      const naturalWidth = image.naturalWidth || image.width || WIDTH;
      const naturalHeight = image.naturalHeight || image.height || HEIGHT;
      if (originalPlacement && originalPlacement.scaleX && originalPlacement.scaleY) {
        return {
          left: originalPlacement.left,
          top: originalPlacement.top,
          originX: originalPlacement.originX || "center",
          originY: originalPlacement.originY || "center",
          angle: originalPlacement.angle || 0,
          scaleX: originalPlacement.scaleX,
          scaleY: originalPlacement.scaleY,
          width: naturalWidth * originalPlacement.scaleX,
          height: naturalHeight * originalPlacement.scaleY
        };
      }
      const fitted = fitImagePlacement(image, 0.9);
      return {
        ...fitted,
        width: naturalWidth * fitted.scaleX,
        height: naturalHeight * fitted.scaleY
      };
    }

    function componentPoint(component, placement) {
      return {
        left: placement.left + (component.x + component.width / 2 - 0.5) * placement.width,
        top: placement.top + (component.y + component.height / 2 - 0.5) * placement.height,
        width: Math.max(10, component.width * placement.width),
        height: Math.max(10, component.height * placement.height)
      };
    }

    function magicForegroundPixel(data, index, component, localBackground) {
      const alpha = data[index + 3];
      if (alpha < 36) return false;
      if (component.alphaBased) return true;
      const color = [data[index], data[index + 1], data[index + 2]];
      const saturation = Math.max(color[0], color[1], color[2]) - Math.min(color[0], color[1], color[2]);
      const globalDistance = Math.sqrt(distanceSq(color, component.backgroundColor || [255, 255, 255]));
      const localDistance = Math.sqrt(distanceSq(color, localBackground || component.backgroundColor || [255, 255, 255]));
      return saturation > 14 && Math.max(globalDistance, localDistance) > 62;
    }

    function cropMagicComponentCanvas(image, component) {
      const sourceWidth = image.naturalWidth || image.width || WIDTH;
      const sourceHeight = image.naturalHeight || image.height || HEIGHT;
      const crop = normalizedCropFromPixels(image, {
        x: component.x * sourceWidth,
        y: component.y * sourceHeight,
        width: component.width * sourceWidth,
        height: component.height * sourceHeight
      });
      const area = cropRatio(image, crop);
      const layerCanvas = document.createElement("canvas");
      layerCanvas.width = Math.max(1, area.width);
      layerCanvas.height = Math.max(1, area.height);
      const ctx = layerCanvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(image, area.x, area.y, area.width, area.height, 0, 0, area.width, area.height);

      const imageData = ctx.getImageData(0, 0, area.width, area.height);
      const localBackground = borderColorFromImageData(imageData.data, area.width, area.height);
      for (let i = 0; i < imageData.data.length; i += 4) {
        if (!magicForegroundPixel(imageData.data, i, component, localBackground)) {
          imageData.data[i + 3] = 0;
        }
      }
      ctx.putImageData(imageData, 0, 0);
      return layerCanvas;
    }

    function addMagicObjectLayer(image, component, placement, name, index) {
      const point = componentPoint(component, placement);
      const layerCanvas = cropMagicComponentCanvas(image, component);
      const layer = new fabric.Image(layerCanvas, {
        left: point.left,
        top: point.top,
        originX: "center",
        originY: "center",
        angle: placement.angle || 0,
        data: {
          name: `${name} object ${index + 1}`,
          role: "magic-object-layer",
          showInLayerList: true,
          sourceUrl: "uploaded-image",
          cropSource: "magic-layer"
        }
      });
      layer.scaleToWidth(point.width);
      if (point.height && layer.getScaledHeight() > point.height) layer.scaleToHeight(point.height);
      ensureLayerId(layer);
      canvas.add(layer);
      layer.set({
        selectable: true,
        evented: true,
        hasControls: true,
        lockMovementX: false,
        lockMovementY: false,
        lockScalingX: false,
        lockScalingY: false,
        lockRotation: false
      });
      return layer;
    }

    function addReplacementTarget(placement, config = {}) {
      if (!placement) return null;
      const point = recipePoint(placement.x, placement.y);
      const target = new fabric.Rect({
        left: point.left,
        top: point.top,
        originX: "center",
        originY: "center",
        width: artboardRatioWidth(placement.width || 0.1),
        height: artboardRatioHeight(placement.height || 0.1),
        fill: "rgba(255,255,255,0.01)",
        stroke: "rgba(30,58,138,0.01)",
        strokeWidth: 1,
        opacity: 0.01,
        data: {
          name: config.name || "Replacement target",
          role: config.role || "template-image-layer",
          showInLayerList: true,
          cropSource: "magic-placeholder",
          source: "magic-placeholder"
        }
      });
      ensureLayerId(target);
      canvas.add(target);
      return target;
    }

    function addMagicTemplateTargets() {
      const recipe = productLayerRecipe();
      if (recipe.topTexts) {
        recipe.topTexts.forEach((item) => {
          const point = recipePoint(item.x, item.y);
          addTemplateText({
            text: item.text,
            name: item.name,
            left: point.left,
            top: point.top,
            fontSize: artboardTextSize(item.size, 24)
          });
        });
      }
      if (recipe.teamName) {
        addReplacementTarget(recipe.teamName, {
          name: "Team name",
          role: "template-team-name"
        });
      }
      if (recipe.clipart) {
        addReplacementTarget(recipe.clipart, {
          name: "Clip art",
          role: "template-clipart"
        });
      }
      if (recipe.players) {
        const count = Math.max(recipe.config.playerIconCount, recipe.config.playerTextCount, 0);
        recipe.players.slice(0, count).forEach((player) => {
          if (player.number <= recipe.config.playerIconCount) {
            addReplacementTarget(player.icon, {
              name: `Player icon ${player.number}`,
              role: "template-player-icon"
            });
          }
          if (player.number <= recipe.config.playerTextCount) {
            const point = recipePoint(player.text.x, player.text.y);
            addTemplateText({
              text: recipe.config.playerLabel || "Player",
              name: `Player text ${player.number}`,
              role: "template-player-text",
              left: point.left,
              top: point.top,
              fontSize: artboardTextSize(player.text.size, 24),
              stroke: "#8e959d",
              strokeWidth: 3,
              shadow: "2px 2px 0 rgba(0,0,0,.42)"
            });
          }
        });
        return;
      }
      if (recipe.accessory) {
        addReplacementTarget(recipe.accessory, {
          name: "Accessory",
          role: "template-player-icon"
        });
      }
      (recipe.texts || []).forEach((item) => {
        const point = recipePoint(item.x, item.y);
        addTemplateText({
          text: item.text.toLowerCase() === "player" ? recipe.config.playerLabel || "Player" : item.text,
          name: item.name,
          role: item.text.toLowerCase() === "year" ? "template-year-text" : "template-player-text",
          left: point.left,
          top: point.top,
          fontSize: artboardTextSize(item.size, 34),
          stroke: "#000000",
          strokeWidth: 4,
          shadow: "2px 2px 0 rgba(0,0,0,.35)"
        });
      });
    }

    async function convertImageSourceToMagicLayers(source, name, originalPlacement) {
      const image = typeof source === "string" ? await loadImage(source) : source;
      const components = findMagicComponents(image);
      const alphaComponentCount = components.filter((component) => component.alphaBased).length;
      const objectCandidates = components
        .filter((component) => component.alphaBased || (
          component.areaRatio >= 0.0025
          && component.areaRatio <= 0.22
          && component.width <= 0.72
          && component.height <= 0.82
        ))
        .slice(0, Math.max(1, Math.min(layerCount(), 8)));

      if (alphaComponentCount >= 1) {
        const placement = imagePlacementForComponents(image, originalPlacement);
        const added = objectCandidates.map((component, index) => addMagicObjectLayer(image, component, placement, name, index));
        if (added.length > 1) {
          canvas.setActiveObject(new fabric.ActiveSelection(added, { canvas }));
        } else if (added.length === 1) {
          canvas.setActiveObject(added[0]);
        }
        keepGuideOnTop();
        canvas.renderAll();
        saveHistory();
        updateSelectionControls();
        setStatus(`${name} converted into ${added.length} draggable object layer${added.length === 1 ? "" : "s"}.`);
        return;
      }

      if (!originalPlacement) {
        resetCanvas("#ffffff");
        addExactProductBackground(image, { sourceUrl: "uploaded-image", source: "uploaded-image" });
        const placement = imagePlacementForComponents(image);
        const addedObjects = objectCandidates.map((component, index) => addMagicObjectLayer(image, component, placement, name, index));
        addMagicTemplateTargets();
        if (addedObjects.length > 1) {
          canvas.setActiveObject(new fabric.ActiveSelection(addedObjects, { canvas }));
        } else if (addedObjects.length === 1) {
          canvas.setActiveObject(addedObjects[0]);
        } else {
          canvas.discardActiveObject();
        }
        keepGuideOnTop();
        canvas.renderAll();
        saveHistory();
        updateSelectionControls();
        setStatus(`${name} loaded as MVP Magic Layers: ${addedObjects.length} object cutout${addedObjects.length === 1 ? "" : "s"}, locked background, editable text, and replaceable targets.`);
        return;
      }

      await convertImageSourceToLayers(image, name, originalPlacement);
    }

    async function convertImageSourceToLayers(source, name, originalPlacement) {
      const image = typeof source === "string" ? await loadImage(source) : source;
      const count = layerCount();
      const naturalWidth = image.naturalWidth || image.width || 140;
      const naturalHeight = image.naturalHeight || image.height || 140;
      const sampleWidth = Math.max(140, Math.min(420, naturalWidth, Math.round(WIDTH * 0.78)));
      const sampleHeight = Math.max(1, Math.round(sampleWidth * naturalHeight / naturalWidth));
      const sampleCanvas = document.createElement("canvas");
      sampleCanvas.width = sampleWidth;
      sampleCanvas.height = sampleHeight;
      const sampleCtx = sampleCanvas.getContext("2d", { willReadFrequently: true });
      sampleCtx.drawImage(image, 0, 0, sampleWidth, sampleHeight);
      const imageData = sampleCtx.getImageData(0, 0, sampleWidth, sampleHeight);
      const palette = paletteFromImageData(imageData.data, count);
      if (!palette.length) throw new Error("No visible pixels found.");

      const layerCanvases = palette.map(() => {
        const layerCanvas = document.createElement("canvas");
        layerCanvas.width = sampleWidth;
        layerCanvas.height = sampleHeight;
        return layerCanvas;
      });
      const layerImages = layerCanvases.map((layerCanvas) => {
        const ctx = layerCanvas.getContext("2d");
        return ctx.createImageData(sampleWidth, sampleHeight);
      });

      for (let i = 0; i < imageData.data.length; i += 4) {
        if (imageData.data[i + 3] < 24) continue;
        const color = [imageData.data[i], imageData.data[i + 1], imageData.data[i + 2]];
        const paletteIndex = nearestPaletteIndex(color, palette);
        const target = layerImages[paletteIndex].data;
        target[i] = palette[paletteIndex][0];
        target[i + 1] = palette[paletteIndex][1];
        target[i + 2] = palette[paletteIndex][2];
        target[i + 3] = imageData.data[i + 3];
      }

      const defaultPoint = recipePoint(0.5, 0.5);
      const placement = originalPlacement || {
        left: defaultPoint.left,
        top: defaultPoint.top,
        width: ARTBOARD_SHAPE === "rectangle" ? artboardRatioWidth(0.92) : artboardRatioWidth(0.42),
        originX: "center",
        originY: "center",
        angle: 0
      };

      const added = [];
      layerCanvases.forEach((layerCanvas, index) => {
        layerCanvas.getContext("2d").putImageData(layerImages[index], 0, 0);
        const layerImage = new fabric.Image(layerCanvas, {
          left: placement.left,
          top: placement.top,
          originX: placement.originX || "center",
          originY: placement.originY || "center",
          angle: placement.angle || 0,
          data: { name: `${name} layer ${index + 1}`, role: "png-color-layer", color: palette[index] }
        });
        if (placement.scaleX && placement.scaleY) {
          layerImage.set({ scaleX: placement.scaleX, scaleY: placement.scaleY });
        } else {
          layerImage.scaleToWidth(placement.width || artboardRatioWidth(0.42));
        }
        canvas.add(layerImage);
        added.push(layerImage);
      });

      if (added.length) {
        const selection = new fabric.ActiveSelection(added, { canvas });
        canvas.setActiveObject(selection);
      }
      keepGuideOnTop();
      canvas.renderAll();
      saveHistory();
      updateSelectionControls();
      setStatus(`${name} converted into ${added.length} color layers.`);
    }

    async function convertPngUpload(event) {
      const file = event.target.files && event.target.files[0];
      event.target.value = "";
      if (!file) return;
      try {
        setStatus("Converting PNG into MVP Magic Layers...");
        await convertImageSourceToMagicLayers(await readFileAsDataUrl(file), file.name.replace(/\.[^.]+$/, ""));
      } catch (error) {
        setStatus(error.message || "Could not convert that PNG.");
      }
    }

    async function convertSelectedImageToLayers() {
      const obj = selectedObject();
      if (!obj || obj.type !== "image") {
        setStatus("Select a PNG/image layer first.");
        return;
      }
      try {
        setStatus("Converting selected image into MVP Magic Layers...");
        const element = obj.getElement();
        const placement = {
          left: obj.left,
          top: obj.top,
          originX: obj.originX,
          originY: obj.originY,
          angle: obj.angle,
          scaleX: obj.scaleX,
          scaleY: obj.scaleY
        };
        const name = (obj.data && obj.data.name) || "Selected PNG";
        canvas.remove(obj);
        await convertImageSourceToMagicLayers(element, name, placement);
      } catch (error) {
        setStatus("Could not convert selected image. Try uploading the PNG directly.");
      }
    }

    function extractSvgLayerHints(svgText) {
      const hints = [];
      const elementPattern = /<(image|text)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/\1>)/gi;
      let match;
      while ((match = elementPattern.exec(svgText))) {
        const tag = match[1].toLowerCase();
        const attrs = match[2] || "";
        const content = match[3] || "";
        const href = (attrs.match(/\b(?:xlink:href|href)=["']([^"']+)["']/i) || [])[1] || "";
        const className = (attrs.match(/\bclass=["']([^"']+)["']/i) || [])[1] || "";
        const text = tag === "text"
          ? compactWhitespace(content.replace(/<[^>]+>/g, " "))
          : "";
        hints.push({ tag, href, className, text });
      }
      return hints;
    }

    function classifySvgHint(hint, obj, index, fallbackName) {
      const asset = hint.href ? findAssetByUrl(hint.href) : null;
      const text = compactWhitespace(hint.text || (obj && obj.text) || "");
      const lowerText = text.toLowerCase();
      const className = String(hint.className || "").toLowerCase();
      const categoryRole = asset ? categoryLayerRole(asset.category) : "";
      let role = categoryRole || "svg-layer";
      let label = asset ? asset.name : `${fallbackName} layer ${index + 1}`;
      let locked = false;
      let excludeFromLayerList = false;

      if (hint.tag === "text" || obj.type === "i-text" || obj.type === "text") {
        if (/^player$/i.test(text)) {
          role = "template-player-text";
          label = `Player text ${index + 1}`;
        } else if (/^year$/i.test(text)) {
          role = "template-year-text";
          label = "Year text";
        } else if (/coach|team mom|team mom/.test(lowerText)) {
          role = "template-text-layer";
          label = /coach/.test(lowerText) ? "Coach name" : "Team mom name";
        } else {
          role = "template-text-layer";
          label = text || label;
        }
      } else if (className.includes("background") || categoryRole === "template-background") {
        role = "template-background";
        label = "Background";
        locked = true;
      } else if (categoryRole === "template-team-name") {
        label = "Team name";
      } else if (categoryRole === "template-clipart") {
        label = "Clip art";
      } else if (categoryRole === "template-player-icon") {
        label = `Player icon ${index + 1}`;
      } else if (!hint.tag && obj.type === "path") {
        role = "svg-mask";
        label = "SVG mask";
        locked = true;
        excludeFromLayerList = true;
      }

      return {
        data: {
          ...(obj.data || {}),
          ...assetMetadata(asset || (hint.href ? { name: label, category: "", url: hint.href } : null)),
          name: label,
          role,
          sourceUrl: asset ? asset.url : hint.href || "",
          locked,
          excludeFromLayerList,
          showInLayerList: !excludeFromLayerList
        },
        locked,
        excludeFromLayerList
      };
    }

    function importSvgLayers(svgText, name) {
      const hints = extractSvgLayerHints(svgText);
      return new Promise((resolve, reject) => {
        fabric.loadSVGFromString(svgText, (objects, options) => {
          if (!objects || !objects.length) {
            reject(new Error("No SVG layers were found."));
            return;
          }
          const group = fabric.util.groupSVGElements(objects, options);
          group.set({ data: { name } });
          const maxWidth = WIDTH * (isRectangularShape(ARTBOARD_SHAPE) ? 0.94 : 0.72);
          if (group.width > maxWidth) group.scaleToWidth(maxWidth);
          if (group.getScaledHeight() > HEIGHT * 0.9) group.scaleToHeight(HEIGHT * 0.9);
          canvas.add(group);
          canvas.centerObject(group);
          canvas.setActiveObject(group);
          const selection = group.toActiveSelection();
          selection.getObjects().forEach((obj, index) => {
            const classified = classifySvgHint(hints[index] || {}, obj, index, name);
            obj.set({
              selectable: !classified.locked,
              evented: !classified.locked,
              data: classified.data
            });
            ensureLayerId(obj);
            if (classified.locked) setObjectLocked(obj, true);
          });
          const editable = selection.getObjects().filter((obj) => !isLayerLocked(obj) && !(obj.data && obj.data.excludeFromLayerList));
          if (editable.length > 1) {
            canvas.setActiveObject(new fabric.ActiveSelection(editable, { canvas }));
          } else if (editable.length === 1) {
            canvas.setActiveObject(editable[0]);
          } else {
            canvas.discardActiveObject();
          }
          keepGuideOnTop();
          canvas.renderAll();
          saveHistory();
          updateSelectionControls();
          setStatus(`${name} imported as ${selection.getObjects().length} SVG layers.`);
          resolve(selection);
        });
      });
    }

    async function importSvgUpload(event) {
      const file = event.target.files && event.target.files[0];
      event.target.value = "";
      if (!file) return;
      try {
        setStatus("Importing SVG layers...");
        await importSvgLayers(await readFileAsText(file), file.name.replace(/\.svg$/i, ""));
      } catch (error) {
        setStatus(error.message || "Could not import SVG layers.");
      }
    }

    async function loadSvgTemplates() {
      const url = root.dataset.svgTemplatesUrl;
      if (!url || (!els.svgTemplates && !els.generatorSvg)) return;
      try {
        const response = await fetch(url, { credentials: "omit" });
        if (!response.ok) throw new Error("SVG template manifest failed.");
        const data = await response.json();
        svgTemplates = (Array.isArray(data.templates) ? data.templates : [])
          .map(normalizeSvgTemplateEntry)
          .filter((template) => template.url);
        renderSvgTemplates();
        renderGeneratorSvgOptions();
      } catch (error) {
        if (els.svgTemplates) els.svgTemplates.innerHTML = "";
        renderGeneratorSvgOptions();
      }
    }

    function renderSvgTemplates() {
      if (!els.svgTemplates) {
        renderGeneratorSvgOptions();
        return;
      }
      els.svgTemplates.innerHTML = "";
      svgTemplates.slice(0, 12).forEach((template) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "tbd__svg-template";
        button.textContent = template.name;
        button.title = template.name;
        button.addEventListener("click", async () => {
          try {
            setStatus("Loading SVG template...");
            const response = await fetch(template.url, { credentials: "omit" });
            if (!response.ok) throw new Error("Template failed to load.");
            await importSvgLayers(await response.text(), template.name);
          } catch (error) {
            setStatus("Could not import that SVG template.");
          }
        });
        els.svgTemplates.appendChild(button);
      });
      renderGeneratorSvgOptions();
    }

    async function loadProductDesign() {
      if (!launch.hasDesign) return;
      const name = launch.title || "Product artwork";
      resetCanvas("#ffffff");

      try {
        const layerConfig = currentLayerConfig();
        const shouldUseMatchedSvg = !launch.layerMap
          && launch.templateSvg
          && (launch.sourceTemplateOnly || layerConfig.layoutSource === "svg-template")
          && ["svg", "png", "magic"].includes(launch.autoLayer);
        if (launch.templateSvg && (shouldUseMatchedSvg || (!launch.image && launch.autoLayer !== "png" && launch.autoLayer !== "image" && launch.autoLayer !== "color"))) {
          setStatus("Loading product SVG layers...");
          if (shouldUseMatchedSvg) {
            const usedRecipe = await addSvgTemplateRecipeLayers({
              name,
              title: name,
              url: launch.templateSvg
            }, {
              ...productSvgTemplateOptions(),
              layerConfig,
              preserveSvgAssets: true
            });
            if (usedRecipe) {
              canvas.discardActiveObject();
              keepGuideOnTop();
              canvas.renderAll();
              saveHistory();
              updateSelectionControls();
              setStatus(`${name} loaded from exact source SVG layers.`);
              return;
            }
          }
          const response = await fetch(resolveSourceUrl(launch.templateSvg), { credentials: "omit" });
          if (!response.ok) throw new Error("Product SVG failed to load.");
          await importSvgLayers(await response.text(), name);
          return;
        }

        if (!launch.image) throw new Error("No product image was provided.");
        setStatus("Loading product artwork...");
        if (els.layerCount && !els.layerCount.dataset.userChanged) els.layerCount.value = "16";
        const productImageUrl = canvasSafeImageUrl(launch.image, imageProxyEndpoint);
        const image = await loadImage(productImageUrl);
        const placement = fitImagePlacement(image, 0.94);

        if (launch.autoLayer === "image") {
          addLoadedImageLayer(image, name, placement);
          return;
        }

        if (launch.autoLayer === "magic") {
          await convertImageSourceToMagicLayers(image, name);
          return;
        }

        if (launch.autoLoadProduct && launch.autoLayer === "png" && !launch.templateSvg && !launch.layerMap && !launch.sourceSvgMap) {
          addExactProductBackground(image, { sourceUrl: launch.image, source: "product-image-fallback" });
          canvas.discardActiveObject();
          keepGuideOnTop();
          canvas.renderAll();
          saveHistory();
          updateSelectionControls();
          setStatus("No verified source SVG map yet. Product loaded as exact full-background artwork so assets are not guessed.");
          return;
        }

        if (launch.autoLayer !== "color") {
          await buildProductTemplateLayers(image, name);
          return;
        }

        await convertImageSourceToLayers(image, name, {
          left: placement.left,
          top: placement.top,
          originX: placement.originX,
          originY: placement.originY,
          width: (image.naturalWidth || image.width || WIDTH) * placement.scaleX,
          angle: placement.angle || 0
        });
      } catch (error) {
        if (launch.image) {
          try {
            const image = await loadImage(canvasSafeImageUrl(launch.image, imageProxyEndpoint));
            addExactProductBackground(image, { sourceUrl: launch.image, source: "product-image-fallback" });
            canvas.discardActiveObject();
            keepGuideOnTop();
            canvas.renderAll();
            saveHistory();
            updateSelectionControls();
            setStatus("Product loaded as exact full-background artwork. Use SVG source for exact editable layers.");
            return;
          } catch (fallbackError) {
            // The final status below covers both the conversion and single-layer fallback failure.
          }
        }
        setStatus(error.message || "Could not load the product artwork.");
      }
    }

    function bind() {
      const onAll = (selector, handler) => {
        root.querySelectorAll(selector).forEach((element) => element.addEventListener("click", handler));
      };
      onAll("[data-tbd-add-text]", addOrUpdateTextFromPanel);
      onAll("[data-tbd-download]", downloadProjectFile);
      onAll("[data-tbd-download-proof]", downloadProof);
      onAll("[data-tbd-add-cart]", saveOrAddToCart);
      onAll("[data-tbd-duplicate]", duplicateSelected);
      onAll("[data-tbd-delete]", deleteSelected);
      onAll("[data-tbd-clear]", clearDesign);
      onAll("[data-tbd-undo]", () => restoreHistory(historyIndex - 1));
      onAll("[data-tbd-redo]", () => restoreHistory(historyIndex + 1));
      onAll("[data-tbd-rect]", () => addShape("rectangle"));
      onAll("[data-tbd-circle]", () => addShape("circle"));
      onAll("[data-tbd-upload-trigger]", () => els.upload && els.upload.click());
      onAll("[data-tbd-project-upload-trigger]", () => els.projectUpload && els.projectUpload.click());
      onAll("[data-tbd-png-layer-trigger]", () => els.pngLayerUpload && els.pngLayerUpload.click());
      onAll("[data-tbd-svg-layer-trigger]", () => els.svgLayerUpload && els.svgLayerUpload.click());
      onAll("[data-tbd-selected-to-layers]", convertSelectedImageToLayers);
      onAll("[data-tbd-front]", () => layer("front"));
      onAll("[data-tbd-forward]", () => layer("forward"));
      onAll("[data-tbd-backward]", () => layer("backward"));
      onAll("[data-tbd-back]", () => layer("back"));
      onAll("[data-tbd-align]", (event) => alignSelected(event.currentTarget.dataset.tbdAlign));
      onAll("[data-tbd-rotate]", (event) => rotateSelected(Number(event.currentTarget.dataset.tbdRotate) || 0));
      onAll("[data-tbd-text-align]", (event) => applyTextSelection({ textAlign: event.currentTarget.dataset.tbdTextAlign || "center" }));
      onAll("[data-tbd-text-style]", (event) => toggleTextStyle(event.currentTarget.dataset.tbdTextStyle));
      onAll("[data-tbd-gradient-set]", applyGradientToSelection);
      [els.gradientStart, els.gradientEnd, els.gradientType, els.gradientX1, els.gradientY1, els.gradientX2, els.gradientY2].forEach((control) => {
        if (!control) return;
        control.addEventListener("input", () => {
          updateGradientBar();
          applyGradientToSelection({ preview: true, quiet: true, skipControls: true });
        });
        control.addEventListener("change", () => applyGradientToSelection());
      });
      els.gradientBar?.addEventListener("pointerdown", (event) => {
        const stop = event.target.dataset.tbdGradientStop || nearestGradientStop(event);
        event.preventDefault();
        try {
          els.gradientBar.setPointerCapture?.(event.pointerId);
        } catch (error) {
          // Pointer capture is a nice-to-have; window-level listeners keep dragging usable without it.
        }
        setGradientStopFromPointer(event, stop, { preview: true, quiet: true });
        const move = (moveEvent) => setGradientStopFromPointer(moveEvent, stop, { preview: true, quiet: true });
        const up = (upEvent) => {
          setGradientStopFromPointer(upEvent, stop);
          try {
            els.gradientBar.releasePointerCapture?.(upEvent.pointerId);
          } catch (error) {
            // See pointer capture note above.
          }
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", up);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up, { once: true });
      });
      els.gradientBar?.addEventListener("keydown", (event) => {
        if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
        event.preventDefault();
        const stop = event.shiftKey ? "end" : "start";
        const direction = event.key === "ArrowRight" ? 0.05 : -0.05;
        setGradientStop(stop, gradientStopOffsets[stop] + direction);
      });
      onAll("[data-tbd-bg-fit]", () => placeSelectedBackground("fit"));
      onAll("[data-tbd-bg-fill]", () => placeSelectedBackground("fill"));
      onAll("[data-tbd-bg-center]", () => placeSelectedBackground("center"));
      els.cartCheckout?.addEventListener("click", () => {
        redirectToShopifyCheckout();
      });
      els.cartContinue?.addEventListener("click", () => setCartPanelOpen(false));
      root.querySelectorAll("[data-tbd-tool]").forEach((button) => {
        button.addEventListener("click", () => setToolMode(button.dataset.tbdTool));
        button.addEventListener("touchend", (event) => {
          event.preventDefault();
          setToolMode(button.dataset.tbdTool);
        }, { passive: false });
      });
      root.querySelectorAll("[data-tbd-panel-toggle]").forEach((button) => {
        button.addEventListener("click", () => {
          togglePanel(button.dataset.tbdPanelToggle);
        });
      });

      els.team?.addEventListener("change", addTeamText);
      els.categorySelect?.addEventListener("change", (event) => {
        activeCategory = event.target.value;
        assetPage = 1;
        renderCategories();
        renderAssets();
      });
      root.querySelector("[data-tbd-find]")?.addEventListener("click", () => {
        assetPage = 1;
        renderAssets();
      });
      els.layerCount?.addEventListener("change", () => {
        els.layerCount.dataset.userChanged = "true";
      });
      els.shapeSelects.forEach((select) => {
        select.addEventListener("change", (event) => {
          switchShape(event.target.value);
        });
      });
      els.search?.addEventListener("input", (event) => {
        searchTerm = event.target.value.trim().toLowerCase();
        assetPage = 1;
        renderAssets();
      });
      els.templateSearch?.addEventListener("input", (event) => {
        templateSearchTerm = event.target.value.trim().toLowerCase();
        templatePage = 1;
        renderTemplates();
      });
      els.templateSport?.addEventListener("change", (event) => {
        templateSportFilter = event.target.value || "all";
        templatePage = 1;
        syncGeneratorSelectsFromTemplate();
        renderTemplates();
      });
      els.templateType?.addEventListener("change", (event) => {
        templateTypeFilter = event.target.value || "all";
        templatePage = 1;
        syncGeneratorSelectsFromTemplate();
        renderTemplates();
      });
      els.templateMobileMode?.addEventListener("change", (event) => scrollTemplateWorkflow(event.target.value));
      els.templateAuto?.addEventListener("change", syncTemplateAutoScroll);
      els.templateDesign?.addEventListener("click", designSelectedTemplate);
      els.templateGeneratorToggle?.addEventListener("click", toggleTemplateGenerator);
      els.generatorPreview?.addEventListener("click", () => applyGeneratedTemplate(generatorOptions(), { closePanel: false }));
      els.generatorPreviewAll?.addEventListener("click", previewAllGeneratedLayouts);
      els.generatorDesign?.addEventListener("click", () => applyGeneratedTemplate(generatorOptions(), { closePanel: true }));
      els.generatorClear?.addEventListener("click", () => clearDesign({ skipConfirm: true }));
      els.generatorSaveSetup?.addEventListener("click", saveGeneratorSetup);
      els.generatorLoadSetup?.addEventListener("click", loadGeneratorSetup);
      [els.generatorSport, els.generatorType, els.generatorPlayerCount, els.generatorSvg].forEach((control) => {
        control?.addEventListener("change", () => {
          if (control === els.generatorPlayerCount) renderGeneratorPlayerNameInputs();
          clearGeneratorPreviewState(control !== els.generatorSvg);
          renderGeneratorOptionPanels();
        });
      });
      els.generatorAssetSearch?.addEventListener("input", (event) => {
        generatorAssetSearchTerm = layerMatchText(event.target.value || "");
        clearGeneratorPreviewState();
        renderGeneratorOptionPanels();
      });
      els.generatorTeam?.addEventListener("input", () => {
        clearGeneratorPreviewState();
        renderGeneratorOptionPanels();
      });
      [els.generatorManager, els.generatorAssistantManager, els.generatorCoach, els.generatorAssistantCoach, els.generatorTeamMom, els.generatorSponsor].forEach((control) => {
        control?.addEventListener("input", () => clearGeneratorPreviewState());
      });
      els.stage?.addEventListener("dragover", (event) => {
        if (!Array.from(event.dataTransfer.types || []).includes("application/x-team-banner-asset")) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        els.stage.classList.add("is-asset-drop-target");
      });
      els.stage?.addEventListener("dragleave", () => {
        els.stage.classList.remove("is-asset-drop-target");
      });
      els.stage?.addEventListener("drop", (event) => {
        const asset = parseDroppedAsset(event);
        if (!asset) return;
        event.preventDefault();
        els.stage.classList.remove("is-asset-drop-target");
        addDroppedAsset(asset, event.clientX, event.clientY);
      });
      window.addEventListener("pointermove", (event) => {
        if (!assetDragState || event.pointerId !== assetDragState.pointerId) return;
        assetDragState.x = event.clientX;
        assetDragState.y = event.clientY;
        const distance = Math.hypot(event.clientX - assetDragState.startX, event.clientY - assetDragState.startY);
        if (!assetDragState.dragging && distance > 8) {
          assetDragState.dragging = true;
          suppressAssetClick = true;
          assetDragState.ghost = createAssetDragGhost(assetDragState.asset);
          try {
            assetDragState.button.setPointerCapture?.(event.pointerId);
          } catch (error) {
            // Window-level pointer listeners keep drag/drop working if capture is unavailable.
          }
        }
        if (assetDragState.dragging) {
          event.preventDefault();
          positionAssetDragGhost(assetDragState);
          els.stage?.classList.toggle("is-asset-drop-target", isPointInsideStage(event.clientX, event.clientY));
        }
      }, { passive: false });
      window.addEventListener("pointerup", (event) => {
        if (!assetDragState || event.pointerId !== assetDragState.pointerId) return;
        const state = assetDragState;
        assetDragState = null;
        try {
          state.button.releasePointerCapture?.(event.pointerId);
        } catch (error) {
          // Matching the pointer-capture fallback above.
        }
        if (state.ghost) state.ghost.remove();
        els.stage?.classList.remove("is-asset-drop-target");
        if (state.dragging) {
          event.preventDefault();
          addDroppedAsset(state.asset, event.clientX, event.clientY);
        }
      }, { passive: false });
      els.upload?.addEventListener("change", handleUpload);
      els.projectUpload?.addEventListener("change", importProjectUpload);
      els.pngLayerUpload?.addEventListener("change", convertPngUpload);
      els.svgLayerUpload?.addEventListener("change", importSvgUpload);
      els.bgColor?.addEventListener("input", (event) => {
        canvas.backgroundColor = canvasBackgroundColor(event.target.value);
        canvas.renderAll();
        saveHistory();
      });
      els.fills.forEach((control) => control.addEventListener("input", (event) => applySelection({ fill: event.target.value })));
      els.strokes.forEach((control) => control.addEventListener("input", (event) => applySelection({ stroke: event.target.value })));
      els.opacities.forEach((control) => control.addEventListener("input", (event) => applySelection({ opacity: Number(event.target.value) / 100 })));
      els.opacityValues.forEach((control) => control.addEventListener("input", (event) => applySelection({ opacity: Math.max(0, Math.min(1, Number(event.target.value))) })));
      els.strokeWidths.forEach((control) => control.addEventListener("input", (event) => applySelection({ strokeWidth: Number(event.target.value) || 0 })));
      els.charSpacings.forEach((control) => control.addEventListener("input", (event) => {
        const obj = selectedObject();
        if (obj && obj.type === "i-text") applyTextSelection({ charSpacing: Number(event.target.value) || 0 });
      }));
      els.lineHeights.forEach((control) => control.addEventListener("input", (event) => {
        const obj = selectedObject();
        if (obj && obj.type === "i-text") applyTextSelection({ lineHeight: Math.max(0.6, Number(event.target.value) || 1) });
      }));
      els.sizes.forEach((control) => control.addEventListener("change", (event) => {
        const obj = selectedObject();
        if (obj && obj.type === "i-text") applySelection({ fontSize: Number(event.target.value) || 72 });
      }));
      els.textContent?.addEventListener("input", (event) => {
        const obj = selectedObject();
        if (obj && obj.type === "i-text") {
          if (isLayerLocked(obj)) {
            setStatus(`${layerLabel(obj)} is locked. Unlock it to edit text.`);
            return;
          }
          obj.set({ text: event.target.value || " " });
          canvas.renderAll();
          updateSelectionControls();
        }
      });
      els.textContent?.addEventListener("change", saveHistory);
      els.mobileTextInput?.addEventListener("input", (event) => {
        const obj = selectedObject();
        if (!obj || obj.type !== "i-text") return;
        if (isLayerLocked(obj)) {
          setStatus(`${layerLabel(obj)} is locked. Unlock it to edit text.`);
          return;
        }
        const nextText = event.target.value || " ";
        obj.set({ text: nextText });
        if (els.textContent && document.activeElement !== els.textContent) els.textContent.value = nextText;
        obj.setCoords();
        canvas.renderAll();
        updateSelectionControls();
      });
      els.mobileTextInput?.addEventListener("change", saveHistory);
      els.fontFamily?.addEventListener("change", (event) => {
        const obj = selectedObject();
        if (obj && obj.type === "i-text") applySelection({ fontFamily: event.target.value });
      });
      [...els.angles, ...els.angleValues].forEach((control) => {
        control.addEventListener("input", (event) => setSelectedAngle(event.target.value, { save: false, quiet: true }));
        control.addEventListener("change", (event) => setSelectedAngle(event.target.value));
      });

      canvas.on("selection:created", updateSelectionControls);
      canvas.on("selection:updated", updateSelectionControls);
      canvas.on("selection:cleared", updateSelectionControls);
      canvas.on("mouse:down", (event) => {
        if (activeTool === "move" && event.target && !isLayerLocked(event.target)) {
          canvas.defaultCursor = "grabbing";
        }
      });
      canvas.on("mouse:up", () => {
        canvas.defaultCursor = activeTool === "move" ? "grab" : "default";
      });
      canvas.on("object:moving", (event) => {
        const obj = event.target;
        if (obj && obj !== guide && !isLayerLocked(obj)) keepObjectInArtboard(obj, 6);
      });
      canvas.on("object:modified", () => {
        saveHistory();
        updateSelectionControls();
      });
      canvas.on("object:added", keepGuideOnTop);
      canvas.on("object:removed", updateSelectionControls);
      document.addEventListener("keydown", (event) => {
        if (!root.contains(document.activeElement) && document.activeElement !== document.body) return;
        if ((event.key === "Backspace" || event.key === "Delete") && selectedObject()) {
          event.preventDefault();
          deleteSelected();
        }
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
          event.preventDefault();
          restoreHistory(historyIndex - 1);
        }
      });
    }

    function togglePanel(panelName) {
      const current = root.dataset.activePanel || "";
      const next = current === panelName ? "" : panelName;
      root.dataset.activePanel = next;
      root.classList.toggle("tbd--panel-open", Boolean(next));
      ["assets", "templates", "text", "properties", "layers", "inspector", "cart"].forEach((name) => {
        root.classList.toggle(`tbd--panel-${name}`, next === name);
      });
      root.querySelectorAll("[data-tbd-panel]").forEach((panel) => {
        panel.hidden = panel.dataset.tbdPanel !== next;
      });
      syncTemplateAutoScroll();
      updateStageScale();
    }

    function updateStageScale() {
      if (!els.stage) return;
      const isMobile = window.matchMedia("(max-width: 720px)").matches;
      const isNonRect = !isRectangularShape(ARTBOARD_SHAPE);
      const stageStyle = window.getComputedStyle(els.stage);
      const paddingX = parseFloat(stageStyle.paddingLeft || "0") + parseFloat(stageStyle.paddingRight || "0");
      const paddingY = parseFloat(stageStyle.paddingTop || "0") + parseFloat(stageStyle.paddingBottom || "0");
      const widthInset = isMobile && isNonRect ? 16 : 0;
      const availableWidth = Math.max(260, els.stage.clientWidth - paddingX - widthInset);
      const widthScale = availableWidth / WIDTH;
      let fitScale = widthScale;
      if (isNonRect) {
        const heightGutter = isMobile ? 8 : 20;
        const availableHeight = Math.max(220, els.stage.clientHeight - paddingY - heightGutter);
        fitScale = Math.min(widthScale, availableHeight / HEIGHT);
      }
      const minScale = isMobile ? 0.14 : 0.22;
      const scale = Math.min(1, Math.max(minScale, fitScale));
      root.style.setProperty("--tbd-canvas-zoom", cleanNumber(scale));
      root.style.setProperty("--tbd-canvas-display-width", `${Math.round(WIDTH * scale)}px`);
      root.style.setProperty("--tbd-canvas-display-height", `${Math.round(HEIGHT * scale)}px`);
      canvas.calcOffset();
    }

    hydrateTooltips();
    bind();
    renderGeneratorPlayerNameInputs();
    try {
      if (els.generatorSavedMeta && window.localStorage.getItem(GENERATOR_SETUP_STORAGE_KEY)) {
        els.generatorSavedMeta.textContent = "Saved setup available";
      }
    } catch (error) {
      // Private browsing may block localStorage; generator still works without saved setup.
    }
    renderDesignCart();
    updateGradientBar();
    syncProductInfo();
    drawGuide();
    updateStageScale();
    window.addEventListener("resize", updateStageScale);
    Promise.allSettled([loadAssetManifest(), loadSvgTemplates(), loadTemplateProducts()]).then(() => {
      if (launch.initialAssetCategory) {
        const categories = new Set(["All", ...assets.map((asset) => asset.category || "Other")]);
        if (categories.has(launch.initialAssetCategory)) activeCategory = launch.initialAssetCategory;
      }
      if (launch.initialAssetSearch) {
        searchTerm = launch.initialAssetSearch.trim().toLowerCase();
        if (els.search) els.search.value = launch.initialAssetSearch;
      }
      renderCategories();
      renderAssets();
      if (launch.initialPanel) togglePanel(launch.initialPanel);
      if (launch.hasDesign) {
        if (!projectWasOpened) loadProductDesign().then(updateSelectionControls);
      } else {
        if (projectWasOpened) {
          updateSelectionControls();
          return;
        }
        saveHistory();
        updateSelectionControls();
        setStatus("Blank canvas ready. Use Assets, Upload, or Text to start.");
      }
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    hydrateDesignButtonLinks();
    document.querySelectorAll("[data-team-banner-designer]").forEach(init);
  });
})();
