const DESIGN_ID_PATTERN = /design_[0-9]+_[a-z0-9]+/i;
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const PNG_DESIGN_ID_KEYWORD = "TeamSportBannersDesignID";

export function normalizeDesignId(value: unknown) {
  return String(value || "").match(DESIGN_ID_PATTERN)?.[0] || "";
}

function isPng(bytes: Uint8Array) {
  return bytes.length >= PNG_SIGNATURE.length
    && PNG_SIGNATURE.every((value, index) => bytes[index] === value);
}

function readUint32(bytes: Uint8Array, offset: number) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, false);
}

function ascii(bytes: Uint8Array) {
  return String.fromCharCode(...bytes);
}

export function designIdFromPngBytes(sourceBytes: Uint8Array | ArrayBuffer) {
  const bytes = sourceBytes instanceof Uint8Array ? sourceBytes : new Uint8Array(sourceBytes);
  if (!isPng(bytes)) return "";

  let offset = PNG_SIGNATURE.length;
  while (offset + 12 <= bytes.length) {
    const length = readUint32(bytes, offset);
    const dataOffset = offset + 8;
    const nextOffset = offset + 12 + length;
    if (nextOffset > bytes.length) return "";
    const type = ascii(bytes.subarray(offset + 4, offset + 8));
    if (type === "tEXt") {
      const data = bytes.subarray(dataOffset, dataOffset + length);
      const separator = data.indexOf(0);
      if (
        separator === PNG_DESIGN_ID_KEYWORD.length
        && ascii(data.subarray(0, separator)) === PNG_DESIGN_ID_KEYWORD
      ) {
        return normalizeDesignId(ascii(data.subarray(separator + 1, separator + 129)));
      }
    }
    if (type === "IEND") break;
    offset = nextOffset;
  }
  return "";
}

export async function designIdFromPngFile(file: File) {
  const fromName = normalizeDesignId(file.name);
  if (fromName) return fromName;
  if (file.type !== "image/png" && !file.name.toLowerCase().endsWith(".png")) return "";
  return designIdFromPngBytes(await file.arrayBuffer());
}
