import { strToU8, zipSync } from "fflate";
import {
  prepareIllustratorSvgDownload,
  type DesignLayer,
  type IllustratorDownloadInput
} from "@/lib/illustrator-svg-download";

export type ArtworkClassification = "vector" | "mixed" | "flattened";

export type IllustratorPackageInput = IllustratorDownloadInput & {
  previewUrl?: string;
  printSourceUrl?: string;
  productTitle?: string;
  savedAt?: string;
  layers?: DesignLayer[];
};

export type SvgArtworkAnalysis = {
  classification: ArtworkClassification;
  imageCount: number;
  textCount: number;
  vectorShapeCount: number;
  fontFamilies: string[];
};

export type IllustratorPackageResult = SvgArtworkAnalysis & {
  fileName: string;
  layerCount: number;
  assetCount: number;
  warnings: string[];
};

type PackageFile = {
  bytes: Uint8Array;
  contentType: string;
};

type PackageFileStatus = {
  included: boolean;
  file?: string;
  sourceUrl?: string;
  note?: string;
};

const MAX_OPTIONAL_FILE_BYTES = 16 * 1024 * 1024;
const SVG_XML_HEADER = '<?xml version="1.0" encoding="UTF-8"?>\n';

function countMatches(value: string, pattern: RegExp) {
  return (value.match(pattern) || []).length;
}

function normalizeFontName(value: string) {
  return value
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/^['"]+|['"]+$/g, "")
    .trim();
}

export function extractSvgFontFamilies(svg: string) {
  const values: string[] = [];
  const patterns = [
    /font-family\s*=\s*["']([^"']+)["']/gi,
    /font-family\s*:\s*([^;}"']+)/gi
  ];
  patterns.forEach((pattern) => {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(svg))) values.push(match[1]);
  });

  const ignored = new Set(["inherit", "initial", "unset"]);
  return [...new Set(values
    .flatMap((value) => value.split(","))
    .map(normalizeFontName)
    .filter((value) => value && !ignored.has(value.toLowerCase())))]
    .sort((left, right) => left.localeCompare(right));
}

export function analyzeSvgArtwork(svg: string): SvgArtworkAnalysis {
  const imageCount = countMatches(svg, /<image\b/gi);
  const textCount = countMatches(svg, /<text\b/gi);
  const vectorShapeCount = countMatches(svg, /<(?:path|rect|circle|ellipse|polygon|polyline|line)\b/gi);
  const editableObjectCount = textCount + vectorShapeCount;
  const classification: ArtworkClassification = imageCount
    ? (editableObjectCount ? "mixed" : "flattened")
    : "vector";
  return {
    classification,
    imageCount,
    textCount,
    vectorShapeCount,
    fontFamilies: extractSvgFontFamilies(svg)
  };
}

export function illustratorLayerScript() {
  return `#target illustrator

(function () {
  function cleanName(value, index) {
    var name = String(value || "Artwork " + (index + 1));
    name = name.replace(/^Layer_[0-9]+_/, "").replace(/_/g, " ");
    name = name.replace(/^\\s+|\\s+$/g, "");
    return name || "Artwork " + (index + 1);
  }

  function directGroups(container) {
    var groups = [];
    for (var i = 0; i < container.pageItems.length; i += 1) {
      var item = container.pageItems[i];
      if (item.parent === container && item.typename === "GroupItem") groups.push(item);
    }
    return groups;
  }

  var scriptFile = new File($.fileName);
  var sourceFile = new File(scriptFile.path + "/editable-design.svg");
  if (!sourceFile.exists) {
    sourceFile = File.openDialog("Choose editable-design.svg", "SVG:*.svg");
  }
  if (!sourceFile) return;

  var documentRef = app.open(sourceFile);
  var importLayer = documentRef.layers[0];
  var groups = directGroups(importLayer);
  var wrapper = null;
  if (groups.length === 1) {
    var nestedGroups = directGroups(groups[0]);
    if (nestedGroups.length > 1) {
      wrapper = groups[0];
      groups = nestedGroups;
    }
  }

  if (!groups.length) {
    alert("No separate SVG groups were found. Review preflight.json before production.");
    return;
  }

  for (var index = groups.length - 1; index >= 0; index -= 1) {
    var group = groups[index];
    var layer = documentRef.layers.add();
    layer.name = cleanName(group.name, index);
    group.move(layer, ElementPlacement.PLACEATBEGINNING);
  }

  try {
    if (wrapper && wrapper.pageItems.length === 0) wrapper.remove();
    if (importLayer.pageItems.length === 0 && documentRef.layers.length > 1) importLayer.remove();
  } catch (cleanupError) {}

  var outputFile = File.saveDialog("Save layered Adobe Illustrator file", "Adobe Illustrator:*.ai");
  if (!outputFile) return;
  if (!/\\.ai$/i.test(outputFile.name)) outputFile = new File(outputFile.fsName + ".ai");

  var saveOptions = new IllustratorSaveOptions();
  saveOptions.pdfCompatible = true;
  saveOptions.compressed = true;
  documentRef.saveAs(outputFile, saveOptions);
  alert("Layered Illustrator file saved to:\n" + outputFile.fsName);
}());
`;
}

