/**
 * ImageCropDialog — crop a worksheet photo down to the question that matters
 * before it ever leaves the device.
 *
 * Flow: attach → frame the question (drag a selection, zoom, move, rotate) →
 * "Use cropped image" → the cropped JPEG is what gets sent to Ashy. Everything
 * happens on a local canvas; nothing is uploaded until the student presses
 * Send.
 *
 * Coordinate model (why no crop maths had to be reinvented here): the
 * selection is stored as fractions of the image itself. Zoom and pan are pure
 * CSS transforms on the wrapper, and pointer positions are read back from that
 * wrapper's bounding box — which already includes the transform — so the crop
 * maths is the same fractions → pixels conversion it has always been.
 * Rotation is baked into a fresh data URL in 90° steps, so the source stays a
 * plain raster. The project ships no cropping library (checked package.json),
 * so the interaction is built on pointer events: mouse, touch and stylus all
 * follow one code path, and `touch-none` keeps the page from scrolling
 * underneath while framing.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  Camera,
  Crop,
  Move,
  RotateCcw,
  RotateCw,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { toast } from "sonner";
import {
  ACCEPTED_IMAGE_MIME_TYPES,
  MAX_IMAGE_BYTES as SHARED_MAX_IMAGE_BYTES,
} from "@/lib/ashy-attachments";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Attachment types and limits live in one shared, isomorphic module so the
// picker, the composer and the Convex backend can never drift apart.
export { ACCEPTED_IMAGE_MIME_TYPES as ACCEPTED_IMAGE_TYPES } from "@/lib/ashy-attachments";

/** Raw file size cap before crop/resize (keeps requests well under the API's). */
export const MAX_IMAGE_BYTES = SHARED_MAX_IMAGE_BYTES;

/** Longest edge of the cropped output — plenty for OCR-style reading. */
const MAX_OUTPUT_EDGE = 1600;

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

/** On-screen size of a resize handle (counter-scaled while zoomed). */
const HANDLE_SIZE = 16;

export function isAcceptedImage(file: File): boolean {
  return (ACCEPTED_IMAGE_MIME_TYPES as readonly string[]).includes(file.type);
}

/** Reads a File into a `data:` URL (used purely locally, before cropping). */
export function readImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Could not read that image."));
    reader.readAsDataURL(file);
  });
}

/** `data:image/jpeg;base64,....` → bare base64 for the Gemini payload. */
export function stripDataUrlPrefix(dataUrl: string): string {
  const index = dataUrl.indexOf("base64,");
  return index === -1 ? dataUrl : dataUrl.slice(index + "base64,".length);
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Point {
  x: number;
  y: number;
}

type Mode = "select" | "move";

type DragState =
  | { kind: "select"; anchor: Point }
  | { kind: "resize"; anchor: Point }
  | { kind: "move"; startClient: Point; startPan: Point };

const FULL_RECT: Rect = { x: 0, y: 0, w: 1, h: 1 };

const HANDLES = [
  { id: "top left", x: 0, y: 0, anchor: { x: 1, y: 1 }, cursor: "nwse-resize" },
  { id: "top right", x: 1, y: 0, anchor: { x: 0, y: 1 }, cursor: "nesw-resize" },
  { id: "bottom left", x: 0, y: 1, anchor: { x: 1, y: 0 }, cursor: "nesw-resize" },
  { id: "bottom right", x: 1, y: 1, anchor: { x: 0, y: 0 }, cursor: "nwse-resize" },
] as const;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

function normalizeRect(a: Point, b: Point): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(b.x - a.x),
    h: Math.abs(b.y - a.y),
  };
}

/**
 * Bakes a 90° clockwise rotation into a new JPEG data URL. Doing rotation as a
 * one-shot bake (instead of a CSS transform) means the crop maths never has to
 * account for an angle — the selection is always expressed against the raster
 * that is actually on screen.
 */
