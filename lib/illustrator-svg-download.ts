export type DesignLayer = {
  id?: string;
  name?: string;
  sourceName?: string;
  role?: string;
  text?: string;
  type?: string;
  data?: {
    name?: string;
    role?: string;
  };
};

export type IllustratorDownloadInput = {
  id: string;
  sourceSvgUrl?: string;
  sourceSvgBlobUrl?: string;
  sourceSvgDownloadUrl?: string;
  jsonUrl?: string;
  layers?: DesignLayer[];
  project?: unknown;
};

export type IllustratorPreparedSvg = {
  svg: string;
  rawSvg: string;
  sourceUrl: string;
  project: unknown;
  rawJson: string;
  layerCount: number;
  rasterLayerCount: number;
  vectorLayerCount: number;
};

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const INKSCAPE_NAMESPACE = "http://www.inkscape.org/namespaces/inkscape";
const XMLNS_NAMESPACE = "http://www.w3.org/2000/xmlns/";

function cleanLayerName(value: unknown, index: number) {
  const clean = String(value || "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (clean || `Artwork ${index + 1}`).slice(0, 120);
}

export function projectLayerObjects(project: unknown): DesignLayer[] {
  if (!project || typeof project !== "object") return [];
  const value = project as {
    objects?: DesignLayer[];
    canvas?: { objects?: DesignLayer[] };
    project?: { objects?: DesignLayer[]; canvas?: { objects?: DesignLayer[] } };
  };
  if (Array.isArray(value.objects)) return value.objects;
  if (Array.isArray(value.canvas?.objects)) return value.canvas.objects;
  if (Array.isArray(value.project?.objects)) return value.project.objects;
  if (Array.isArray(value.project?.canvas?.objects)) return value.project.canvas.objects;
  return [];
}

export function illustratorLayerDescriptors(layers: DesignLayer[]) {
  const usedIds = new Set<string>();
  return layers.map((layer, index) => {
    const name = cleanLayerName(
      layer.name
        || layer.sourceName
        || layer.data?.name
        || layer.text
        || layer.role
        || layer.data?.role
        || layer.type,
      index
    );
    const slug = name
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/gi, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 64) || "Artwork";
    const base = `Layer_${String(index + 1).padStart(3, "0")}_${slug}`;
    let id = base;
    let duplicate = 2;
    while (usedIds.has(id)) {
      id = `${base}_${duplicate}`;
      duplicate += 1;
    }
    usedIds.add(id);
    const type = String(layer.type || "object").trim().toLowerCase() || "object";
    return {
      id,
      name,
      type,
      role: String(layer.role || layer.data?.role || "").trim().slice(0, 100),
      kind: type === "image" ? "embedded-raster" : "editable-vector"
    };
  });
}

export function prepareIllustratorSvg(rawSvg: string, layers: DesignLayer[]) {
  const documentNode = new DOMParser().parseFromString(rawSvg, "image/svg+xml");
  const root = documentNode.documentElement;
  if (documentNode.querySelector("parsererror") || root.localName !== "svg") {
    throw new Error("The stored SVG is invalid.");
  }

  root.setAttributeNS(XMLNS_NAMESPACE, "xmlns:inkscape", INKSCAPE_NAMESPACE);
  root.setAttribute("data-team-banner-format", "illustrator-layered-svg-v1");
  const groups = Array.from(root.children).filter((element) => (
    element.namespaceURI === SVG_NAMESPACE && element.localName === "g"
  ));
  const sourceDescriptors = illustratorLayerDescriptors(layers);
  const fallbackLayers = groups.slice(sourceDescriptors.length).map((group, index) => ({
    name: group.getAttribute("data-name") || group.getAttribute("id") || `Artwork ${sourceDescriptors.length + index + 1}`,
    type: group.querySelector("image") ? "image" : "object"
  }));
  const descriptors = illustratorLayerDescriptors([...layers, ...fallbackLayers]);

  groups.forEach((group, index) => {
    const descriptor = descriptors[index];
    if (!descriptor) return;
    group.setAttribute("id", descriptor.id);
    group.setAttribute("data-name", descriptor.name);
    group.setAttribute("data-layer-index", String(index + 1));
    group.setAttribute("data-layer-type", descriptor.type);
    group.setAttribute("data-layer-kind", descriptor.kind);
    if (descriptor.role) group.setAttribute("data-layer-role", descriptor.role);
    group.setAttributeNS(INKSCAPE_NAMESPACE, "inkscape:groupmode", "layer");
    group.setAttributeNS(INKSCAPE_NAMESPACE, "inkscape:label", descriptor.name);
  });

  root.setAttribute("data-layer-count", String(groups.length));
  root.setAttribute("data-layer-source-count", String(sourceDescriptors.length));
  const svg = new XMLSerializer().serializeToString(root);
  return {
    svg,
    layerCount: groups.length,
    rasterLayerCount: descriptors.slice(0, groups.length).filter((layer) => layer.kind === "embedded-raster").length,
    vectorLayerCount: descriptors.slice(0, groups.length).filter((layer) => layer.kind === "editable-vector").length
  };
}

async function fetchFirstSvg(urls: string[]) {
  let lastError = "The layered SVG could not be downloaded.";
  for (const url of urls) {
    if (!url) continue;
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) {
        lastError = `The layered SVG request failed (${response.status}).`;
        continue;
      }
      return { svg: await response.text(), url };
    } catch (error) {
      lastError = error instanceof Error ? error.message : lastError;
    }
  }
  throw new Error(lastError);
}

async function fetchProject(url: string | undefined) {
  if (!url) return null;
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return null;
    const raw = await response.text();
    return { value: JSON.parse(raw) as unknown, raw };
  } catch {
    return null;
  }
}

export async function prepareIllustratorSvgDownload(input: IllustratorDownloadInput): Promise<IllustratorPreparedSvg> {
  const sourceUrls = [...new Set([
    input.sourceSvgBlobUrl,
    input.sourceSvgUrl,
    input.sourceSvgDownloadUrl
  ].filter((value): value is string => Boolean(value)))];
  if (!sourceUrls.length) throw new Error("No layered SVG is stored for this design.");

  const [source, storedProject] = await Promise.all([
    fetchFirstSvg(sourceUrls),
    fetchProject(input.jsonUrl)
  ]);
  const project = storedProject?.value ?? input.project ?? null;
  const projectLayers = projectLayerObjects(project);
  const result = prepareIllustratorSvg(source.svg, projectLayers.length ? projectLayers : (input.layers || []));
  if (!result.layerCount) throw new Error("The SVG does not contain separate artwork objects.");
  return {
    ...result,
    rawSvg: source.svg,
    sourceUrl: source.url,
    project,
    rawJson: storedProject?.raw || ""
  };
}

export function layeredSvgFileName(id: string) {
  return `${id || "team-banner-design"}-layered-editable.svg`;
}

export async function downloadLayeredSvg(input: IllustratorDownloadInput) {
  const result = await prepareIllustratorSvgDownload(input);

  const blob = new Blob([result.svg], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = layeredSvgFileName(input.id);
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return result;
}
