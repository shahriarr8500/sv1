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

/** Attachment kinds enabled today: images plus PDF documents (Phase 2). */
export const ATTACHMENT_KINDS = ["image", "pdf"] as const;
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

/* -------------------------------------------------------------------------- */
/* PDF documents (Phase 2)                                                     */
/* -------------------------------------------------------------------------- */

export const PDF_MIME_TYPE = "application/pdf";

/**
 * Whole-document budget. Gemini's documented ceiling is far higher (50 MB /
 * 1,000 pages), but an inline PDF is re-read on every request that carries
 * it, so the app stays conservative: 6 MB keeps a full request (base64
 * included) comfortably inside provider limits and keeps cost predictable.
 */
export const MAX_PDF_BYTES = 6 * 1024 * 1024;

/** Base64 length cap for a PDF payload (~6 MB binary). */
export const MAX_PDF_CHARS = 8_000_000;

/**
 * Page cap for whole-document questions. At ~258 tokens/page this is ~21k
 * tokens — well inside the model's 1M-token input window. Larger documents
 * are still viewable; questions about them go through selected-page
 * rendering (MAX_SELECTED_PAGES at a time).
 */
export const MAX_PDF_PAGES = 80;

/**
 * Largest page selection that can ride ONE question. Tied to
 * MAX_IMAGES_TOTAL (8): selected pages are rendered as images and the chat
 * action's multimodal budget spends at most 8 images per request (newest
 * turn first), so a selection up to 8 is delivered whole — anything larger
 * would be silently trimmed mid-turn. Whole-document questions bypass this
 * entirely: they run through the batched summary flow instead.
 */
export const MAX_SELECTED_PAGES = 8;

/**
 * Pages per batch in the staged "Summarize entire PDF" flow — one bounded
 * request per batch (never the whole document in one oversized call),
 * section summaries combined only after every batch succeeded.
 */
export const PDF_SUMMARY_BATCH_SIZE = MAX_SELECTED_PAGES;

/** Conservative per-message cap on PDF attachments. */
export const MAX_PDFS_PER_MESSAGE = 1;

/** One PDF attachment on the wire (client → chat action). */
export interface PdfAttachment {
  /** Display filename (sanitized before storage). */
  name: string;
  /** File size in bytes as the browser reported it. */
  size: number;
  /** Base64 payload WITHOUT the `data:` prefix. Never persisted in a doc. */
  data: string;
}

/** Safe metadata persisted on a message row (no bytes — storage id only). */
export interface StoredPdfRef {
  name: string;
  size: number;
  storageId: string;
}

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

