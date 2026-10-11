/**
 * Tests for Ashy's Phase 2 PDF + transcription foundation.
 *
 * Run with:  bun src/tests/ashyPdf.test.ts
 * Exit code 0 = all assertions passed.
 *
 * These execute the SAME pure functions the browser and the Convex chat
 * action run in production (src/lib/ashy-attachments.ts and the
 * transcription instruction in src/convex/ashyShared.ts). No DOM, no network,
 * no keys, no real document content — fixtures are tiny synthetic headers.
 */

import {
  MAX_LOCAL_PDF_BYTES,
  MAX_PDF_BYTES,
  MAX_PDF_CHARS,
  MAX_PDF_PAGES,
  MAX_PDFS_PER_MESSAGE,
  MAX_SELECTED_PAGES,
  PDF_LOCAL_ONLY_NOTICE,
  PDF_MIME_TYPE,
  PDF_REJECTION_COPY,
  clampPageRange,
  countPdfPageMarkers,
  decodeBase64,
  documentAttachmentMarker,
  hasPdfSignature,
  isEncryptedPdf,
  pagesAttachmentMarker,
  pdfUploadDisposition,
  sanitizePdfName,
  validatePdfAttachment,
  validatePdfBytes,
} from "../lib/ashy-attachments";
import {
  DOCUMENT_INSTRUCTION,
  TRANSCRIPTION_INSTRUCTION,
} from "../convex/ashyShared";
import { ASHY_FAILURE_COPY, buildHistory, type AshyMessage } from "../lib/ashy";

let checks = 0;
let failures = 0;

function assert(condition: boolean, label: string): void {
  checks += 1;
  if (!condition) {
    failures += 1;
    console.error(`FAIL  ${label}`);
  }
}

function bytes(...values: number[]): Uint8Array {
  return Uint8Array.from(values);
}

function textBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

const ASCII_PDF_HEADER = "%PDF-1.7\n";
const VALID_PDF = textBytes(
  `${ASCII_PDF_HEADER}1 0 obj\n<< /Type /Page /Parent 2 0 R >>\nendobj\n%%EOF\n`,
);
const JUNK_PREFIXED_PDF = textBytes(
  `junk${ASCII_PDF_HEADER}1 0 obj\n<< /Type /Page >>\n%%EOF\n`,
);
const ENCRYPTED_PDF = textBytes(
  `${ASCII_PDF_HEADER}trailer\n<< /Encrypt 5 0 R >>\n%%EOF\n`,
);
const GARBAGE = textBytes("this is definitely not a pdf at all, sorry");
const EMPTY = new Uint8Array(0);
const HUGE = new Uint8Array(MAX_PDF_BYTES + 1);
HUGE[0] = 0x25; // starts with "%", but over the size cap

/* -------------------------------------------------------------------------- */
/* 1. Signature detection                                                     */
/* -------------------------------------------------------------------------- */

assert(hasPdfSignature(VALID_PDF), "accepts a %PDF- header at offset 0");
assert(
  hasPdfSignature(JUNK_PREFIXED_PDF),
  "accepts a %PDF- header within the first 1024 bytes (junk producers)",
);
assert(!hasPdfSignature(GARBAGE), "rejects non-PDF bytes");
assert(!hasPdfSignature(EMPTY), "rejects an empty file");
assert(
  !hasPdfSignature(textBytes(`x${"a".repeat(2000)}%PDF-1.4`)),
  "rejects a header beyond the 1024-byte tolerance",
);

/* -------------------------------------------------------------------------- */
/* 2. Encryption + page markers                                               */
/* -------------------------------------------------------------------------- */

assert(isEncryptedPdf(ENCRYPTED_PDF), "detects /Encrypt (password-protected)");
assert(!isEncryptedPdf(VALID_PDF), "plain PDF is not flagged encrypted");

const manyPages = textBytes(
  `${ASCII_PDF_HEADER}${"/Type /Page\n".repeat(MAX_PDF_PAGES + 5)}%%EOF`,
);
const fewPages = textBytes(
  `${ASCII_PDF_HEADER}${"/Type /Page\n".repeat(3)}%%EOF`,
);
const pagesTree = textBytes(
  `${ASCII_PDF_HEADER}/Type /Pages\n/Type /Page\n/Type /Pages\n%%EOF`,
);
assert(
  countPdfPageMarkers(manyPages) === MAX_PDF_PAGES + 5,
  "counts every /Type /Page marker",
);
assert(countPdfPageMarkers(fewPages) === 3, "counts a small document's pages");
assert(
  countPdfPageMarkers(pagesTree) === 1,
  "does not count /Type /Pages nodes as pages",
);
assert(
  countPdfPageMarkers(textBytes(`${ASCII_PDF_HEADER}%%EOF compressed streams`)) ===
    0,
  "compressed object streams yield 0 markers (treated as unknown, not an error)",
);

