/**
 * ImageCropDialog — crop a worksheet photo down to the question that matters
 * before it ever leaves the device.
 *
 * Flow: attach → preview → drag a selection → Crop → the cropped JPEG is
 * what gets sent to Ashy. Everything happens on a local canvas; nothing is
 * uploaded until the student presses Send.
 *
 * The interaction is deliberately simple and touch-friendly: one drag draws
 * the region (there is no separate resize-handle geometry to fight with on a
 * phone), and the selection can be redrawn as many times as needed.
 */

import {
  useCallback,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Crop, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const ACCEPTED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

/** Raw file size cap before crop/resize (keeps requests well under the API's). */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/** Longest edge of the cropped output — plenty for OCR-style reading. */
const MAX_OUTPUT_EDGE = 1600;

export function isAcceptedImage(file: File): boolean {
  return (ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type);
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

const FULL_RECT: Rect = { x: 0, y: 0, w: 1, h: 1 };

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function ImageCropDialog({
  open,
  src,
  onClose,
  onConfirm,
}: {
  open: boolean;
  src: string | null;
  onClose: () => void;
  /** Receives a cropped, resized `data:image/jpeg;base64,...` URL. */
  onConfirm: (croppedDataUrl: string) => void;
}) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const anchorRef = useRef<{ x: number; y: number } | null>(null);
  const [selection, setSelection] = useState<Rect>(FULL_RECT);
  const [dragging, setDragging] = useState(false);

  // Adjusting state during render (React's documented alternative to doing it
  // in an effect): each time the dialog opens for a new image, the whole
  // image starts selected.
  const imageKey = open ? (src ?? "") : null;
  const [lastImageKey, setLastImageKey] = useState<string | null>(imageKey);
  if (imageKey !== lastImageKey) {
    setLastImageKey(imageKey);
    setSelection(FULL_RECT);
    setDragging(false);
  }

  const pointFromEvent = useCallback((event: ReactPointerEvent) => {
    const frame = frameRef.current;
    if (!frame) return { x: 0, y: 0 };
    const rect = frame.getBoundingClientRect();
    return {
      x: clamp01((event.clientX - rect.left) / Math.max(1, rect.width)),
      y: clamp01((event.clientY - rect.top) / Math.max(1, rect.height)),
    };
  }, []);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!src) return;
    event.preventDefault();
    const point = pointFromEvent(event);
    anchorRef.current = point;
    setDragging(true);
    setSelection({ x: point.x, y: point.y, w: 0, h: 0 });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging || !anchorRef.current) return;
    const point = pointFromEvent(event);
    const anchor = anchorRef.current;
    const next: Rect = {
      x: Math.min(anchor.x, point.x),
      y: Math.min(anchor.y, point.y),
      w: Math.abs(point.x - anchor.x),
      h: Math.abs(point.y - anchor.y),
    };
    setSelection(next);
  };

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    setDragging(false);
    anchorRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      /* pointer already released */
    }
    // A stray tap shouldn't collapse the selection to nothing.
    setSelection((current) =>
      current.w < 0.03 || current.h < 0.03 ? FULL_RECT : current,
    );
  };

  const handleCrop = () => {
    const image = imageRef.current;
    const frame = frameRef.current;
    if (!image || !frame) return;

    const naturalWidth = image.naturalWidth;
    const naturalHeight = image.naturalHeight;
    if (!naturalWidth || !naturalHeight) return;

    const sx = Math.round(selection.x * naturalWidth);
    const sy = Math.round(selection.y * naturalHeight);
    const sw = Math.max(1, Math.round(selection.w * naturalWidth));
    const sh = Math.max(1, Math.round(selection.h * naturalHeight));

    const scale = Math.min(1, MAX_OUTPUT_EDGE / Math.max(sw, sh));
    const outWidth = Math.max(1, Math.round(sw * scale));
    const outHeight = Math.max(1, Math.round(sh * scale));

    const canvas = document.createElement("canvas");
    canvas.width = outWidth;
    canvas.height = outHeight;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, outWidth, outHeight);
    context.drawImage(image, sx, sy, sw, sh, 0, 0, outWidth, outHeight);

    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
    onConfirm(dataUrl);
    onClose();
  };

  const selectionStyle: CSSProperties = {
    left: `${selection.x * 100}%`,
    top: `${selection.y * 100}%`,
    width: `${selection.w * 100}%`,
    height: `${selection.h * 100}%`,
    boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)",
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-3xl gap-4">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Crop className="size-4 text-primary" aria-hidden />
            Crop image
          </DialogTitle>
          <DialogDescription>
            Drag over the part you want Ashy to solve — only the cropped area
            will be sent.
          </DialogDescription>
        </DialogHeader>

        <div className="flex justify-center">
          <div
            ref={frameRef}
            className="relative inline-block max-w-full touch-none overflow-hidden rounded-lg border bg-muted select-none"
            style={{ cursor: "crosshair" }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            {src ? (
              <img
                ref={imageRef}
                src={src}
                alt="Selected attachment preview"
                draggable={false}
                className="block max-h-[55vh] max-w-full"
              />
            ) : null}
            <div
              aria-hidden
              className="pointer-events-none absolute border-2 border-primary"
              style={selectionStyle}
            />
          </div>
        </div>

        <DialogFooter className="flex flex-wrap items-center justify-between gap-2 sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            className="cursor-pointer"
            onClick={() => setSelection(FULL_RECT)}
          >
            <RotateCcw className="size-4" aria-hidden />
            Reset
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="cursor-pointer" onClick={onClose}>
              <X className="size-4" aria-hidden />
              Cancel
            </Button>
            <Button type="button" className="cursor-pointer" onClick={handleCrop}>
              <Crop className="size-4" aria-hidden />
              Crop
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
