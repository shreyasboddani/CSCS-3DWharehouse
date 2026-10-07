import { z } from "zod";

export const imageUrlSchema = z.string().trim().max(2048).refine((value) => {
  if (!value) return true;
  if (/^\/api\/v1\/warehouses\/[a-f0-9-]{36}\/images\/[a-f0-9-]{36}$/.test(value)) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch { return false; }
}, "Use an uploaded photo or an HTTPS image URL.");

export const imageUploadSchema = z.object({
  mime: z.enum(["image/webp", "image/jpeg", "image/png"]),
  data: z.string().min(16).max(350000).regex(/^[a-zA-Z0-9+/]+={0,2}$/),
});

/** Signature validation without fetching remote content or executing an image codec. */
export function imageSignature(bytes: Uint8Array, mime: string) {
  if (bytes.length < 12 || bytes.length > 256000) return false;
  if (mime === "image/jpeg") return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (mime === "image/png") return [137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b);
  return mime === "image/webp" && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
}
