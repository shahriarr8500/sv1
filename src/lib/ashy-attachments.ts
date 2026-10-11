/**
 * Ashy attachment model — one place that decides what may be attached to a
 * chat message, how large it may be, and how its real type is proven.
 *
 * Phase 1 (this module): images only — PNG, JPEG and WebP, exactly the set
 * the composer has always accepted. The model is deliberately discriminated
 * by `AttachmentKind` so a later PDF phase can add a kind without touching
 * the image pipeline again.
 *
 * Isomorphic on purpose: the same functions run in the browser (early,
 * friendly rejection before anything leaves the device) and inside the
 * Convex chat action (authoritative — the MIME type is re-derived from the
 * file's own bytes, never from the client's claim). No DOM or Node globals
 * are used anywhere in this file.
 */

/** Attachment kinds enabled today. PDF support lands in a later phase. */
export const ATTACHMENT_KINDS = ["image"] as const;
export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number];

/**
 * Image types the composer accepts (picker `accept` + client validation).
 * Unchanged from the original hard-coded list.
 */
export const ACCEPTED_IMAGE_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;
export type AcceptedImageMimeType = (typeof ACCEPTED_IMAGE_MIME_TYPES)[number];

/**
 * Image types the backend will forward to Gemini. A superset of the accepted
 * set: `image/gif` is kept so image messages stored by earlier deploys keep
 * hydrating into model context. New uploads can never be GIF (the picker and
 * the byte check both reject them), and PDF is intentionally absent.
 */
export const SUPPORTED_IMAGE_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const;
export type SupportedImageMimeType =
  (typeof SUPPORTED_IMAGE_MIME_TYPES)[number];

/** Raw file-size cap before crop/resize — 8 MB, unchanged. */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/** Base64 length cap per image — ~3 MB of binary, unchanged. */
export const MAX_IMAGE_CHARS = 4_000_000;

/** How many images may share the multimodal context window, unchanged. */
export const MAX_IMAGES_TOTAL = 8;

/**
 * One image attachment on the wire (client → chat action). Base64 payloads
 * are NEVER persisted in a message document — storage ids are.
 */
export interface ImageAttachment {
  /** Declared MIME type. Advisory only: the server re-derives it. */
  mimeType: string;
  /** Base64 payload WITHOUT the `data:` prefix. */
  data: string;
}

/**
 * Every attachment kind known today. Extend this union when PDFs arrive —
 * validation, limits and rendering all branch on `kind` from here.
 */
export type Attachment = ImageAttachment & { kind: AttachmentKind };

/** Why an image was rejected — mapped to user-facing copy in one place. */
export type ImageRejectionReason =
  | "empty"
  | "tooLargeBytes"
  | "unsupportedBytes";

export type ImageCheck =
  | { ok: true; mimeType: SupportedImageMimeType }
  | { ok: false; reason: ImageRejectionReason };

export function isAcceptedImageMime(mime: string): boolean {
  return (ACCEPTED_IMAGE_MIME_TYPES as readonly string[]).includes(mime);
}

export function isSupportedImageMime(mime: string): boolean {
  return (SUPPORTED_IMAGE_MIME_TYPES as readonly string[]).includes(mime);
}

/** Friendly client-side copy for a rejected image (server copy lives in the
 * chat action's failure messages). */
export const IMAGE_REJECTION_COPY: Record<ImageRejectionReason, string> = {
  empty: "That image file is empty. Please choose another file.",
  tooLargeBytes: "Please choose an image under 8 MB.",
  unsupportedBytes:
    "This file's contents aren't a valid PNG, JPEG or WebP image — it may be corrupt, or an HEIC/HEIF photo this browser can't read.",
};

const BASE64_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

const BASE64_LOOKUP: Record<string, number> = {};
for (let i = 0; i < BASE64_ALPHABET.length; i += 1) {
  BASE64_LOOKUP[BASE64_ALPHABET[i]] = i;
}

/**
 * Decodes just enough of a base64 string to expose a file header. Invalid
 * characters (whitespace, URL escapes) are skipped rather than throwing, and
 * padding ends the scan.
 */
function decodeBase64Head(base64: string, minBytes = 12): Uint8Array {
  const out: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < base64.length && out.length < minBytes + 8; i += 1) {
    const char = base64[i];
    if (char === "=") break;
    const value = BASE64_LOOKUP[char];
    if (value === undefined) continue;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >> bits) & 0xff);
      buffer &= (1 << bits) - 1;
    }
  }
  return Uint8Array.from(out);
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  let text = "";
  for (let i = start; i < end && i < bytes.length; i += 1) {
    text += String.fromCharCode(bytes[i]);
  }
  return text;
}

/**
 * Identifies an image from its magic bytes, so neither the browser nor the
 * backend ever has to trust a declared MIME type. Returns the image's MIME
 * type, or null when the bytes are not a recognizable image.
 */
export function detectImageMimeFromBytes(bytes: Uint8Array): string | null {
  if (bytes.length < 12) return null;
  // PNG signature: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }
  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  // GIF87a / GIF89a
  if (ascii(bytes, 0, 4) === "GIF8") return "image/gif";
  // WEBP: "RIFF" .... "WEBP"
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") {
    return "image/webp";
  }
  return null;
}

/**
 * Same sniffing, from a base64 payload (with or without a `data:` prefix).
 */
export function detectImageMimeFromBase64(base64: string): string | null {
  const bare = base64.startsWith("data:")
    ? base64.slice(base64.indexOf(",") + 1)
    : base64;
  return detectImageMimeFromBytes(decodeBase64Head(bare));
}

/**
 * The authoritative image check, shared by the chat action (before anything
 * is stored) and available to the client for early rejection. On success it
 * returns the MIME type proven from the bytes — callers should store and
 * forward THAT, not the declared type.
 */
export function validateImageAttachment(image: ImageAttachment): ImageCheck {
  if (image.data.length === 0) return { ok: false, reason: "empty" };
  if (image.data.length > MAX_IMAGE_CHARS) {
    return { ok: false, reason: "tooLargeBytes" };
  }
  const mime = detectImageMimeFromBase64(image.data);
  if (!mime || !isSupportedImageMime(mime)) {
    return { ok: false, reason: "unsupportedBytes" };
  }
  return { ok: true, mimeType: mime as SupportedImageMimeType };
}

/**
 * Declared MIME type of a `data:` URL, with a fallback for legacy drafts.
 * The cropped image the cropper exports is always JPEG; older drafts may
 * carry PNG/WebP data URLs from before the cropper re-encoded everything.
 */
export function mimeTypeFromDataUrl(
  dataUrl: string,
  fallback: string = "image/jpeg",
): string {
  if (!dataUrl.startsWith("data:")) return fallback;
  const end = dataUrl.indexOf(";");
  if (end <= 5) return fallback;
  const mime = dataUrl.slice(5, end).trim().toLowerCase();
  return mime.startsWith("image/") ? mime : fallback;
}
