/**
 * Tests for Ashy's attachment foundation (Phase 1).
 *
 * Run with:  bun src/tests/ashyAttachments.test.ts
 * Exit code 0 = all assertions passed.
 *
 * These execute the SAME functions the browser and the Convex chat action
 * run in production (src/lib/ashy-attachments.ts, plus the client-side
 * history builder in src/lib/ashy.ts). Everything here is pure/isomorphic —
 * no DOM, no network, no keys, no image pixel data beyond tiny headers.
 */

import {
  ACCEPTED_IMAGE_MIME_TYPES,
  ATTACHMENT_KINDS,
  IMAGE_REJECTION_COPY,
  MAX_IMAGE_BYTES,
  MAX_IMAGE_CHARS,
  MAX_IMAGES_TOTAL,
  SUPPORTED_IMAGE_MIME_TYPES,
  detectImageMimeFromBase64,
  detectImageMimeFromBytes,
  isAcceptedImageMime,
  isSupportedImageMime,
  mimeTypeFromDataUrl,
  validateImageAttachment,
} from "../lib/ashy-attachments";
import { buildHistory, type AshyMessage } from "../lib/ashy";

let checks = 0;
let failures = 0;

function assert(condition: boolean, label: string): void {
  checks += 1;
  if (!condition) {
    failures += 1;
    console.error(`FAIL  ${label}`);
  }
}

/* -------------------------------------------------------------------------- */
/* Fixtures: minimal magic-byte headers (12 bytes each, no real pixel data)    */
/* -------------------------------------------------------------------------- */

const PNG_BYTES = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);
const JPEG_BYTES = Uint8Array.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
]);
const GIF_BYTES = Uint8Array.from([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x00, 0x00,
]);
const WEBP_BYTES = Uint8Array.from([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
]);
const PDF_BYTES = Uint8Array.from([
  0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a, 0x25, 0xe2, 0xe3,
]);
const UNKNOWN_BYTES = Uint8Array.from([
  0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b,
]);

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

/* -------------------------------------------------------------------------- */
/* 1. Byte-level MIME detection (PNG / JPEG / GIF / WebP / everything else)    */
/* -------------------------------------------------------------------------- */

assert(detectImageMimeFromBytes(PNG_BYTES) === "image/png", "sniffs PNG bytes");
assert(detectImageMimeFromBytes(JPEG_BYTES) === "image/jpeg", "sniffs JPEG bytes");
assert(detectImageMimeFromBytes(GIF_BYTES) === "image/gif", "sniffs GIF bytes");
assert(detectImageMimeFromBytes(WEBP_BYTES) === "image/webp", "sniffs WebP bytes");
assert(detectImageMimeFromBytes(PDF_BYTES) === null, "rejects PDF bytes");
assert(detectImageMimeFromBytes(UNKNOWN_BYTES) === null, "rejects unknown bytes");
assert(
  detectImageMimeFromBytes(Uint8Array.from([0xff, 0xd8])) === null,
  "rejects headers that are too short",
);

/* -------------------------------------------------------------------------- */
/* 2. Base64 sniffing — bare payloads and data: URLs                          */
/* -------------------------------------------------------------------------- */

assert(
  detectImageMimeFromBase64(toBase64(JPEG_BYTES)) === "image/jpeg",
  "sniffs base64 JPEG payload",
);
assert(
  detectImageMimeFromBase64(`data:image/jpeg;base64,${toBase64(JPEG_BYTES)}`) ===
    "image/jpeg",
  "sniffs a data: URL payload (prefix ignored)",
);
assert(
  detectImageMimeFromBase64(toBase64(PNG_BYTES)) === "image/png",
  "sniffs base64 PNG payload",
);
assert(
  detectImageMimeFromBase64(toBase64(PDF_BYTES)) === null,
  "base64 PDF payload is not an image",
);
assert(
  detectImageMimeFromBase64("not-an-image-at-all") === null,
  "garbage base64 is not an image",
);

/* -------------------------------------------------------------------------- */
/* 3. Supported / accepted sets — exactly PNG, JPEG, WebP for uploads          */
/* -------------------------------------------------------------------------- */

assert(
  ATTACHMENT_KINDS.length === 2 &&
    ATTACHMENT_KINDS[0] === "image" &&
    ATTACHMENT_KINDS[1] === "pdf",
  "attachment kinds are exactly [image, pdf] (Phase 2)",
);
assert(ACCEPTED_IMAGE_MIME_TYPES.length === 3, "exactly three accepted upload types");
assert(isAcceptedImageMime("image/png"), "accepts PNG");
assert(isAcceptedImageMime("image/jpeg"), "accepts JPEG");
assert(isAcceptedImageMime("image/webp"), "accepts WebP");
assert(!isAcceptedImageMime("image/gif"), "GIF is not uploadable");
assert(!isAcceptedImageMime("application/pdf"), "PDF is not uploadable");
assert(!isAcceptedImageMime("image/heic"), "HEIC is not uploadable");
assert(
  !ACCEPTED_IMAGE_MIME_TYPES.includes("application/pdf" as never),
  "accepted set contains no PDF",
);