function safeFilePart(value: unknown, fallback: string) {
  const clean = String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return (clean || fallback).slice(0, 80);
}

function canonicalUrl(value: string | undefined) {
  try {
    const url = new URL(String(value || ""));
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return String(value || "").split(/[?#]/)[0];
  }
}

function extensionFor(contentType: string, source: string, fallback = "bin") {
  const mimeType = contentType.toLowerCase().split(";")[0].trim();
  const mimeExtensions: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/svg+xml": "svg",
    "image/avif": "avif",
    "application/json": "json"
  };
  if (mimeExtensions[mimeType]) return mimeExtensions[mimeType];
  const match = /\.([a-z0-9]{2,5})(?:[?#]|$)/i.exec(source);
  return match?.[1]?.toLowerCase() || fallback;
}

async function fetchPackageFile(url: string): Promise<PackageFile> {
  const response = await fetch(url, {
    cache: "no-store",
    credentials: "omit"
  });
  if (!response.ok) throw new Error(`Request failed (${response.status}).`);
  const length = Number(response.headers.get("content-length") || 0);
  if (length > MAX_OPTIONAL_FILE_BYTES) throw new Error("File exceeds the 16 MB package limit.");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_OPTIONAL_FILE_BYTES) throw new Error("File exceeds the 16 MB package limit.");
  return {
    bytes,
    contentType: response.headers.get("content-type") || "application/octet-stream"
  };
}

function decodeDataUrl(value: string): PackageFile | null {
  const match = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/i.exec(value);
  if (!match) return null;
  const contentType = match[1] || "application/octet-stream";
  if (match[2]) {
    const binary = atob(match[3].replace(/\s+/g, ""));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return { bytes, contentType };
  }
  return { bytes: strToU8(decodeURIComponent(match[3])), contentType };
}

function xmlDocument(svg: string) {
  const documentNode = new DOMParser().parseFromString(svg, "image/svg+xml");
  if (documentNode.querySelector("parsererror") || documentNode.documentElement.localName !== "svg") {
    throw new Error("The stored SVG is invalid.");
  }
  return documentNode;
}

async function originalImageAssets(svg: string) {
  const documentNode = xmlDocument(svg);
  const root = documentNode.documentElement;
  const uniqueReferences = new Map<string, { label: string; index: number }>();
  Array.from(root.querySelectorAll("image")).forEach((image, index) => {
    const href = image.getAttribute("href")
      || image.getAttributeNS("http://www.w3.org/1999/xlink", "href")
      || "";
    if (!href || uniqueReferences.has(href)) return;
    let parent = image.parentElement;
    while (parent?.parentElement && parent.parentElement !== root) parent = parent.parentElement;
    const label = parent?.getAttribute("data-name")
      || parent?.getAttribute("id")
      || image.getAttribute("data-name")
      || image.getAttribute("id")
      || `image-${index + 1}`;
    uniqueReferences.set(href, { label, index });
  });

  const files: Record<string, Uint8Array> = {};
  const failures: string[] = [];
  for (const [href, reference] of uniqueReferences) {
    try {
      const file = /^data:/i.test(href) ? decodeDataUrl(href) : await fetchPackageFile(href);
      if (!file) throw new Error("Unsupported image reference.");
      const extension = extensionFor(file.contentType, href, "bin");
      const sequence = String(reference.index + 1).padStart(3, "0");
      const baseName = safeFilePart(reference.label, `image-${sequence}`);
      files[`assets/${sequence}-${baseName}.${extension}`] = file.bytes;
    } catch (error) {
      failures.push(`${reference.label}: ${error instanceof Error ? error.message : "asset could not be read"}`);
    }
  }
  return { files, failures };
}

export function packageReadme(input: {
  designId: string;
  productTitle: string;
  classification: ArtworkClassification;
  layerCount: number;
  hasOutlinedPrintSource: boolean;
  hasProof: boolean;
}) {
  return `TEAM SPORT BANNERS - ADOBE ILLUSTRATOR PRODUCTION PACKAGE

Design ID: ${input.designId}
Product: ${input.productTitle || "Customer design"}
Artwork classification: ${input.classification.toUpperCase()}
Named SVG groups: ${input.layerCount}

OPEN AS NATIVE ILLUSTRATOR LAYERS
1. Extract this ZIP. Do not run the script from inside the ZIP preview.
2. Open Adobe Illustrator.
3. Choose File > Scripts > Other Script.
4. Select open-in-illustrator.jsx from this folder.
5. The script opens editable-design.svg, promotes its named groups to Illustrator layers, and asks where to save the .ai file.
6. Compare the opened artwork with ${input.hasProof ? "proof.png (or the proof image in this package)" : "the approved customer proof"} before production.

FILES
- editable-design.svg: live text, vector objects, and embedded customer images grouped by object.
- design.json: saved editor state used to resume the customer design, when available.
- preflight.json: layer, image, vector, font, and missing-file audit.
- fonts.txt: font families referenced by the SVG.
- assets/: original image data extracted from the SVG when accessible.
- open-in-illustrator.jsx: converts imported SVG groups into native Illustrator layers and saves .ai.
${input.hasOutlinedPrintSource ? "- print-outlined.svg: separate print source with no live SVG text detected.\n" : ""}
PRODUCTION NOTES
- MIXED means the design contains editable text/vector objects and raster photos or logos.
- FLATTENED means the SVG contains raster artwork without live text or vector shapes.
- Raster photos and logos remain raster; packaging does not invent vector data.
- Install the listed fonts before opening. On a duplicate production file, use Type > Create Outlines before sending to print.
${input.hasOutlinedPrintSource ? "- A separate outlined print source is included; still compare it with the proof." : "- No verified outlined print source was stored. Create outlines in Illustrator after approval."}
`;
}

export function zipPackageFiles(files: Record<string, Uint8Array>) {
  return zipSync(files, { level: 6 });
}

function triggerDownload(bytes: Uint8Array, fileName: string) {
  const ownedBytes = new Uint8Array(bytes.byteLength);
  ownedBytes.set(bytes);
  const blob = new Blob([ownedBytes.buffer], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadIllustratorPackage(input: IllustratorPackageInput): Promise<IllustratorPackageResult> {
  const prepared = await prepareIllustratorSvgDownload(input);
  const analysis = analyzeSvgArtwork(prepared.svg);
  const files: Record<string, Uint8Array> = {
    "editable-design.svg": strToU8(`${SVG_XML_HEADER}${prepared.svg}`),
    "open-in-illustrator.jsx": strToU8(illustratorLayerScript()),
    "fonts.txt": strToU8(analysis.fontFamilies.length
      ? `${analysis.fontFamilies.join("\n")}\n`
      : "No explicit font-family values were found in the SVG.\n")
  };
  const warnings: string[] = [];
  const fileStatus: Record<string, PackageFileStatus> = {
    editableSvg: { included: true, file: "editable-design.svg", sourceUrl: prepared.sourceUrl },
    editableJson: { included: false, sourceUrl: input.jsonUrl },
    proof: { included: false, sourceUrl: input.previewUrl },
    outlinedPrintSource: { included: false, sourceUrl: input.printSourceUrl }
  };

  const fallbackProject = prepared.project || (input.layers?.length ? { layers: input.layers } : null);
  if (prepared.rawJson) {
    files["design.json"] = strToU8(prepared.rawJson);
    fileStatus.editableJson = { included: true, file: "design.json", sourceUrl: input.jsonUrl };
  } else if (fallbackProject) {
    files["design.json"] = strToU8(`${JSON.stringify(fallbackProject, null, 2)}\n`);
    fileStatus.editableJson = { included: true, file: "design.json", note: "Rebuilt from manifest metadata." };
  } else {
    warnings.push("Editable JSON was not available.");
    fileStatus.editableJson.note = "Missing";
  }

  if (input.previewUrl) {
    try {
      const proof = await fetchPackageFile(input.previewUrl);
      const proofExtension = extensionFor(proof.contentType, input.previewUrl, "png");
      const proofName = `proof.${proofExtension}`;
      files[proofName] = proof.bytes;
      fileStatus.proof = { included: true, file: proofName, sourceUrl: input.previewUrl };
    } catch (error) {
      const note = error instanceof Error ? error.message : "Proof could not be read.";
      warnings.push(`Proof image was not included: ${note}`);
      fileStatus.proof.note = note;
    }
  } else {
    warnings.push("Proof image was not available.");
    fileStatus.proof.note = "Missing";
  }

  let hasOutlinedPrintSource = false;
  const printSourceIsSeparate = input.printSourceUrl
    && canonicalUrl(input.printSourceUrl) !== canonicalUrl(prepared.sourceUrl);
  if (printSourceIsSeparate && input.printSourceUrl) {
    try {
      const printFile = await fetchPackageFile(input.printSourceUrl);
      const printText = new TextDecoder().decode(printFile.bytes);
      const isSvg = /<svg[\s>]/i.test(printText);
      const printAnalysis = isSvg ? analyzeSvgArtwork(printText) : null;
      const isOutlinedSvg = Boolean(printAnalysis && printAnalysis.textCount === 0);
      const extension = extensionFor(printFile.contentType, input.printSourceUrl, isSvg ? "svg" : "bin");
      const printName = isOutlinedSvg ? "print-outlined.svg" : `print-source.${extension}`;
      files[printName] = printFile.bytes;
      hasOutlinedPrintSource = isOutlinedSvg;
      fileStatus.outlinedPrintSource = {
        included: true,
        file: printName,
        sourceUrl: input.printSourceUrl,
        note: isOutlinedSvg ? "No live SVG text detected." : "Source is not verified as outlined."
      };
      if (!isOutlinedSvg) warnings.push("The separate print source still contains live text or is not SVG; it is not labeled as outlined.");
    } catch (error) {
      const note = error instanceof Error ? error.message : "Print source could not be read.";
      warnings.push(`Separate print source was not included: ${note}`);
      fileStatus.outlinedPrintSource.note = note;
    }
  } else {
    warnings.push("No separate outlined print source was stored. Outline fonts in Illustrator after approval.");
    fileStatus.outlinedPrintSource.note = "Not stored separately from the editable SVG.";
  }

  const assets = await originalImageAssets(prepared.rawSvg);
  Object.assign(files, assets.files);
  if (assets.failures.length) warnings.push(...assets.failures.map((failure) => `Original asset not included: ${failure}`));
  if (analysis.classification === "mixed") warnings.push("Raster photos or logos remain raster inside this mixed design.");
  if (analysis.classification === "flattened") warnings.push("The source is flattened raster artwork and cannot provide editable vector objects.");
  if (analysis.textCount) warnings.push("Live text is present. Install the listed fonts and create outlines on a production copy.");

  const preflight = {
    schemaVersion: 1,
    designId: input.id,
    productTitle: input.productTitle || "Customer design",
    savedAt: input.savedAt || null,
    generatedAt: new Date().toISOString(),
    classification: analysis.classification,
    productionReady: analysis.classification !== "flattened" && prepared.layerCount > 0,
    counts: {
      namedLayers: prepared.layerCount,
      editableLayerDescriptors: prepared.vectorLayerCount,
      rasterLayerDescriptors: prepared.rasterLayerCount,
      svgImages: analysis.imageCount,
      liveText: analysis.textCount,
      vectorShapes: analysis.vectorShapeCount,
      extractedOriginalAssets: Object.keys(assets.files).length
    },
    fontFamilies: analysis.fontFamilies,
    files: fileStatus,
    warnings
  };
  files["preflight.json"] = strToU8(`${JSON.stringify(preflight, null, 2)}\n`);
  files["README.txt"] = strToU8(packageReadme({
    designId: input.id,
    productTitle: input.productTitle || "Customer design",
    classification: analysis.classification,
    layerCount: prepared.layerCount,
    hasOutlinedPrintSource,
    hasProof: fileStatus.proof.included
  }));

  const fileName = `${safeFilePart(input.id, "team-banner-design")}-illustrator-package.zip`;
  triggerDownload(zipPackageFiles(files), fileName);
  return {
    ...analysis,
    fileName,
    layerCount: prepared.layerCount,
    assetCount: Object.keys(assets.files).length,
    warnings
  };
}
