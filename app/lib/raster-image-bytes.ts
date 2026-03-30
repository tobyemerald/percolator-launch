import { Buffer } from "node:buffer";

/**
 * Sniff raster image format from file contents (not Content-Type / File.type).
 * Blocks polyglots and non-images that claim image/* (Prompt 91).
 */
export type RasterFormat = {
  ext: "png" | "jpg" | "webp" | "gif";
  contentType: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
};

function hasPrefix(buf: Buffer, prefix: readonly number[], offset = 0): boolean {
  if (buf.length < offset + prefix.length) return false;
  for (let i = 0; i < prefix.length; i++) {
    if (buf[offset + i] !== prefix[i]) return false;
  }
  return true;
}

/**
 * Returns detected raster format or null if bytes are not a supported image signature.
 */
export function detectRasterImage(buffer: Buffer): RasterFormat | null {
  if (buffer.length < 3) return null;

  if (hasPrefix(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { ext: "png", contentType: "image/png" };
  }
  if (hasPrefix(buffer, [0xff, 0xd8, 0xff])) {
    return { ext: "jpg", contentType: "image/jpeg" };
  }
  if (hasPrefix(buffer, [0x47, 0x46, 0x38, 0x37, 0x61]) || hasPrefix(buffer, [0x47, 0x46, 0x38, 0x39, 0x61])) {
    return { ext: "gif", contentType: "image/gif" };
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return { ext: "webp", contentType: "image/webp" };
  }

  return null;
}