/* -------------------------------------------------------------------------- */
/* 3. validatePdfBytes — the authoritative check                              */
/* -------------------------------------------------------------------------- */

const valid = validatePdfBytes(VALID_PDF, VALID_PDF.length);
assert(valid.ok, "valid small PDF passes");
const junked = validatePdfBytes(JUNK_PREFIXED_PDF, JUNK_PREFIXED_PDF.length);
assert(junked.ok, "junk-prefixed PDF passes");
const encrypted = validatePdfBytes(ENCRYPTED_PDF, ENCRYPTED_PDF.length);
assert(!encrypted.ok && encrypted.reason === "encrypted", "encrypted PDF is rejected as encrypted");
const notPdf = validatePdfBytes(GARBAGE, GARBAGE.length);
assert(!notPdf.ok && notPdf.reason === "notPdf", "garbage is rejected as not-a-PDF");
const empty = validatePdfBytes(EMPTY, 0);
assert(!empty.ok && empty.reason === "empty", "empty file is rejected as empty");
const tooLarge = validatePdfBytes(HUGE, HUGE.length);
assert(!tooLarge.ok && tooLarge.reason === "tooLarge", "oversized file is rejected as tooLarge");
const tooManyPages = validatePdfBytes(manyPages, manyPages.length);
assert(
  !tooManyPages.ok && tooManyPages.reason === "tooManyPages",
  "over-page-budget PDF is rejected as tooManyPages",
);
// Declared size can lie upward — the bytes still count.
const lyingSize = validatePdfBytes(GARBAGE, 0);
assert(!lyingSize.ok, "a zero declared size is rejected even with bytes present");

/* -------------------------------------------------------------------------- */
/* 4. validatePdfAttachment — base64 wire payloads                            */
/* -------------------------------------------------------------------------- */

const wire = validatePdfAttachment({
  size: VALID_PDF.length,
  data: decodeBase64ToSelf(VALID_PDF),
});
assert(wire.ok, "base64 wire payload of a valid PDF passes");

const wireEmpty = validatePdfAttachment({ size: 10, data: "" });
assert(!wireEmpty.ok && wireEmpty.reason === "empty", "empty base64 is rejected");
const wireOversized = validatePdfAttachment({
  size: 10,
  data: "A".repeat(MAX_PDF_CHARS + 1),
});
assert(
  !wireOversized.ok && wireOversized.reason === "tooLarge",
  "base64 over the char cap is rejected",
);
const wireEncrypted = validatePdfAttachment({
  size: ENCRYPTED_PDF.length,
  data: decodeBase64ToSelf(ENCRYPTED_PDF),
});
assert(
  !wireEncrypted.ok && wireEncrypted.reason === "encrypted",
  "encrypted PDF is rejected on the wire path too",
);
const wireSpoofed = validatePdfAttachment({
  size: GARBAGE.length,
  data: decodeBase64ToSelf(GARBAGE),
});
assert(
  !wireSpoofed.ok && wireSpoofed.reason === "notPdf",
  "a .pdf filename can't make non-PDF bytes valid",
);

/** Base64-encodes fixture bytes with Node's Buffer (test-side only). */
function decodeBase64ToSelf(input: Uint8Array): string {
  return Buffer.from(input).toString("base64");
}

// decodeBase64 round-trip sanity (the shared decoder under test).
assert(
  Buffer.from(decodeBase64(decodeBase64ToSelf(VALID_PDF))).equals(
    Buffer.from(VALID_PDF),
  ),
  "decodeBase64 round-trips the shared base64 encoder",
);

/* -------------------------------------------------------------------------- */
/* 5. Limits are exactly what the spec set                                    */
/* -------------------------------------------------------------------------- */

assert(MAX_PDF_BYTES === 6 * 1024 * 1024, "PDF size cap is exactly 6 MB");
assert(MAX_PDF_CHARS === 8_000_000, "PDF base64 cap is exactly 8,000,000 chars");
assert(MAX_PDF_PAGES === 80, "whole-document page budget is exactly 80");
assert(MAX_SELECTED_PAGES === 6, "selected-page question cap is exactly 6");
assert(MAX_PDFS_PER_MESSAGE === 1, "one PDF per message");
assert(PDF_MIME_TYPE === "application/pdf", "PDF MIME constant");
for (const reason of [
  "empty",
  "tooLarge",
  "notPdf",
  "encrypted",
  "tooManyPages",
] as const) {
  assert(
    typeof PDF_REJECTION_COPY[reason] === "string" &&
      PDF_REJECTION_COPY[reason].length > 0,
    `user-facing copy exists for PDF rejection "${reason}"`,
  );
}

