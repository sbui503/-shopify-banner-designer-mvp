(function (global) {
  const DESIGN_ID_PATTERN = /design_[0-9]+_[a-z0-9]+/i;
  const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
  const PNG_DESIGN_ID_KEYWORD = "TeamSportBannersDesignID";

  function normalizeDesignId(value) {
    return String(value || "").match(DESIGN_ID_PATTERN)?.[0] || "";
  }

  function isPng(bytes) {
    return bytes.length >= PNG_SIGNATURE.length
      && PNG_SIGNATURE.every((value, index) => bytes[index] === value);
  }

  function readUint32(bytes, offset) {
    return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, false);
  }

  function writeUint32(bytes, offset, value) {
    new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint32(offset, value >>> 0, false);
  }

  function ascii(bytes) {
    return String.fromCharCode(...bytes);
  }

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (const value of bytes) {
      crc ^= value;
      for (let bit = 0; bit < 8; bit += 1) {
        crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
      }
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function pngTextChunk(keyword, value) {
    const encoder = new TextEncoder();
    const type = encoder.encode("tEXt");
    const data = encoder.encode(`${keyword}\0${value}`);
    const crcInput = new Uint8Array(type.length + data.length);
    crcInput.set(type);
    crcInput.set(data, type.length);

    const chunk = new Uint8Array(12 + data.length);
    writeUint32(chunk, 0, data.length);
    chunk.set(type, 4);
    chunk.set(data, 8);
    writeUint32(chunk, 8 + data.length, crc32(crcInput));
    return chunk;
  }

  function pngBytesFromDataUrl(dataUrl) {
    const encoded = String(dataUrl || "").match(/^data:image\/png;base64,(.+)$/i)?.[1];
    if (!encoded) throw new Error("The proof is not a PNG image.");
    const binary = global.atob(encoded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }

  function addDesignIdToPngBytes(sourceBytes, designId) {
    const id = normalizeDesignId(designId);
    const bytes = sourceBytes instanceof Uint8Array ? sourceBytes : new Uint8Array(sourceBytes);
    if (!id) throw new Error("A valid Design ID is required.");
    if (!isPng(bytes)) throw new Error("The proof is not a valid PNG image.");

    let offset = PNG_SIGNATURE.length;
    let iendOffset = -1;
    while (offset + 12 <= bytes.length) {
      const length = readUint32(bytes, offset);
      const nextOffset = offset + 12 + length;
      if (nextOffset > bytes.length) throw new Error("The PNG file is incomplete.");
      if (ascii(bytes.subarray(offset + 4, offset + 8)) === "IEND") {
        iendOffset = offset;
        break;
      }
      offset = nextOffset;
    }
    if (iendOffset < 0) throw new Error("The PNG file has no end marker.");

    const metadata = pngTextChunk(PNG_DESIGN_ID_KEYWORD, id);
    const tagged = new Uint8Array(bytes.length + metadata.length);
    tagged.set(bytes.subarray(0, iendOffset));
    tagged.set(metadata, iendOffset);
    tagged.set(bytes.subarray(iendOffset), iendOffset + metadata.length);
    return tagged;
  }

  function designIdFromPngBytes(sourceBytes) {
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

  async function pngBlobWithDesignId(source, designId) {
    const sourceBytes = typeof source === "string"
      ? pngBytesFromDataUrl(source)
      : new Uint8Array(await source.arrayBuffer());
    const bytes = addDesignIdToPngBytes(sourceBytes, designId);
    return new Blob([bytes], { type: "image/png" });
  }

  async function designIdFromPngFile(file) {
    const fromName = normalizeDesignId(file && file.name);
    if (fromName) return fromName;
    const name = String(file && file.name || "").toLowerCase();
    const type = String(file && file.type || "").toLowerCase();
    if (!file || (!name.endsWith(".png") && type !== "image/png")) return "";
    return designIdFromPngBytes(new Uint8Array(await file.arrayBuffer()));
  }

  global.TeamBannerDesignResume = {
    addDesignIdToPngBytes,
    designIdFromPngBytes,
    designIdFromPngFile,
    normalizeDesignId,
    pngBlobWithDesignId
  };
})(typeof window === "undefined" ? globalThis : window);
