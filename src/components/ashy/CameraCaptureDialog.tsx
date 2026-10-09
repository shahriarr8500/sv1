/**
 * CameraCaptureDialog — the desktop/laptop half of Ashy's "Take photo".
 *
 * On touch devices the paperclip's "Take photo" item uses the plain
 * `<input capture>` instead (see Ashy.tsx); this modal is what opens when
 * there is no capture-input path, e.g. a laptop or desktop browser. It only
 * ever opens from an explicit student tap — never automatically.
 *
 * Safety contract enforced here:
 *  - Every MediaStream track is stopped on capture, cancel, dialog close and
 *    unmount, so the camera light always turns off.
 *  - Failures surface as friendly toasts plus a persistent gallery fallback;
 *    the [ashy-diag] lines log the error *name* only — never frames, data or keys.
 *  - Captured frames are scaled to a ~1600px long edge at JPEG quality 0.9 so
 *    the payload that reaches the crop dialog (and then the backend) stays small.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Images, RefreshCw, SwitchCamera, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** Longest edge of a captured frame — matches the crop dialog's output cap. */
const MAX_CAPTURE_EDGE = 1600;
const CAPTURE_QUALITY = 0.9;

type CameraProblem = "unsupported" | "permission" | "none" | "inuse";

const PROBLEM_COPY: Record<
  CameraProblem,
  { title: string; description: string }
> = {
  unsupported: {
    title: "Camera isn't available here",
    description:
      "Camera access needs a secure (HTTPS) page and a browser that supports it. Choose from your gallery instead.",
  },
  permission: {
    title: "Camera access blocked",
    description:
      "Allow camera access in your browser settings, or use Choose from gallery.",
  },
  none: {
    title: "No camera found",
    description:
      "This device doesn't seem to have a camera. You can choose an image from your gallery instead.",
  },
  inuse: {
    title: "Camera is unavailable",
    description:
      "Your camera is being used by another app. Close it and try again, or choose from your gallery.",
  },
};

/** Maps a getUserMedia error onto one of the friendly problems above. */
function problemFor(error: unknown): CameraProblem {
  const name = error instanceof Error ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "permission";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "none";
  }
  if (
    name === "NotReadableError" ||
    name === "TrackStartError" ||
    name === "AbortError"
  ) {
    return "inuse";
  }
  // Anything else (including missing getUserMedia) → unsupported/HTTPS copy.
  return "unsupported";
}