/* -------------------------------------------------------------------------- */
/* 6. Page-range selection (the "ask about pages" flow)                       */
/* -------------------------------------------------------------------------- */

assert(
  JSON.stringify(clampPageRange(3, 3, 10)) === JSON.stringify({ from: 3, to: 3 }),
  "single page clamps to itself",
);
assert(
  JSON.stringify(clampPageRange(5, 2, 10)) === JSON.stringify({ from: 2, to: 5 }),
  "reversed range is normalized",
);
assert(
  JSON.stringify(clampPageRange(0, 2, 10)) === JSON.stringify({ from: 1, to: 2 }),
  "range below 1 clamps up",
);
assert(
  JSON.stringify(clampPageRange(8, 99, 10)) === JSON.stringify({ from: 8, to: 10 }),
  "range beyond the document clamps to the last page",
);
assert(
  clampPageRange(1, 20, 100) === null,
  "a range wider than MAX_SELECTED_PAGES is refused",
);
assert(
  clampPageRange(2, 4, 100, 2) === null,
  "a 3-page range is refused when the cap is 2",
);
assert(
  clampPageRange(2, 3, 100, 2) !== null,
  "a range exactly at the cap passes",
);

/* -------------------------------------------------------------------------- */
/* 7. Filename sanitization (no paths reach storage/display)                  */
/* -------------------------------------------------------------------------- */

assert(
  sanitizePdfName("../../etc/passwd") === "passwd",
  "strips path traversal segments",
);
assert(sanitizePdfName("C:\\Users\\x\\notes.pdf") === "notes.pdf", "strips Windows paths");
assert(sanitizePdfName("") === "document.pdf", "empty name falls back");
assert(
  sanitizePdfName("a".repeat(300)).length <= 120,
  "very long names are truncated",
);

/* -------------------------------------------------------------------------- */
/* 8. Handwritten-note transcription instruction                              */
/* -------------------------------------------------------------------------- */

assert(
  TRANSCRIPTION_INSTRUCTION.includes("[unclear]"),
  "transcription marks uncertainty as [unclear]",
);
assert(
  /Bangla/.test(TRANSCRIPTION_INSTRUCTION) && /English/.test(TRANSCRIPTION_INSTRUCTION),
  "transcription recognizes Bangla and English",
);
assert(
  /\\text\{H\}_2/.test(TRANSCRIPTION_INSTRUCTION),
  "transcription preserves chemical subscripts",
);
assert(
  /LaTeX/.test(TRANSCRIPTION_INSTRUCTION) && /\$/.test(TRANSCRIPTION_INSTRUCTION),
  "transcription preserves math in LaTeX",
);
assert(
  /subscripts\/superscripts|subscripts and superscripts|subscripts\/superscript/i.test(
    TRANSCRIPTION_INSTRUCTION,
  ) || /superscripts/i.test(TRANSCRIPTION_INSTRUCTION),
  "transcription preserves superscripts (charges, exponents)",
);
assert(
  /NEVER invent/i.test(TRANSCRIPTION_INSTRUCTION),
  "transcription forbids inventing missing content",
);
assert(
  /page references/i.test(TRANSCRIPTION_INSTRUCTION),
  "transcription preserves page references",
);
assert(
  /TRANSCRIBE the attached|transcription ONLY/i.test(TRANSCRIPTION_INSTRUCTION),
  "transcription is kept separate from explanation",
);

/* -------------------------------------------------------------------------- */
/* 9. New failure kinds carry client-facing copy (back-compat with Phase 1)   */
/* -------------------------------------------------------------------------- */

for (const kind of [
  "invalidPdf",
  "encryptedPdf",
  "pdfTooManyPages",
  "invalidImage",
] as const) {
  assert(
    typeof ASHY_FAILURE_COPY[kind] === "string" && ASHY_FAILURE_COPY[kind].length > 0,
    `client failure copy exists for "${kind}"`,
  );
}

/* -------------------------------------------------------------------------- */
/* 10. Back-compat: image conversations keep working                          */
/* -------------------------------------------------------------------------- */

