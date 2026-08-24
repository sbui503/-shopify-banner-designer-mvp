(function (global) {
  const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
  const INKSCAPE_NAMESPACE = "http://www.inkscape.org/namespaces/inkscape";
  const XMLNS_NAMESPACE = "http://www.w3.org/2000/xmlns/";

  function cleanLayerName(value, index) {
    const clean = String(value || "")
      .replace(/[\u0000-\u001f\u007f]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return (clean || `Artwork ${index + 1}`).slice(0, 120);
  }

  function layerName(layer, index) {
    return cleanLayerName(
      layer?.name
        || layer?.sourceName
        || layer?.data?.name
        || layer?.text
        || layer?.role
        || layer?.data?.role
        || layer?.type,
      index
    );
  }

  function layerId(name, index, usedIds) {
    const slug = String(name || "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/gi, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 64) || "Artwork";
    const base = `Layer_${String(index + 1).padStart(3, "0")}_${slug}`;
    let unique = base;
    let duplicate = 2;
    while (usedIds.has(unique)) {
      unique = `${base}_${duplicate}`;
      duplicate += 1;
    }
    usedIds.add(unique);
    return unique;
  }

  function layerDescriptors(layers) {
    const usedIds = new Set();
    return (Array.isArray(layers) ? layers : []).map((layer, index) => {
      const name = layerName(layer, index);
      const type = String(layer?.type || "object").trim().toLowerCase() || "object";
      return {
        id: layerId(name, index, usedIds),
        name,
        type,
        role: String(layer?.role || layer?.data?.role || "").trim().slice(0, 100),
        kind: type === "image" ? "embedded-raster" : "editable-vector"
      };
    });
  }

  function applyLayerMetadata(documentNode, layers) {
    const root = documentNode?.documentElement;
    if (!root || root.localName !== "svg") throw new Error("The Illustrator SVG could not be prepared.");

    root.setAttributeNS(XMLNS_NAMESPACE, "xmlns:inkscape", INKSCAPE_NAMESPACE);
    root.setAttribute("data-team-banner-format", "illustrator-layered-svg-v1");

    const groups = Array.from(root.children || []).filter((element) => (
      element.namespaceURI === SVG_NAMESPACE && element.localName === "g"
    ));
    const descriptors = layerDescriptors(layers);
    const count = Math.min(groups.length, descriptors.length);

    for (let index = 0; index < count; index += 1) {
      const group = groups[index];
      const descriptor = descriptors[index];
      group.setAttribute("id", descriptor.id);
      group.setAttribute("data-name", descriptor.name);
      group.setAttribute("data-layer-index", String(index + 1));
      group.setAttribute("data-layer-type", descriptor.type);
      group.setAttribute("data-layer-kind", descriptor.kind);
      if (descriptor.role) group.setAttribute("data-layer-role", descriptor.role);
      group.setAttributeNS(INKSCAPE_NAMESPACE, "inkscape:groupmode", "layer");
      group.setAttributeNS(INKSCAPE_NAMESPACE, "inkscape:label", descriptor.name);
    }

    root.setAttribute("data-layer-count", String(count));
    root.setAttribute("data-layer-source-count", String(descriptors.length));
    return {
      groupCount: groups.length,
      layerCount: count,
      descriptors
    };
  }

  function prepareSvg(rawSvg, layers) {
    if (typeof global.DOMParser !== "function" || typeof global.XMLSerializer !== "function") {
      throw new Error("SVG editing is unavailable in this browser.");
    }
    const parser = new global.DOMParser();
    const documentNode = parser.parseFromString(String(rawSvg || ""), "image/svg+xml");
    if (documentNode.querySelector("parsererror") || !documentNode.documentElement?.matches("svg")) {
      throw new Error("The Illustrator SVG could not be prepared.");
    }
    const result = applyLayerMetadata(documentNode, layers);
    return {
      ...result,
      svg: new global.XMLSerializer().serializeToString(documentNode.documentElement)
    };
  }

  global.TeamBannerIllustratorSvg = Object.freeze({
    applyLayerMetadata,
    layerDescriptors,
    prepareSvg
  });
})(typeof window !== "undefined" ? window : globalThis);