export function CameraCaptureDialog({
  open,
  onClose,
  onCapture,
  onChooseFromGallery,
}: {
  open: boolean;
  /** Student pressed Cancel (or dismissed the dialog). */
  onClose: () => void;
  /** Receives a JPEG `File`, already scaled to a ~1600px long edge. */
  onCapture: (file: File) => void;
  /** Gallery fallback offered from every error state. */
  onChooseFromGallery: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [problem, setProblem] = useState<CameraProblem | null>(null);
  const [starting, setStarting] = useState(false);
  const [videoInputs, setVideoInputs] = useState<MediaDeviceInfo[]>([]);
  /** Selected camera (null → let `facingMode: environment` pick one). */
  const [deviceId, setDeviceId] = useState<string | null>(null);
  /** Bumped by a failed capture so the stream restarts for another try. */
  const [attempt, setAttempt] = useState(0);

  // Adjusting state during render (React's documented alternative to doing it
  // inside an effect): each time the dialog opens or retries, the error state
  // clears and the "starting" hint shows until the stream resolves.
  const startKey = `${open}:${deviceId ?? "default"}:${attempt}`;
  const [lastStartKey, setLastStartKey] = useState(startKey);
  if (startKey !== lastStartKey) {
    setLastStartKey(startKey);
    if (open) {
      setProblem(null);
      setStarting(true);
    }
  }

  /** Stops every track — the camera light must go off on every exit path. */
  const stopStream = useCallback(() => {
    const stream = streamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    const video = videoRef.current;
    if (video) video.srcObject = null;
  }, []);

  // Open → request the camera; close/unmount → stop everything.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    const fail = (kind: CameraProblem, errorName: string) => {
      if (cancelled) return;
      // Release the camera first — an error state must never leave the light on.
      stopStream();
      // TEMP DIAGNOSTIC — error name only, never media or payloads.
      console.error(`[ashy-diag] camera failed: ${errorName}`);
      setProblem(kind);
      const copy = PROBLEM_COPY[kind];
      toast(copy.title, { description: copy.description });
    };

    void (async () => {
      if (
        typeof navigator === "undefined" ||
        !navigator.mediaDevices?.getUserMedia ||
        (typeof window !== "undefined" && window.isSecureContext === false)
      ) {
        fail("unsupported", "getUserMedia-unavailable");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: deviceId
            ? { deviceId: { exact: deviceId } }
            : { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (cancelled) {
          // Dialog closed while the request was in flight — release right away.
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          try {
            await video.play();
          } catch {
            /* autoplay hint already satisfied by the muted/playsInline attrs */
          }
        }
        // Device labels/ids only become visible once permission is granted.
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (!cancelled) {
          const inputs = devices.filter((d) => d.kind === "videoinput");
          setVideoInputs(inputs);
        }
      } catch (error) {
        fail(
          problemFor(error),
          error instanceof Error ? error.name : "UnknownError",
        );
      } finally {
        if (!cancelled) setStarting(false);
      }
    })();

    return () => {
      cancelled = true;
      stopStream();
    };
    // `videoInputs` is deliberately not a dependency: it is refreshed *by*
    // this effect, and listing it here would restart the camera on every
    // successful enumeration (an endless start/stop loop).
  }, [open, deviceId, attempt, stopStream]);

  // Belt and braces: unmount never leaves a live track behind.
  useEffect(() => stopStream, [stopStream]);

  /** Draws the current frame to a canvas and hands back a resized JPEG File. */
  const handleCapture = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      toast("Camera isn't ready yet", {
        description: "Give it a moment, then try Capture again.",
      });
      return;
    }
    const scale = Math.min(
      1,
      MAX_CAPTURE_EDGE / Math.max(video.videoWidth, video.videoHeight),
    );
    const width = Math.max(1, Math.round(video.videoWidth * scale));
    const height = Math.max(1, Math.round(video.videoHeight * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      console.error("[ashy-diag] camera failed: canvas-unavailable");
      toast(PROBLEM_COPY.unsupported.title, {
        description: PROBLEM_COPY.unsupported.description,
      });
      return;
    }
    context.drawImage(video, 0, 0, width, height);

    // Stop the camera *before* encoding so the light is off immediately.
    stopStream();

    canvas.toBlob((blob) => {
      if (!blob) {
        // TEMP DIAGNOSTIC — encode failure only.
        console.error("[ashy-diag] camera failed: encode-blob-null");
        toast("Couldn't capture that photo", {
          description: "Try again, or choose a photo from your gallery.",
        });
        setAttempt((current) => current + 1); // restart the stream
        return;
      }
      onCapture(
        new File([blob], `ashy-photo-${Date.now()}.jpg`, {
          type: "image/jpeg",
        }),
      );
    }, "image/jpeg", CAPTURE_QUALITY);
  };

  /** Cycles to the next camera, if the device actually has more than one. */
  const handleSwitch = () => {
    if (videoInputs.length < 2) return;
    const current = videoInputs.findIndex((d) => d.deviceId === deviceId);
    const next = videoInputs[(current + 1) % videoInputs.length];
    setDeviceId(next?.deviceId ?? null);
  };

  const handleCancel = () => {
    stopStream();
    onClose();
  };

  const problemCopy = problem ? PROBLEM_COPY[problem] : null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) handleCancel();
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="size-4 text-primary" aria-hidden />
            Take photo
          </DialogTitle>
          <DialogDescription>
            Line up your question in the frame, then press Capture. Only the
            cropped area is ever sent to Ashy.
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-hidden rounded-lg border bg-muted">
          {problem ? (
            <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
              <span
                aria-hidden
                className="grid size-11 place-items-center rounded-full bg-destructive/10 text-destructive"
              >
                <X className="size-5" />
              </span>
              <p className="text-sm font-semibold">{problemCopy?.title}</p>
              <p className="max-w-xs text-xs text-muted-foreground">
                {problemCopy?.description}
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="cursor-pointer"
                onClick={() => {
                  stopStream();
                  onChooseFromGallery();
                }}
              >
                <Images className="size-3.5" aria-hidden />
                Choose from gallery
              </Button>
            </div>
          ) : (
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              aria-label="Camera preview"
              className="block aspect-[4/3] w-full bg-black object-cover"
            />
          )}
        </div>

        {starting && !problem ? (
          <p className="text-center text-xs text-muted-foreground">
            Starting camera…
          </p>
        ) : null}

        <DialogFooter className="flex flex-wrap items-center justify-between gap-2 sm:justify-between">
          <p className="text-xs text-muted-foreground">
            Nothing is uploaded until you press Send.
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="cursor-pointer"
              onClick={handleCancel}
            >
              <X className="size-4" aria-hidden />
              Cancel
            </Button>
            {videoInputs.length > 1 && !problem ? (
              <Button
                type="button"
                variant="outline"
                className="cursor-pointer"
                aria-label="Switch camera"
                title="Switch camera"
                onClick={handleSwitch}
              >
                <SwitchCamera className="size-4" aria-hidden />
                Switch camera
              </Button>
            ) : null}
            {!problem ? (
              <Button
                type="button"
                className="cursor-pointer"
                onClick={handleCapture}
              >
                <Camera className="size-4" aria-hidden />
                Capture
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="cursor-pointer"
                onClick={() => setAttempt((current) => current + 1)}
              >
                <RefreshCw className="size-4" aria-hidden />
                Try again
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