const jpegBase64 = Buffer.from(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0)).toString(
  "base64",
);
const mixedHistory: AshyMessage[] = [
  { id: "1", role: "user", text: "solve this", images: [{ mimeType: "image/jpeg", data: jpegBase64 }] },
  { id: "2", role: "assistant", text: "done" },
  { id: "3", role: "user", text: "thanks", pdfs: [{ name: "notes.pdf", size: 1234, url: "https://cdn.example/x" }] },
  { id: "4", role: "assistant", text: "yw" },
];
const turns = buildHistory(mixedHistory);
assert(turns.length === 4, "mixed image/PDF history builds the same turn count");
assert(
  turns[0].images?.length === 1 && turns[0].images[0].data === jpegBase64,
  "image turns still carry their local payload (Phase 1 behaviour intact)",
);
assert(
  turns[2].images === undefined,
  "client turns never re-send stored PDF bytes (hydrated server-side only)",
);

/* -------------------------------------------------------------------------- */
/* 11. Upload disposition — attach vs local read-only copy vs reject          */
/* -------------------------------------------------------------------------- */

assert(MAX_LOCAL_PDF_BYTES === 60 * 1024 * 1024, "local reader ceiling is exactly 60 MB");

// Zero-filled buffers of a given size with a real PDF header — no giant
// strings, no base64, just enough bytes for the disposition decision.
function fakePdfOfSize(totalBytes: number): Uint8Array {
  const bytes = new Uint8Array(totalBytes);
  bytes.set(textBytes(ASCII_PDF_HEADER), 0);
  return bytes;
}
const OVER_ATTACH_PDF = fakePdfOfSize(MAX_PDF_BYTES + 16); // 6 MB + ε
const OVER_LOCAL_PDF = fakePdfOfSize(MAX_LOCAL_PDF_BYTES + 16); // 60 MB + ε

assert(
  pdfUploadDisposition(VALID_PDF, VALID_PDF.length).action === "attach",
  "a valid small PDF is attached normally",
);
const dispBig = pdfUploadDisposition(OVER_ATTACH_PDF, OVER_ATTACH_PDF.length);
assert(
  dispBig.action === "localOnly" && dispBig.reason === "tooLarge",
  "a real PDF over the attach cap becomes a local read-only copy",
);
const dispHuge = pdfUploadDisposition(OVER_LOCAL_PDF, OVER_LOCAL_PDF.length);
assert(
  dispHuge.action === "reject" && dispHuge.reason === "tooLarge",
  "a real PDF over the local ceiling is rejected outright",
);
const dispPages = pdfUploadDisposition(manyPages, manyPages.length);
assert(
  dispPages.action === "localOnly" && dispPages.reason === "tooManyPages",
  "an over-page-budget PDF becomes a local read-only copy, not a dead end",
);
const dispEncrypted = pdfUploadDisposition(ENCRYPTED_PDF, ENCRYPTED_PDF.length);
assert(
  dispEncrypted.action === "reject" && dispEncrypted.reason === "encrypted",
  "encrypted PDFs are rejected before any size fallback",
);
const dispGarbage = pdfUploadDisposition(GARBAGE, GARBAGE.length);
assert(
  dispGarbage.action === "reject" && dispGarbage.reason === "notPdf",
  "non-PDF bytes are rejected before any size fallback",
);
const dispEmpty = pdfUploadDisposition(EMPTY, 0);
assert(
  dispEmpty.action === "reject" && dispEmpty.reason === "empty",
  "empty files are rejected",
);
// A declared size can lie: bytes still rule, size still caps.
assert(
  pdfUploadDisposition(VALID_PDF, MAX_PDF_BYTES + 1).action === "localOnly",
  "a lying declared size over the attach cap downgrades to local-only",
);
assert(
  pdfUploadDisposition(VALID_PDF, MAX_LOCAL_PDF_BYTES + 1).action === "reject",
  "a lying declared size over the local ceiling rejects",
);
// A huge NON-PDF can never reach the reader, whatever its size.
const hugeGarbage = new Uint8Array(MAX_LOCAL_PDF_BYTES + 16);
hugeGarbage.set(textBytes("not a pdf at all"), 0);
assert(
  pdfUploadDisposition(hugeGarbage, hugeGarbage.length).action === "reject",
  "a huge non-PDF is rejected, never opened locally",
);

/* -------------------------------------------------------------------------- */
/* 12. Attachment markers — the page/document identity contract                */
/* -------------------------------------------------------------------------- */

