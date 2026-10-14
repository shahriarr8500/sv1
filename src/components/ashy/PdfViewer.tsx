/**
 * PdfViewer — the in-app PDF reader (Phase 2).
 *
 * Renders documents with pdfjs-dist (lazy-loaded, so the Ashy route's initial
 * bundle stays small). Students can move page by page, jump to a page number,
 * zoom, fit to width — and, crucially, hand a page or a small page range back
 * to the composer as rendered images ("Ask about page 3"), which is how large
 * documents get answered without ever re-sending the whole file.
 *
 * Everything runs locally in the browser: the document bytes are either the
 * student's own draft (data: URL) or a signed Convex storage URL from their
 * own conversation. Nothing is uploaded from here.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  Loader2,
  Maximize2,
  MessageSquarePlus,
  Plus,
  ZoomOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  formatFileSize,
  pageSelectionLabel,
  parsePageSelection,
  type PageSelection,
} from "@/lib/ashy-attachments";

/** Target render width for "ask about pages" images — crisp but bounded. */
const ASK_RENDER_WIDTH = 1400;
const ASK_JPEG_QUALITY = 0.85;

type PdfjsModule = typeof import("pdfjs-dist");
type PdfDoc = Awaited<ReturnType<PdfjsModule["getDocument"]>["promise"]>;

/** One shared lazy load of pdfjs + its worker across every viewer instance. */
let pdfjsPromise: Promise<PdfjsModule> | null = null;
function loadPdfjs(): Promise<PdfjsModule> {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist").then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.min.mjs",
        import.meta.url,
      ).toString();
      return pdfjs;
    });
  }
  return pdfjsPromise;
}

/** Renders ONE page to a JPEG data URL at ask-resolution. Shared by the
 *  dialog's own "explain" flow and the module-level batch renderer below. */
async function renderPageToJpeg(doc: PdfDoc, pageNumber: number): Promise<string> {
  const pdfPage = await doc.getPage(pageNumber);
  const base = pdfPage.getViewport({ scale: 1 });
  const scale = Math.min(2, ASK_RENDER_WIDTH / base.width);
  const viewport = pdfPage.getViewport({ scale });
  const canvas = window.document.createElement("canvas");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("canvas unavailable");
  const task = pdfPage.render({
    canvasContext: context,
    viewport,
    canvas,
  } as Parameters<typeof pdfPage.render>[0]);
  await task.promise;
  return canvas.toDataURL("image/jpeg", ASK_JPEG_QUALITY);
}

/**
 * Renders a page selection to base64 JPEGs with its OWN document instance —
 * used by Ashy's staged "Summarize entire PDF" flow, which runs after the
 * viewer has closed. One batch is rendered, sent and released before the
 * next, so even a 100-page document never sits in memory at once.
 */
export async function renderPdfPageBatch(
  src: string,
  pages: readonly number[],
  onProgress?: (done: number, total: number) => void,
): Promise<Array<{ mimeType: string; data: string }>> {
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({ url: src });
  try {
    const doc = await task.promise;
    const images: Array<{ mimeType: string; data: string }> = [];
    const total = pages.length;
    for (let i = 0; i < total; i += 1) {
      const dataUrl = await renderPageToJpeg(doc, pages[i]);
      images.push({
        mimeType: "image/jpeg",
        data: dataUrl.slice(dataUrl.indexOf(",") + 1),
      });
      onProgress?.(i + 1, total);
    }
    return images;
  } finally {
    // pdfjs v6: destroying the loading task destroys the document too.
    void task.destroy().catch(() => undefined);
  }
}

export interface PdfViewerProps {
  open: boolean;
  /** A data: URL (local draft) or a signed storage URL (saved message). */
  src: string | null;
  name: string;
  size?: number;
  onClose: () => void;
  /**
   * Called with rendered JPEG images for the selection. The pages are
   * already validated (page order, within the document, within the per-
   * question cap) and each image is under the image size cap. The optional
   * suggested text is ready-to-send draft copy (quick actions like
   * "Explain pages 5–12"); when present, the caller sends it right away.
   */
  onAskPages: (images: string[], label: string, suggestedText?: string) => void;
  /**
   * "Summarize entire PDF" — the caller processes EVERY page in bounded
   * batches (staged section summaries, then one combined summary).
   */
  onSummarizeAll?: (info: { src: string; name: string; numPages: number }) => void;
  readOnly?: boolean;
}

