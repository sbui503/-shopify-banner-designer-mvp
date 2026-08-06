export function svgDownloadRequested(value) {
  const raw = Array.isArray(value) ? value[0] : value;
  return /^(?:1|true|download)$/i.test(String(raw || "").trim());
}

export function svgContentDisposition(designId, downloadValue) {
  const mode = svgDownloadRequested(downloadValue) ? "attachment" : "inline";
  return `${mode}; filename="${designId}.svg"`;
}