assert(
  documentAttachmentMarker("physics notes.pdf") ===
    "[Attached document: physics notes.pdf]",
  "document marker matches the history marker format exactly",
);
assert(
  documentAttachmentMarker("../../etc/notes.pdf") ===
    "[Attached document: notes.pdf]",
  "document marker sanitizes paths",
);
assert(
  pagesAttachmentMarker("Pages 3–5 of notes.pdf") ===
    "[Attached: Pages 3–5 of notes.pdf]",
  "pages marker carries the viewer's page range label",
);
assert(
  pagesAttachmentMarker("Page 2 of notes.pdf") ===
    "[Attached: Page 2 of notes.pdf]",
  "single-page marker keeps the label intact",
);
assert(
  pagesAttachmentMarker("") === "[Attached: selected pages]",
  "an empty page label still produces a valid marker",
);
assert(
  pagesAttachmentMarker(`bad\u0000\u0001chars ${"x".repeat(400)}`).length <=
    160 + "[Attached: ]".length,
  "page labels are control-stripped and bounded",
);
// The chat action injects DOCUMENT_INSTRUCTION only when a marker like these
// appears in the request — this is the wire contract that triggers it.
const SERVER_MARKER_PATTERN = /\[Attached( document)?:/;
assert(
  SERVER_MARKER_PATTERN.test(documentAttachmentMarker("notes.pdf")) &&
    SERVER_MARKER_PATTERN.test(pagesAttachmentMarker("Page 1 of notes.pdf")),
  "both markers match the server's injection pattern",
);
assert(
  !SERVER_MARKER_PATTERN.test("I attached my notes earlier"),
  "ordinary prose never triggers the document instruction",
);

/* -------------------------------------------------------------------------- */
/* 13. DOCUMENT_INSTRUCTION — grounding rules for attached documents          */
/* -------------------------------------------------------------------------- */

assert(
  /Cite the page number/i.test(DOCUMENT_INSTRUCTION),
  "document answers cite page numbers",
);
assert(
  /do NOT state one/i.test(DOCUMENT_INSTRUCTION),
  "unknown page numbers are never invented",
);
assert(
  /NEVER invent text, page numbers, formulas/i.test(DOCUMENT_INSTRUCTION),
  "inventing document content is explicitly forbidden",
);
assert(
  /your own explanation/i.test(DOCUMENT_INSTRUCTION),
  "Ashy's own words are separated from the document's",
);
assert(
  /blurry|illegible/i.test(DOCUMENT_INSTRUCTION),
  "scanned/blurry pages are handled honestly instead of guessed",
);
assert(
  /Bangla/.test(DOCUMENT_INSTRUCTION) && /English/.test(DOCUMENT_INSTRUCTION),
  "Bangla and English content are both supported",
);
assert(
  /LaTeX/.test(DOCUMENT_INSTRUCTION),
  "mathematics is preserved in LaTeX",
);
assert(
  /summary, explanation, revision notes, flashcards or practice questions/i.test(
    DOCUMENT_INSTRUCTION,
  ),
  "summaries, explanations, flashcards and practice questions are covered",
);
assert(
  /Ask about page/.test(DOCUMENT_INSTRUCTION),
  "missing pages route the student to the reader's page selection",
);
assert(
  /never claim you cannot open files/i.test(DOCUMENT_INSTRUCTION),
  "back-compat: Ashy still never claims it cannot open files",
);
assert(
  DOCUMENT_INSTRUCTION !== TRANSCRIPTION_INSTRUCTION,
  "document-answering and transcription modes remain separate instructions",
);

/* -------------------------------------------------------------------------- */
/* 14. Local-only notice — the honest next step for oversized files           */
/* -------------------------------------------------------------------------- */

assert(
  /isn't uploaded|not uploaded|never uploaded/i.test(PDF_LOCAL_ONLY_NOTICE.body),
  "the local-only notice states the file is not uploaded",
);
assert(
  PDF_LOCAL_ONLY_NOTICE.body.includes(String(MAX_SELECTED_PAGES)),
  "the local-only notice names the page-range cap",
);
assert(
  PDF_REJECTION_COPY.tooLarge.includes("60 MB"),
  "the hard-reject copy names the real local ceiling",
);
assert(
  PDF_REJECTION_COPY.tooManyPages.includes("read-only copy"),
  "the page-cap copy points at the read-only reader, a real next step",
);

/* -------------------------------------------------------------------------- */

console.log(`\n${checks} checks, ${failures} failures`);
if (failures > 0) {
  console.error("PDF/Phase-2 tests FAILED");
  process.exit(1);
}
console.log("PDF/Phase-2 tests passed");