function rotate90(dataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalHeight;
        canvas.height = image.naturalWidth;
        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error("Canvas unavailable."));
          return;
        }
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.translate(canvas.width / 2, canvas.height / 2);
        context.rotate(Math.PI / 2);
        context.drawImage(
          image,
          -image.naturalWidth / 2,
          -image.naturalHeight / 2,
        );
        resolve(canvas.toDataURL("image/jpeg", 0.92));
      } catch (error) {
        reject(error);
      }
    };
    image.onerror = () => reject(new Error("Could not decode that image."));
    image.src = dataUrl;
  });
}

export function ImageCropDialog({
  open,
  src,
  onClose,
  onConfirm,
  onRetake,
}: {
  open: boolean;
  src: string | null;
  onClose: () => void;
  /** Receives a cropped, resized `data:image/jpeg;base64,...` URL. */
  onConfirm: (croppedDataUrl: string) => void;
  /**
   * Optional — when the image came from the camera, offers a "Retake" button
   * that sends the student back to the camera to shoot it again.
   */
  onRetake?: () => void;
}) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const dragRef = useRef<DragState | null>(null);

  const [workingSrc, setWorkingSrc] = useState<string | null>(null);
  const [imageReady, setImageReady] = useState(false);
  /** Natural pixel size of the working image — sizes the live preview box. */
  const [naturalSize, setNaturalSize] = useState<{
    w: number;
    h: number;
  } | null>(null);
  const [selection, setSelection] = useState<Rect>(FULL_RECT);
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [mode, setMode] = useState<Mode>("select");
  const [rotating, setRotating] = useState(false);

  // Adjusting state during render (React's documented alternative to doing it
  // in an effect): each time the dialog opens for a new image, everything
  // starts fresh — whole image selected, no zoom, no pan, no rotation.
  const imageKey = open ? (src ?? "") : null;
  const [lastImageKey, setLastImageKey] = useState<string | null>(imageKey);
  if (imageKey !== lastImageKey) {
    setLastImageKey(imageKey);
    setWorkingSrc(imageKey || null);
    setImageReady(false);
    setNaturalSize(null);
    setSelection(FULL_RECT);
    setZoom(MIN_ZOOM);
    setPan({ x: 0, y: 0 });
    setMode("select");
  }

  // A drag never survives the dialog: drop any in-flight gesture when it
  // closes (refs must only be touched outside of render).
  useEffect(() => {
    if (!open) dragRef.current = null;
  }, [open]);

  /** Fraction of the (transformed) image under the pointer. */
  const pointFromEvent = useCallback((event: ReactPointerEvent) => {
    const content = contentRef.current;
    if (!content) return { x: 0, y: 0 };
    // getBoundingClientRect includes the zoom/pan transform, so the fraction
    // it yields is a fraction of the image itself.
    const rect = content.getBoundingClientRect();
    return {
      x: clamp01((event.clientX - rect.left) / Math.max(1, rect.width)),
      y: clamp01((event.clientY - rect.top) / Math.max(1, rect.height)),
    };
  }, []);

  /** Keeps the zoomed image covering the frame instead of being dragged out. */
  const clampPan = useCallback((next: Point, currentZoom: number): Point => {
    const content = contentRef.current;
    if (!content) return { x: 0, y: 0 };
    const maxX = Math.max(
      0,
      (content.offsetWidth * (currentZoom - 1)) / 2,
    );
    const maxY = Math.max(
      0,
      (content.offsetHeight * (currentZoom - 1)) / 2,
    );
    return {
      x: Math.min(maxX, Math.max(-maxX, next.x)),
      y: Math.min(maxY, Math.max(-maxY, next.y)),
    };
  }, []);

  const applyZoom = useCallback(
    (nextZoom: number) => {
      const clamped = clampZoom(nextZoom);
      setZoom(clamped);
      setPan((current) => clampPan(current, clamped));
      // At 1× there is nothing to move, so fall back to selecting.
      if (clamped <= MIN_ZOOM) setMode("select");
    },
    [clampPan, setMode],
  );

  /* --- pointer interaction --------------------------------------------- */

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!workingSrc || !imageReady) return;
    event.preventDefault();
    if (mode === "move") {
      dragRef.current = {
        kind: "move",
        startClient: { x: event.clientX, y: event.clientY },
        startPan: pan,
      };
    } else {
      const point = pointFromEvent(event);
      dragRef.current = { kind: "select", anchor: point };
      setSelection({ x: point.x, y: point.y, w: 0, h: 0 });
    }
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    if (drag.kind === "move") {
      setPan(
        clampPan(
          {
            x: drag.startPan.x + (event.clientX - drag.startClient.x),
            y: drag.startPan.y + (event.clientY - drag.startClient.y),
          },
          zoom,
        ),
      );
      return;
    }
    setSelection(normalizeRect(drag.anchor, pointFromEvent(event)));
  };

  const handlePointerEnd = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    // A stray tap shouldn't collapse the selection to nothing.
    if (drag?.kind === "select") {
      setSelection((current) =>
        current.w < 0.03 || current.h < 0.03 ? FULL_RECT : current,
      );
    }
  };

  const startResize = (
    anchor: Point,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    if (!workingSrc || !imageReady) return;
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = { kind: "resize", anchor };
    frameRef.current?.setPointerCapture(event.pointerId);
  };

  /* --- toolbar actions -------------------------------------------------- */

  const handleRotate = async () => {
    if (!workingSrc || rotating) return;
    setRotating(true);
    try {
      setWorkingSrc(await rotate90(workingSrc));
      setImageReady(false);
      setNaturalSize(null); // repopulated by the <img> onLoad below
      setSelection(FULL_RECT);
      setZoom(MIN_ZOOM);
      setPan({ x: 0, y: 0 });
      setMode("select");
    } catch (error) {
      // TEMP DIAGNOSTIC — no image data, just the reason.
      console.error(
        "[ashy-diag] crop: rotate failed",
        error instanceof Error ? error.message : "unknown",
      );
      toast("Couldn't rotate that image", {
        description: "You can still crop it as it is.",
      });
    } finally {
      setRotating(false);
    }
  };

  const handleReset = () => {
    setWorkingSrc(src); // undo any rotation bake
    setImageReady(false);
    setNaturalSize(null);
    setSelection(FULL_RECT);
    setZoom(MIN_ZOOM);
    setPan({ x: 0, y: 0 });
    setMode("select");
  };

  const handleConfirm = () => {
    const image = imageRef.current;
    if (!image || !workingSrc) return;
    if (!imageReady) {
      toast("That image is still loading", {
        description: "Give it a moment, then press Use cropped image again.",
      });
      return;
    }

    const naturalWidth = image.naturalWidth;
    const naturalHeight = image.naturalHeight;
    if (!naturalWidth || !naturalHeight) {
      toast("Couldn't crop that image", {
        description: "Please pick the photo again.",
      });
      return;
    }

    const rect =
      selection.w > 0.01 && selection.h > 0.01 ? selection : FULL_RECT;
    const sx = Math.min(
      naturalWidth - 1,
      Math.max(0, Math.round(rect.x * naturalWidth)),
    );
    const sy = Math.min(
      naturalHeight - 1,
      Math.max(0, Math.round(rect.y * naturalHeight)),
    );
    const sw = Math.max(
      1,
      Math.min(naturalWidth - sx, Math.round(rect.w * naturalWidth)),
    );
    const sh = Math.max(
      1,
      Math.min(naturalHeight - sy, Math.round(rect.h * naturalHeight)),
    );

    const scale = Math.min(1, MAX_OUTPUT_EDGE / Math.max(sw, sh));
    const outWidth = Math.max(1, Math.round(sw * scale));
    const outHeight = Math.max(1, Math.round(sh * scale));

    try {
      const canvas = document.createElement("canvas");
      canvas.width = outWidth;
      canvas.height = outHeight;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas unavailable.");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, outWidth, outHeight);
      context.drawImage(image, sx, sy, sw, sh, 0, 0, outWidth, outHeight);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
      onConfirm(dataUrl);
      onClose();
    } catch (error) {
      // Encoding failed (e.g. an unusually large canvas). The selection and
      // the image stay exactly where they are so the student can retry.
      // TEMP DIAGNOSTIC — canvas/encode reason only, never pixel data.
      console.error(
        "[ashy-diag] crop/encode failed",
        error instanceof Error ? error.message : "unknown",
      );
      toast("Couldn't crop that image", {
        description:
          "Your selection is still here — try again, or reset and pick a smaller area.",
      });
    }
  };

  /* --- rendering -------------------------------------------------------- */

  const selectionStyle: CSSProperties = {
    left: `${selection.x * 100}%`,
    top: `${selection.y * 100}%`,
    width: `${selection.w * 100}%`,
    height: `${selection.h * 100}%`,
    borderWidth: `${2 / zoom}px`,
    boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)",
  };

  const handleSize = `${HANDLE_SIZE / zoom}px`;
  const showHandles = mode === "select" && imageReady;

  /* --- live preview of the exact cropped region -------------------------- */
  // The selection is a fraction of the image, so the preview box gets the
  // selection's pixel aspect ratio and the image is laid inside it at
  // 1/selection scale — the box then shows precisely what will be exported.
  const previewW = Math.max(selection.w, 1e-4);
  const previewH = Math.max(selection.h, 1e-4);
  const previewAspect =
    naturalSize && naturalSize.w > 0 && naturalSize.h > 0
      ? (previewW * naturalSize.w) / (previewH * naturalSize.h)
      : null;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-3xl gap-4">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Crop className="size-4 text-primary" aria-hidden />
            Crop image
          </DialogTitle>
          <DialogDescription>
            Drag over the part you want Ashy to solve. Zoom, move or rotate to
            frame it — only the crop inside the border is sent.
          </DialogDescription>
        </DialogHeader>

        <div className="flex justify-center">
          <div
            ref={frameRef}
            className="relative inline-block max-w-full touch-none overflow-hidden rounded-lg border bg-muted select-none"
            style={{ cursor: mode === "move" ? "grab" : "crosshair" }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerEnd}
            onPointerCancel={handlePointerEnd}
          >
            <div
              ref={contentRef}
              className="relative"
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: "center center",
              }}
            >
              {workingSrc ? (
                <img
                  ref={imageRef}
                  src={workingSrc}
                  alt="Selected attachment preview"
                  draggable={false}
                  className="block max-h-[55vh] max-w-full"
                  onLoad={(event) => {
                    setImageReady(true);
                    const image = event.currentTarget;
                    setNaturalSize({
                      w: image.naturalWidth,
                      h: image.naturalHeight,
                    });
                  }}
                  onError={() => {
                    // TEMP DIAGNOSTIC — decode failure of the data URL.
                    console.error("[ashy-diag] crop: image failed to decode");
                    setImageReady(false);
                    toast("Couldn't load that image", {
                      description: "Please pick a different file.",
                    });
                  }}
                />
              ) : null}
              <div
                aria-hidden
                className="pointer-events-none absolute border-2 border-primary"
                style={selectionStyle}
              />
              {showHandles
                ? HANDLES.map((handle) => (
                    <button
                      key={handle.id}
                      type="button"
                      aria-label={`Resize crop area from the ${handle.id} corner`}
                      className="absolute rounded-full border-2 border-primary bg-background shadow focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      style={{
                        left: `${(selection.x + handle.x * selection.w) * 100}%`,
                        top: `${(selection.y + handle.y * selection.h) * 100}%`,
                        width: handleSize,
                        height: handleSize,
                        transform: "translate(-50%, -50%)",
                        cursor: handle.cursor,
                        touchAction: "none",
                      }}
                      onPointerDown={(event) =>
                        startResize(handle.anchor, event)
                      }
                    />
                  ))
                : null}
            </div>
          </div>
        </div>

        {/* Framing tools: mode toggle, zoom, rotate, reset */}
        <div className="flex flex-wrap items-center justify-center gap-2">
          <div className="flex overflow-hidden rounded-md border" role="group" aria-label="Drag behaviour">
            <Button
              type="button"
              size="sm"
              variant={mode === "select" ? "secondary" : "ghost"}
              aria-pressed={mode === "select"}
              className="cursor-pointer rounded-none"
              onClick={() => setMode("select")}
            >
              <Crop className="size-3.5" aria-hidden />
              Select
            </Button>
            <Button
              type="button"
              size="sm"
              variant={mode === "move" ? "secondary" : "ghost"}
              aria-pressed={mode === "move"}
              disabled={zoom <= MIN_ZOOM}
              className="cursor-pointer rounded-none"
              onClick={() => setMode("move")}
            >
              <Move className="size-3.5" aria-hidden />
              Move
            </Button>
          </div>

          <div className="flex items-center gap-1 rounded-md border px-1.5 py-1">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label="Zoom out"
              title="Zoom out"
              disabled={zoom <= MIN_ZOOM}
              className="size-7 cursor-pointer"
              onClick={() => applyZoom(zoom - 0.25)}
            >
              <ZoomOut className="size-4" aria-hidden />
            </Button>
            <input
              type="range"
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              step={0.05}
              value={zoom}
              aria-label="Zoom level"
              className="w-24 cursor-pointer accent-primary sm:w-32"
              onChange={(event) => applyZoom(Number(event.target.value))}
            />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label="Zoom in"
              title="Zoom in"
              disabled={zoom >= MAX_ZOOM}
              className="size-7 cursor-pointer"
              onClick={() => applyZoom(zoom + 0.25)}
            >
              <ZoomIn className="size-4" aria-hidden />
            </Button>
          </div>

          <Button
            type="button"
            size="sm"
            variant="outline"
            className="cursor-pointer"
            disabled={!workingSrc || rotating}
            onClick={() => void handleRotate()}
          >
            <RotateCw className="size-3.5" aria-hidden />
            Rotate
          </Button>

          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="cursor-pointer"
            disabled={!workingSrc}
            onClick={handleReset}
          >
            <RotateCcw className="size-3.5" aria-hidden />
            Reset
          </Button>
        </div>

        <DialogFooter className="flex flex-wrap items-center justify-between gap-2 sm:justify-between">
          <p className="text-xs text-muted-foreground">
            {mode === "move"
              ? "Drag the image to reposition it."
              : "Drag to select, or pull a corner to resize."}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              className="cursor-pointer"
              onClick={onClose}
            >
              <X className="size-4" aria-hidden />
              Cancel
            </Button>
            {onRetake ? (
              <Button
                type="button"
                variant="outline"
                className="cursor-pointer"
                onClick={onRetake}
              >
                <Camera className="size-4" aria-hidden />
                Retake
              </Button>
            ) : null}

            {/* Live preview of exactly the region that gets exported. */}
            <div className="flex items-center gap-2 rounded-md border bg-muted/50 px-2 py-1.5">
              <span className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                Preview
              </span>
              <div
                className="relative overflow-hidden rounded border bg-muted"
                style={{
                  width: "4.5rem",
                  aspectRatio: previewAspect ? `${previewAspect}` : "4 / 3",
                }}
              >
                {workingSrc && previewAspect ? (
                  <img
                    src={workingSrc}
                    alt="Live preview of the cropped area"
                    className="absolute max-w-none"
                    style={{
                      width: `${100 / previewW}%`,
                      height: `${100 / previewH}%`,
                      left: `${(-selection.x / previewW) * 100}%`,
                      top: `${(-selection.y / previewH) * 100}%`,
                    }}
                  />
                ) : null}
              </div>
            </div>

            <Button
              type="button"
              className="cursor-pointer"
              disabled={!imageReady}
              onClick={handleConfirm}
            >
              <Crop className="size-4" aria-hidden />
              Use cropped image
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