// Back-compat: GIF stays server-SUPPORTED so image messages stored by earlier
// deploys keep hydrating into Gemini context, but it can never be uploaded.
assert(isSupportedImageMime("image/gif"), "GIF stays supported for stored history");
assert(!isAcceptedImageMime("image/gif"), "GIF uploads still rejected");
assert(isSupportedImageMime("image/png"), "PNG supported");
assert(isSupportedImageMime("image/jpeg"), "JPEG supported");
assert(isSupportedImageMime("image/webp"), "WebP supported");
assert(!isSupportedImageMime("application/pdf"), "PDF never supported server-side");
assert(
  SUPPORTED_IMAGE_MIME_TYPES.every((mime) => typeof mime === "string"),
  "supported types are plain MIME strings",
);

/* -------------------------------------------------------------------------- */
/* 4. Resource limits — unchanged 8 MB / base64 caps / 8-image budget          */
/* -------------------------------------------------------------------------- */

assert(MAX_IMAGE_BYTES === 8 * 1024 * 1024, "image size cap is exactly 8 MB");
assert(MAX_IMAGE_CHARS === 4_000_000, "base64 length cap is exactly 4,000,000 chars");
assert(MAX_IMAGES_TOTAL === 8, "context image budget is exactly 8");
for (const reason of ["empty", "tooLargeBytes", "unsupportedBytes"] as const) {
  assert(
    typeof IMAGE_REJECTION_COPY[reason] === "string" &&
      IMAGE_REJECTION_COPY[reason].length > 0,
    `user-facing copy exists for rejection reason "${reason}"`,
  );
}

/* -------------------------------------------------------------------------- */
/* 5. validateImageAttachment — the authoritative server check                 */
/* -------------------------------------------------------------------------- */

const goodJpeg = toBase64(JPEG_BYTES);
const goodPng = toBase64(PNG_BYTES);

const valid = validateImageAttachment({ mimeType: "image/jpeg", data: goodJpeg });
assert(valid.ok, "valid JPEG passes validation");
assert(valid.ok && valid.mimeType === "image/jpeg", "valid JPEG reports its proven type");

// A wrong declared MIME is overridden by the proven bytes, never trusted.
const mislabeled = validateImageAttachment({
  mimeType: "image/png",
  data: goodJpeg,
});
assert(mislabeled.ok && mislabeled.mimeType === "image/jpeg", "declared MIME is overridden by bytes");
const spoofed = validateImageAttachment({
  mimeType: "image/png",
  data: toBase64(PDF_BYTES),
});
assert(!spoofed.ok && spoofed.reason === "unsupportedBytes", "PDF bytes claiming image/png are rejected");

const empty = validateImageAttachment({ mimeType: "image/jpeg", data: "" });
assert(!empty.ok && empty.reason === "empty", "empty payload is rejected");

const oversized = validateImageAttachment({
  mimeType: "image/jpeg",
  data: "A".repeat(MAX_IMAGE_CHARS + 1),
});
assert(!oversized.ok && oversized.reason === "tooLargeBytes", "payload over the base64 cap is rejected");

const atCap = validateImageAttachment({
  mimeType: "image/png",
  data: `${goodPng}${"A".repeat(MAX_IMAGE_CHARS - goodPng.length)}`,
});
assert(atCap.ok, "payload exactly at the cap still passes");

const gif = validateImageAttachment({ mimeType: "image/gif", data: toBase64(GIF_BYTES) });
assert(gif.ok && gif.mimeType === "image/gif", "stored GIF history still validates (back-compat)");

/* -------------------------------------------------------------------------- */
/* 6. Client helpers: data-URL mime + the sent payload shape                   */
/* -------------------------------------------------------------------------- */

assert(
  mimeTypeFromDataUrl("data:image/png;base64,AAAA") === "image/png",
  "reads the MIME from a PNG data URL",
);
assert(
  mimeTypeFromDataUrl("data:image/jpeg;base64,AAAA") === "image/jpeg",
  "reads the MIME from a JPEG data URL",
);
assert(
  mimeTypeFromDataUrl("garbage") === "image/jpeg",
  "falls back to JPEG for drafts without a data: prefix",
);

/* -------------------------------------------------------------------------- */
/* 7. Back-compat: client history building never re-sends stored blobs         */
/* -------------------------------------------------------------------------- */

const historyMessages: AshyMessage[] = [
  {
    id: "1",
    role: "user",
    text: "solve this",
    images: [{ mimeType: "image/jpeg", url: "https://cdn.example/img1" }],
  },
  {
    id: "2",
    role: "assistant",
    text: "sure",
    images: [{ mimeType: "image/jpeg", data: goodJpeg }],
  },
  {
    id: "3",
    role: "assistant",
    text: "",
    error: "quota",
  },
];

const turns = buildHistory(historyMessages);
assert(turns.length === 2, "failed assistant turns are dropped from history");
assert(
  turns[0].images === undefined,
  "stored (URL-only) images are never sent from the client — hydrated server-side",
);
assert(
  turns[1].images?.length === 1 &&
    turns[1].images[0].data === goodJpeg &&
    turns[1].images[0].mimeType === "image/jpeg",
  "local base64 images travel with their MIME type",
);
const capped = buildHistory(
  Array.from({ length: 5 }, (_, i) => ({
    id: String(i),
    role: "user" as const,
    text: `message ${i}`,
  })),
  3,
);
assert(capped.length === 3, "history stays capped at the caller's turn limit");

/* -------------------------------------------------------------------------- */

console.log(`\n${checks} checks, ${failures} failures`);
if (failures > 0) {
  console.error("Attachment tests FAILED");
  process.exit(1);
}
console.log("Attachment tests passed");