/** Human-readable byte size for previews ("1.2 MB"). */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "unknown size";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Base64 → bytes, isomorphic (browser and Node both run this). */
export function decodeBase64(base64: string): Uint8Array {
  const bare = base64.startsWith("data:")
    ? base64.slice(base64.indexOf(",") + 1)
    : base64;
  const out: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < bare.length; i += 1) {
    const char = bare[i];
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

/* -------------------------------------------------------------------------- */
/* PDF validation                                                              */
/* -------------------------------------------------------------------------- */

export type PdfRejectionReason =
  | "empty"
  | "tooLarge"
  | "notPdf"
  | "encrypted"
  | "tooManyPages";

export type PdfCheck = { ok: true } | { ok: false; reason: PdfRejectionReason };

export const PDF_REJECTION_COPY: Record<PdfRejectionReason, string> = {
  empty: "That PDF file is empty. Please choose another file.",
  tooLarge:
    "That PDF is too large even to open here (over 60 MB). Try splitting it, or exporting a smaller version of the pages you need.",
  notPdf:
    "That file couldn't be opened as a PDF — it may be corrupt, or not really a PDF. Please re-export it and try again.",
  encrypted:
    "That PDF is password-protected. Remove the password (re-export it without one) and upload it again.",
  tooManyPages:
    "That PDF has more than 80 pages, so it can't be sent whole. Open it as a read-only copy instead: select any page range to ask about, or run \"Summarize entire PDF\" to process it in batches.",
};

/**
 * Shown when an oversized document is opened as a LOCAL read-only copy:
 * the file stays on the student's device (a blob URL, never uploaded), and
 * questions are asked through selected rendered pages instead.
 */
export const PDF_LOCAL_ONLY_NOTICE = {
  title: "Opened as a read-only copy",
  body: `This PDF is too large to attach, so it isn't uploaded. You can still read it here and ask Ashy about any page range — up to ${MAX_SELECTED_PAGES} pages per question — or use \u201cSummarize entire PDF\u201d to process the whole document in batches. Ashy reads exactly the pages you select.`,
} as const;

function bytesIndexOf(
  haystack: Uint8Array,
  needle: readonly number[],
  from = 0,
): number {
  outer: for (let i = from; i + needle.length <= haystack.length; i += 1) {
    for (let j = 0; j < needle.length; j += 1) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"
const ENCRYPT_MARKER = [0x2f, 0x45, 0x6e, 0x63, 0x72, 0x79, 0x70, 0x74]; // "/Encrypt"
const PAGE_MARKER = [0x2f, 0x54, 0x79, 0x70, 0x65, 0x20, 0x2f, 0x50, 0x61, 0x67, 0x65]; // "/Type /Page"

/** True when the bytes start with the PDF magic within the first 1024 bytes
 * (the spec allows a small offset for Junk-before-header producers). */
export function hasPdfSignature(bytes: Uint8Array): boolean {
  const at = bytesIndexOf(bytes, PDF_MAGIC);
  return at !== -1 && at <= 1024;
}

/** True when the file declares an encryption dictionary (password-protected). */
export function isEncryptedPdf(bytes: Uint8Array): boolean {
  return bytesIndexOf(bytes, ENCRYPT_MARKER) !== -1;
}

/**
 * Best-effort page count from uncompressed object markers ("/Type /Page",
 * excluding "/Type /Pages"). PDFs that compress their object streams yield
 * 0 here — callers must treat that as "unknown", not as an error. This is a
 * second line of defence: the client counts pages precisely with the PDF
 * renderer before uploading.
 */
export function countPdfPageMarkers(bytes: Uint8Array): number {
  let count = 0;
  let at = bytesIndexOf(bytes, PAGE_MARKER);
  while (at !== -1) {
    // "/Pages" has an extra 's' right after "/Page" — skip those.
    if (bytes[at + PAGE_MARKER.length] !== 0x73) count += 1;
    at = bytesIndexOf(bytes, PAGE_MARKER, at + 1);
  }
  return count;
}

/**
 * The authoritative PDF check shared by the browser (early, friendly
 * rejection) and the chat action (before anything touches storage). On
 * success the bytes are known to be a real, unencrypted PDF within budget.
 */
export function validatePdfBytes(
  bytes: Uint8Array,
  declaredSize?: number,
): PdfCheck {
  const size = declaredSize ?? bytes.length;
  if (bytes.length === 0 || size === 0) return { ok: false, reason: "empty" };
  if (bytes.length > MAX_PDF_BYTES || size > MAX_PDF_BYTES) {
    return { ok: false, reason: "tooLarge" };
  }
  if (!hasPdfSignature(bytes)) return { ok: false, reason: "notPdf" };
  if (isEncryptedPdf(bytes)) return { ok: false, reason: "encrypted" };
  const markers = countPdfPageMarkers(bytes);
  if (markers > MAX_PDF_PAGES) return { ok: false, reason: "tooManyPages" };
  return { ok: true };
}

/** Same check from a base64 wire payload. */
export function validatePdfAttachment(
  pdf: Pick<PdfAttachment, "size" | "data">,
): PdfCheck {
  if (pdf.data.length === 0) return { ok: false, reason: "empty" };
  if (pdf.data.length > MAX_PDF_CHARS) return { ok: false, reason: "tooLarge" };
  return validatePdfBytes(decodeBase64(pdf.data), pdf.size);
}

/* -------------------------------------------------------------------------- */
/* Upload disposition — attach, open locally, or reject                        */
/* -------------------------------------------------------------------------- */

/**
 * Hard ceiling for the LOCAL read-only reader path. Files up to this size
 * can be opened in the browser's PDF reader and answered page-by-page (the
 * bytes never leave the device); anything larger is rejected outright —
 * even loading it locally would risk freezing a phone browser.
 */
export const MAX_LOCAL_PDF_BYTES = 60 * 1024 * 1024;

/**
 * What the composer should do with a picked file:
 * - `attach`     — within every budget: validate, upload with the message.
 * - `localOnly`  — over the attach budget but still readable locally: open
 *                  as a read-only copy (blob URL), never uploaded; questions
 *                  go through rendered selected pages.
 * - `reject`     — not a real PDF, encrypted, empty, or too large to even
 *                  open locally.
 *
 * Order matters: the bytes must be a real, unencrypted PDF BEFORE any
 * size-based fallback, so a huge non-PDF can never reach the reader.
 */
export type PdfUploadDisposition =
  | { action: "attach" }
  | { action: "localOnly"; reason: "tooLarge" | "tooManyPages" }
  | { action: "reject"; reason: PdfRejectionReason };

export function pdfUploadDisposition(
  bytes: Uint8Array,
  declaredSize?: number,
): PdfUploadDisposition {
  const size = declaredSize ?? bytes.length;
  if (bytes.length === 0 || size === 0) {
    return { action: "reject", reason: "empty" };
  }
  if (!hasPdfSignature(bytes)) return { action: "reject", reason: "notPdf" };
  if (isEncryptedPdf(bytes)) return { action: "reject", reason: "encrypted" };
  if (bytes.length > MAX_LOCAL_PDF_BYTES || size > MAX_LOCAL_PDF_BYTES) {
    return { action: "reject", reason: "tooLarge" };
  }
  const overAttachSize =
    bytes.length > MAX_PDF_BYTES || size > MAX_PDF_BYTES;
  if (overAttachSize) return { action: "localOnly", reason: "tooLarge" };
  if (countPdfPageMarkers(bytes) > MAX_PDF_PAGES) {
    return { action: "localOnly", reason: "tooManyPages" };
  }
  return { action: "attach" };
}

/* -------------------------------------------------------------------------- */
/* Attachment markers — page/document identity on the wire                     */
/* -------------------------------------------------------------------------- */

/**
 * Bracket markers appended to the outgoing message text so the model (and
 * the student, in the chat bubble) can see exactly which document and which
 * pages are attached. Same visual language the history builder already uses
 * for older turns (`[Attached document: …]`), which is what makes honest
 * page citations possible: the model cites only pages it was actually given.
 */
export function documentAttachmentMarker(name: string): string {
  return `[Attached document: ${sanitizePdfName(name)}]`;
}

export function pagesAttachmentMarker(label: string): string {
  // The viewer builds labels like "Page 3 of notes.pdf" /
  // "Pages 2–4 of notes.pdf" — bounded and already sanitized upstream.
  let clean = "";
  for (const char of label) {
    // Strip control characters without a control-char regex.
    if (char.charCodeAt(0) >= 32) clean += char;
  }
  clean = clean.trim().slice(0, 160);
  return `[Attached: ${clean || "selected pages"}]`;
}

/** Display filename: path-free, bounded, never empty. */
export function sanitizePdfName(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? "";
  let clean = "";
  for (const char of base) {
    // Strip control characters without a control-char regex.
    if (char.charCodeAt(0) >= 32) clean += char;
  }
  clean = clean.trim().slice(0, 120);
  return clean || "document.pdf";
}

/** Clamps a page range to the document, enforcing min/max page counts. */
export function clampPageRange(
  from: number,
  to: number,
  numPages: number,
  maxPages: number = MAX_SELECTED_PAGES,
): { from: number; to: number } | null {
  const start = Math.min(Math.max(1, Math.round(from)), numPages);
  const end = Math.min(Math.max(1, Math.round(to)), numPages);
  const lo = Math.min(start, end);
  const hi = Math.max(start, end);
  if (hi - lo + 1 > maxPages) return null; // caller shows the limit
  return { from: lo, to: hi };
}

/* -------------------------------------------------------------------------- */
/* Page selection — parsing, validation, labels, batching (Issue 1)            */
/* -------------------------------------------------------------------------- */

/**
 * Result of parsing a student's page selection. Errors are student-facing
 * copy: every rejection names the problem AND the valid form, so nobody is
 * ever told to fall back to a single page only.
 */
export type PageSelection =
  | { ok: true; pages: number[] }
  | { ok: false; error: string };

const PAGE_SINGLE = /^(\d+)$/;
const PAGE_RANGE = /^(\d+)\s*[-\u2013\u2014]\s*(\d+)$/;

function beyondCopy(totalPages: number, page: number): string {
  return `Page ${page} is beyond this document \u2014 it has ${totalPages} ${
    totalPages === 1 ? "page" : "pages"
  }.`;
}

/**
 * Parses "7", "5-12", "5\u201312" or a list like "1, 3, 5-8" into an ordered,
 * de-duplicated page list. Rejects (with clear copy): page 0 / below 1,
 * reversed ranges, pages beyond the document's total, non-page text, and
 * selections larger than MAX_SELECTED_PAGES (the error offers both
 * alternatives: a smaller range, or the batched whole-document summary).
 */
export function parsePageSelection(
  input: string,
  totalPages: number,
): PageSelection {
  if (!Number.isFinite(totalPages) || totalPages < 1) {
    return {
      ok: false,
      error: "The page count for this document isn't known yet \u2014 wait for it to finish opening.",
    };
  }
  const raw = input.trim();
  if (raw.length === 0) {
    return {
      ok: false,
      error: "Enter a page or a range \u2014 for example 7, 5-12, or 1, 3, 5-8.",
    };
  }

  const pages = new Set<number>();
  for (const piece of raw.split(",")) {
    const token = piece.trim();
    if (token.length === 0) {
      return {
        ok: false,
        error: "Empty entry in your list \u2014 separate pages with commas, e.g. 1, 3, 5-8.",
      };
    }

    const range = PAGE_RANGE.exec(token);
    if (range) {
      const from = Number(range[1]);
      const to = Number(range[2]);
      for (const endpoint of [from, to]) {
        if (endpoint < 1) {
          return {
            ok: false,
            error: `Page ${endpoint} doesn't exist \u2014 pages start at 1.`,
          };
        }
        if (endpoint > totalPages) {
          return { ok: false, error: beyondCopy(totalPages, endpoint) };
        }
      }
      if (from > to) {
        return {
          ok: false,
          error: `Pages ${from}\u2013${to} run backwards \u2014 enter the range in order, e.g. ${to}\u2013${from}.`,
        };
      }
      for (let page = from; page <= to; page += 1) pages.add(page);
      continue;
    }

    const single = PAGE_SINGLE.exec(token);
    if (!single) {
      const shown = token.slice(0, 24);
      return {
        ok: false,
        error: `\u201c${shown}\u201d isn't a page number \u2014 use a page like 7, a range like 5-12, or a list like 1, 3, 5-8.`,
      };
    }
    const page = Number(single[1]);
    if (page < 1) {
      return { ok: false, error: `Page ${page} doesn't exist \u2014 pages start at 1.` };
    }
    if (page > totalPages) {
      return { ok: false, error: beyondCopy(totalPages, page) };
    }
    pages.add(page);
  }

  const sorted = [...pages].sort((a, b) => a - b);
  if (sorted.length === 0) {
    return { ok: false, error: "Select at least one page." };
  }
  if (sorted.length > MAX_SELECTED_PAGES) {
    return {
      ok: false,
      error:
        `That's ${sorted.length} pages \u2014 one question can carry at most ${MAX_SELECTED_PAGES} pages. ` +
        `Explain up to ${MAX_SELECTED_PAGES} pages at a time (a range like 5-12), ` +
        `or use \u201cSummarize entire PDF\u201d to process every page in batches.`,
    };
  }
  return { ok: true, pages: sorted };
}

/** Expands a contiguous range into its page list (batch → images). */
export function rangeToPages(range: { from: number; to: number }): number[] {
  const pages: number[] = [];
  for (let page = range.from; page <= range.to; page += 1) pages.push(page);
  return pages;
}

/**
 * Chat-bubble / marker label for a selection, in document order:
 * "Page 3 of notes.pdf", "Pages 5\u201212 of notes.pdf",
 * "Pages 1, 3, 5\u20128 of notes.pdf".
 */
export function pageSelectionLabel(
  pages: readonly number[],
  name: string,
): string {
  const doc = sanitizePdfName(name);
  if (pages.length === 0) return `Selected pages of ${doc}`;
  if (pages.length === 1) return `Page ${pages[0]} of ${doc}`;
  const runs: string[] = [];
  let start = pages[0];
  let prev = pages[0];
  for (let i = 1; i <= pages.length; i += 1) {
    const current = pages[i];
    if (current !== undefined && current === prev + 1) {
      prev = current;
      continue;
    }
    runs.push(start === prev ? String(start) : `${start}\u2013${prev}`);
    if (current === undefined) break;
    start = current;
    prev = current;
  }
  return `Pages ${runs.join(", ")} of ${doc}`;
}

/**
 * The bounded batch plan for a whole-document summary: contiguous ranges in
 * page order, each at most PDF_SUMMARY_BATCH_SIZE pages, covering every page
 * exactly once (asserted by the tests: the flattened plan of a 100-page PDF
 * is 1..100 with no gap and no overlap).
 */
export function pageRangeBatches(
  totalPages: number,
  batchSize: number = PDF_SUMMARY_BATCH_SIZE,
): Array<{ from: number; to: number }> {
  const batches: Array<{ from: number; to: number }> = [];
  if (!Number.isFinite(totalPages) || totalPages < 1) return batches;
  const size = Math.max(1, Math.floor(batchSize));
  for (let from = 1; from <= totalPages; from += size) {
    batches.push({ from, to: Math.min(totalPages, from + size - 1) });
  }
  return batches;
}

/**
 * The instruction sent for ONE batch of a staged whole-document summary.
 * Bounded on purpose: it names the batch's own pages, forbids content from
 * outside them, and demands page citations — which is what makes the final
 * combined summary honest (every page was actually processed, in order).
 */
export function batchSummaryPrompt(
  batch: { index: number; total: number; from: number; to: number },
  name: string,
): string {
  const doc = sanitizePdfName(name);
  return (
    `Section ${batch.index} of ${batch.total} \u2014 summarize pages ${batch.from}\u2013${batch.to} of ${doc}. ` +
    `ONLY these pages are attached as images, already in page order. ` +
    `Write a concise section summary of what those pages actually say, keep the points in page order, ` +
    `and cite the page number for every point (for example \u201cpage ${batch.from}\u201d) using the numbers on the attached pages. ` +
    `Do not summarize, mention or invent anything from a page outside ${batch.from}\u2013${batch.to}.`
  );
}

/**
 * The instruction for the FINAL combine step — only ever sent after every
 * batch has been processed. It keeps the section order and page references,
 * requires an explicit "Pages covered" line, and forbids adding content that
 * was never in a section summary, so the reply can't claim a full-document
 * analysis it didn't do.
 */
export function finalSummaryPrompt(
  name: string,
  totalPages: number,
  batches: ReadonlyArray<{ from: number; to: number }>,
): string {
  const doc = sanitizePdfName(name);
  const sections = batches.map((batch) => `${batch.from}\u2013${batch.to}`).join(", ");
  return (
    `Every page of ${doc} has now been summarized above in ${batches.length} ordered batches (pages ${sections}). ` +
    `Combine those section summaries into one final summary of the whole document: keep the section order, ` +
    `keep every page reference, and end with a line \u201cPages covered: 1\u2013${totalPages}\u201d. ` +
    `Only include content that appeared in the section summaries above \u2014 do not add anything new, ` +
    `and do not skip any section.`
  );
}