export function PdfViewer({
  open,
  src,
  name,
  size,
  onClose,
  onAskPages,
  onSummarizeAll,
  readOnly = false,
}: PdfViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const docRef = useRef<PdfDoc | null>(null);
  const loadingTaskRef = useRef<ReturnType<
    PdfjsModule["getDocument"]
  > | null>(null);
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null);

  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(1);
  /** Absolute zoom scale; null = fit-to-width (the default). */
  const [zoom, setZoom] = useState<number | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  /** Real progress while rendering selected pages for a question. */
  const [asking, setAsking] = useState<string | null>(null);
  /** Which selection input is showing: a contiguous range or a custom list. */
  const [mode, setMode] = useState<"range" | "list">("range");
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");
  /** Custom selection, e.g. "1, 3, 5-8". */
  const [listInput, setListInput] = useState("");

  /* --- document lifecycle ------------------------------------------------ */

  useEffect(() => {
    if (!open || !src) return;
    let cancelled = false;

    void (async () => {
      // All state resets live inside the async task (never synchronously in
      // the effect body) so opening a document never cascades renders.
      setStatus("loading");
      setError("");
      setPage(1);
      setNumPages(0);
      try {
        const pdfjs = await loadPdfjs();
        const task = pdfjs.getDocument({ url: src });
        loadingTaskRef.current = task;
        const doc = await task.promise;
        if (cancelled) {
          void task.destroy().catch(() => undefined);
          return;
        }
        docRef.current = doc;
        setNumPages(doc.numPages);
        setStatus("ready");
      } catch (reason) {
        if (cancelled) return;
        // Only the failure category reaches state — never file contents.
        console.error(
          "[ashy] pdf open failed",
          reason instanceof Error ? reason.name : "unknown",
        );
        setError(
          "This PDF couldn't be opened. It may be corrupt, password-protected, or too large for this browser.",
        );
        setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
      // Destroying the loading task destroys the document too (pdfjs v6
      // removed PDFDocumentProxy.destroy in favour of task.destroy()).
      const task = loadingTaskRef.current;
      loadingTaskRef.current = null;
      docRef.current = null;
      if (task) void task.destroy().catch(() => undefined);
    };
  }, [open, src]);

  /* --- current-page render ---------------------------------------------- */

  useEffect(() => {
    if (!open || status !== "ready") return;
    const doc = docRef.current;
    const canvas = canvasRef.current;
    const frame = frameRef.current;
    if (!doc || !canvas || !frame) return;
    let cancelled = false;

    void (async () => {
      try {
        renderTaskRef.current?.cancel();
        const pdfPage = await doc.getPage(page);
        if (cancelled) return;
        const base = pdfPage.getViewport({ scale: 1 });
        const scale =
          zoom ??
          Math.min(2, Math.max(0.2, (frame.clientWidth - 24) / base.width));
        const viewport = pdfPage.getViewport({ scale });
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        const context = canvas.getContext("2d");
        if (!context) return;
        context.setTransform(dpr, 0, 0, dpr, 0, 0);
        const task = pdfPage.render({
          canvasContext: context,
          viewport,
          canvas,
        } as Parameters<typeof pdfPage.render>[0]);
        renderTaskRef.current = task;
        await task.promise;
        renderTaskRef.current = null;
      } catch {
        // A cancelled render is normal while navigating quickly.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, status, page, zoom]);

  /* --- helpers ----------------------------------------------------------- */

  const goTo = useCallback(
    (next: number) => {
      setPage(Math.min(Math.max(1, Math.round(next)), Math.max(1, numPages)));
    },
    [numPages],
  );

  /** Renders the selected pages to JPEG data URLs for the question flow. */
  const renderPages = useCallback(
    async (pages: readonly number[]): Promise<string[]> => {
      const doc = docRef.current;
      if (!doc) throw new Error("no document");
      const images: string[] = [];
      for (let i = 0; i < pages.length; i += 1) {
        setAsking(`Reading pages… ${i + 1}/${pages.length}`);
        images.push(await renderPageToJpeg(doc, pages[i]));
      }
      return images;
    },
    [],
  );

  const askAboutPages = useCallback(
    async (pages: readonly number[]) => {
      if (readOnly || asking || pages.length === 0) return;
      setError("");
      try {
        const images = await renderPages(pages);
        const label = pageSelectionLabel(pages, name);
        // Ready-to-send draft: "Explain page 3 of notes.pdf." /
        // "Explain pages 5–12 of notes.pdf."
        const draft = `Explain ${label.charAt(0).toLowerCase()}${label.slice(1)}.`;
        onAskPages(images, label, draft);
      } catch {
        setError("Those pages couldn't be rendered. Try again or pick different pages.");
      } finally {
        setAsking(null);
      }
    },
    [readOnly, asking, name, onAskPages, renderPages],
  );

  const askAboutCurrentPage = useCallback(() => {
    void askAboutPages([page]);
  }, [askAboutPages, page]);

  /**
   * Live validation of the active selection mode — parsed on every render
   * so the label (and any rejection copy) updates as the student types.
   * `error: ""` means nothing entered yet: no label, no complaint.
   */
  const selection: PageSelection = (() => {
    if (mode === "range") {
      const from = rangeFrom.trim();
      const to = rangeTo.trim();
      if (!from && !to) return { ok: false, error: "" };
      if (!from || !to) {
        return {
          ok: false,
          error: "Enter both a start and an end page — e.g. 5 to 12.",
        };
      }
      return parsePageSelection(`${from}-${to}`, numPages);
    }
    if (!listInput.trim()) return { ok: false, error: "" };
    return parsePageSelection(listInput, numPages);
  })();

  /* --- render ------------------------------------------------------------ */

  const zoomPercent = zoom === null ? null : Math.round(zoom * 100);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        className="flex h-[92dvh] max-w-[min(100vw-1rem,72rem)] flex-col gap-2 p-3 sm:p-4"
        aria-busy={status === "loading"}
      >
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex min-w-0 items-center gap-2 text-sm">
            <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="truncate">{name}</span>
            {size !== undefined ? (
              <span className="shrink-0 text-xs font-normal text-muted-foreground">
                {formatFileSize(size)}
                {numPages > 0 ? ` · ${numPages} pages` : ""}
              </span>
            ) : null}
          </DialogTitle>
        </DialogHeader>

        {/* Document frame — the page itself. */}
        <div
          ref={frameRef}
          className={cn(
            "relative flex min-h-0 flex-1 items-start justify-center overflow-auto rounded-lg border bg-muted/40 p-2",
            status === "loading" && "items-center",
          )}
        >
          {status === "loading" ? (
            <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-5 animate-spin" aria-hidden />
              <span>Opening document…</span>
            </div>
          ) : status === "error" ? (
            <div className="flex max-w-md flex-col items-center gap-2 p-6 text-center">
              <FileText className="size-8 text-muted-foreground" aria-hidden />
              <p className="text-sm text-foreground">Couldn't open this PDF</p>
              <p className="text-xs text-muted-foreground">{error}</p>
              <Button variant="outline" size="sm" onClick={onClose}>
                Close
              </Button>
            </div>
          ) : (
            <canvas
              ref={canvasRef}
              className="rounded-md border bg-background shadow-sm"
              aria-label={`Page ${page} of ${numPages}`}
            />
          )}
        </div>

        {status === "ready" && error ? (
          <p className="shrink-0 text-xs text-destructive">{error}</p>
        ) : null}

        {/* Controls: navigation + zoom on top, question actions below. */}
        {status === "ready" ? (
          <>
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="size-8"
                  aria-label="Previous page"
                  disabled={page <= 1}
                  onClick={() => goTo(page - 1)}
                >
                  <ChevronLeft className="size-4" aria-hidden />
                </Button>
                <label className="flex items-center gap-1 text-xs text-muted-foreground">
                  <input
                    type="number"
                    min={1}
                    max={Math.max(1, numPages)}
                    value={page}
                    onChange={(event) => goTo(Number(event.target.value))}
                    className="h-8 w-14 rounded-md border bg-background px-2 text-center text-sm text-foreground"
                    aria-label="Page number"
                  />
                  <span>/ {numPages}</span>
                </label>
                <Button
                  variant="outline"
                  size="icon"
                  className="size-8"
                  aria-label="Next page"
                  disabled={page >= numPages}
                  onClick={() => goTo(page + 1)}
                >
                  <ChevronRight className="size-4" aria-hidden />
                </Button>
              </div>

              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="size-8"
                  aria-label="Zoom out"
                  disabled={zoom !== null && zoom <= 0.3}
                  onClick={() => setZoom(Math.max(0.3, (zoom ?? 1) - 0.25))}
                >
                  <ZoomOut className="size-4" aria-hidden />
                </Button>
                <span className="w-12 text-center text-xs text-muted-foreground">
                  {zoomPercent === null ? "Fit" : `${zoomPercent}%`}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  className="size-8"
                  aria-label="Zoom in"
                  disabled={zoom !== null && zoom >= 3}
                  onClick={() => setZoom(Math.min(3, (zoom ?? 1) + 0.25))}
                >
                  <Plus className="size-4" aria-hidden />
                </Button>
                <Button
                  variant={zoom === null ? "secondary" : "outline"}
                  size="icon"
                  className="size-8"
                  aria-label="Fit to width"
                  title="Fit to width"
                  onClick={() => setZoom(null)}
                >
                  <Maximize2 className="size-4" aria-hidden />
                </Button>
              </div>
            </div>

            {/* Selection + quick actions (Issue 1): total page count, live
                range label, clear validation, and the three actions — explain
                this page, explain the selection, summarize in batches. */}
            <div className="flex shrink-0 flex-col gap-2 border-t pt-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  {numPages} {numPages === 1 ? "page" : "pages"} total
                </span>
                <div
                  className="ml-auto flex items-center gap-0.5 rounded-lg border p-0.5"
                  role="group"
                  aria-label="Selection mode"
                >
                  <Button
                    variant={mode === "range" ? "secondary" : "ghost"}
                    size="sm"
                    className="h-7 cursor-pointer px-2 text-xs"
                    aria-pressed={mode === "range"}
                    onClick={() => setMode("range")}
                  >
                    Range
                  </Button>
                  <Button
                    variant={mode === "list" ? "secondary" : "ghost"}
                    size="sm"
                    className="h-7 cursor-pointer px-2 text-xs"
                    aria-pressed={mode === "list"}
                    onClick={() => setMode("list")}
                  >
                    Custom list
                  </Button>
                </div>
                {mode === "range" ? (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <span>Pages</span>
                    <input
                      type="number"
                      min={1}
                      max={numPages}
                      value={rangeFrom}
                      placeholder="1"
                      onChange={(event) => setRangeFrom(event.target.value)}
                      className="h-8 w-14 rounded-md border bg-background px-2 text-center text-sm text-foreground"
                      aria-label="Range start page"
                    />
                    <span>–</span>
                    <input
                      type="number"
                      min={1}
                      max={numPages}
                      value={rangeTo}
                      placeholder={String(numPages)}
                      onChange={(event) => setRangeTo(event.target.value)}
                      className="h-8 w-14 rounded-md border bg-background px-2 text-center text-sm text-foreground"
                      aria-label="Range end page"
                    />
                  </div>
                ) : (
                  <input
                    type="text"
                    value={listInput}
                    placeholder="1, 3, 5-8"
                    spellCheck={false}
                    onChange={(event) => setListInput(event.target.value)}
                    className="h-8 w-40 rounded-md border bg-background px-2 text-sm text-foreground"
                    aria-label="Custom page list"
                  />
                )}
              </div>

              {/* Live label of what will be attached, or the rejection copy. */}
              {selection.ok ? (
                <p className="text-xs text-foreground">
                  Selected: {pageSelectionLabel(selection.pages, name)} ·{" "}
                  {selection.pages.length} of {numPages} pages
                </p>
              ) : selection.error ? (
                <p className="text-xs text-destructive">{selection.error}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Choose a range, or a custom list like 1, 3, 5-8 — the
                  selection is attached to your question in page order.
                </p>
              )}

              <div className="flex flex-wrap items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 cursor-pointer gap-1.5 text-xs"
                  disabled={readOnly || asking !== null}
                  title={
                    readOnly
                      ? "Read-only while viewing another student's account"
                      : undefined
                  }
                  onClick={askAboutCurrentPage}
                >
                  <MessageSquarePlus className="size-3.5" aria-hidden />
                  Explain this page
                </Button>
                <Button
                  size="sm"
                  className="h-8 cursor-pointer gap-1.5 text-xs"
                  disabled={readOnly || asking !== null || !selection.ok}
                  title={
                    selection.ok
                      ? undefined
                      : selection.error || "Enter a valid page selection first"
                  }
                  onClick={() => {
                    if (selection.ok) void askAboutPages(selection.pages);
                  }}
                >
                  Explain selected pages
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 cursor-pointer gap-1.5 text-xs"
                  disabled={readOnly || asking !== null || !src || !onSummarizeAll}
                  title={`All ${numPages} pages, processed in bounded batches: section summaries first, then one combined summary`}
                  onClick={() => {
                    if (src && onSummarizeAll) {
                      onSummarizeAll({ src, name, numPages });
                    }
                  }}
                >
                  Summarize entire PDF
                </Button>
                {asking ? (
                  <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Loader2 className="size-3.5 animate-spin" aria-hidden />
                    {asking}
                  </span>
                ) : null}
              </div>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
