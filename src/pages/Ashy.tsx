/**
 * Ashy — the Student OS study assistant.
 *
 * A full-page chat built on the server-side Gemini action (`convex/ashy.ts`),
 * so the API key never reaches the browser. The page keeps V1 deliberately
 * simple: conversations live in this session (New chat starts a fresh one
 * without discarding the others), and every failure surfaces as a friendly
 * message with Retry instead of raw provider errors.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAction } from "convex/react";
import { Link, useSearchParams } from "react-router";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowUp,
  Check,
  Copy,
  Crop,
  History,
  ImagePlus,
  Mic,
  Paperclip,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
  Square,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";
import { MessageContent } from "@/components/ashy/MessageContent";
import {
  ImageCropDialog,
  MAX_IMAGE_BYTES,
  isAcceptedImage,
  readImageFile,
  stripDataUrlPrefix,
} from "@/components/ashy/ImageCropDialog";
import {
  ASHY_FAILURE_COPY,
  ASHY_STARTERS,
  type AshyConversation,
  type AshyMessage,
  buildHistory,
  createDictation,
  newId,
  speakText,
  speechInputSupported,
  speechOutputSupported,
  stopSpeaking,
} from "@/lib/ashy";

function emptyConversation(): AshyConversation {
  return { id: newId(), title: "New chat", messages: [] };
}

function titleFrom(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "New chat";
  return clean.length > 42 ? `${clean.slice(0, 42)}…` : clean;
}

/* -------------------------------------------------------------------------- */
/* Pieces                                                                      */
/* -------------------------------------------------------------------------- */

function ThinkingIndicator() {
  return (
    <li className="flex items-center gap-3">
      <span
        aria-hidden
        className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"
      >
        <Sparkles className="size-4" />
      </span>
      <span className="flex items-center gap-1.5 rounded-lg border bg-card px-3 py-2 text-sm text-muted-foreground">
        Ashy is thinking
        <span className="flex gap-1">
          {[0, 1, 2].map((index) => (
            <span
              key={index}
              className="size-1.5 animate-bounce rounded-full bg-primary/60"
              style={{ animationDelay: `${index * 0.15}s` }}
            />
          ))}
        </span>
      </span>
    </li>
  );
}

function WelcomeScreen({ onPick }: { onPick: (prompt: string) => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-4 py-8 text-center">
      <span
        aria-hidden
        className="grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary"
      >
        <Sparkles className="size-7" />
      </span>
      <h2 className="mt-4 text-2xl font-bold tracking-tight">Ashy</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Your Student OS study assistant.
      </p>
      <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted-foreground">
        Ask questions. Upload problems. Understand difficult concepts. Study
        smarter.
      </p>

      <p className="mt-8 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
        Try asking
      </p>
      <div className="mt-3 grid w-full max-w-md gap-2 sm:grid-cols-2">
        {ASHY_STARTERS.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => onPick(prompt)}
            className="cursor-pointer rounded-lg border bg-card px-3 py-2.5 text-left text-sm transition-colors hover:border-primary/40 hover:bg-accent/50"
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Page                                                                        */
/* -------------------------------------------------------------------------- */

export default function AshyPage() {
  const [searchParams] = useSearchParams();
  const rawContext = searchParams.get("context") ?? "";
  const [contextDismissed, setContextDismissed] = useState(false);
  const context =
    rawContext && !contextDismissed ? rawContext.trim() : undefined;

  const [conversations, setConversations] = useState<AshyConversation[]>([
    emptyConversation(),
  ]);
  const [activeId, setActiveId] = useState<string>(() => conversations[0].id);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  /** Toggles the pending-attachment thumbnail between compact and enlarged. */
  const [previewLarge, setPreviewLarge] = useState(false);

  const chatAction = useAction(api.ashy.chat);
  const requestIdRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const dictationRef = useRef<ReturnType<typeof createDictation> | null>(null);
  const draftBeforeVoiceRef = useRef("");

  const active = useMemo(
    () => conversations.find((conversation) => conversation.id === activeId),
    [conversations, activeId],
  );
  const messages = active?.messages ?? [];
  const canSpeak = speechOutputSupported();
  const canDictate = speechInputSupported();

  /* --- conversation mutations ------------------------------------------- */

  const mutate = useCallback(
    (conversationId: string, updater: (messages: AshyMessage[]) => AshyMessage[]) => {
      setConversations((previous) =>
        previous.map((conversation) =>
          conversation.id === conversationId
            ? { ...conversation, messages: updater(conversation.messages) }
            : conversation,
        ),
      );
    },
    [],
  );

  const startNewChat = useCallback(() => {
    requestIdRef.current += 1; // orphan any in-flight request
    setBusy(false);
    const conversation = emptyConversation();
    setConversations((previous) => [conversation, ...previous]);
    setActiveId(conversation.id);
    setDraft("");
    setPendingImage(null);
  }, []);

  /* --- the request ------------------------------------------------------- */

  const requestReply = useCallback(
    async (
      conversationId: string,
      historyMessages: AshyMessage[],
      contextText: string | undefined,
    ) => {
      const myRequest = requestIdRef.current + 1;
      requestIdRef.current = myRequest;
      setBusy(true);
      try {
        const result = await chatAction({
          history: buildHistory(historyMessages),
          context: contextText,
        });
        if (requestIdRef.current !== myRequest) return; // stopped or superseded
        if (result.ok) {
          mutate(conversationId, (previous) => [
            ...previous,
            { id: newId(), role: "assistant", text: result.text },
          ]);
        } else {
          // TEMP DIAGNOSTIC — backend failure kind only (never message/image data).
          console.error(`[ashy-diag] backend returned failure kind=${result.kind}`);
          mutate(conversationId, (previous) => [
            ...previous,
            {
              id: newId(),
              role: "assistant",
              text: "",
              error: result.kind,
            },
          ]);
        }
      } catch (error) {
        // TEMP DIAGNOSTIC — network/Convex failure (truncated, no payloads).
        console.error(
          "[ashy-diag] network/action failed:",
          String(error).slice(0, 200),
        );
        if (requestIdRef.current !== myRequest) return;
        mutate(conversationId, (previous) => [
          ...previous,
          {
            id: newId(),
            role: "assistant",
            text: "",
            error: "unavailable",
          },
        ]);
      } finally {
        if (requestIdRef.current === myRequest) setBusy(false);
      }
    },
    [chatAction, mutate],
  );

  const sendMessage = useCallback(async () => {
    if (busy) return;
    const text = draft.trim();
    const image = pendingImage
      ? { mimeType: "image/jpeg", data: stripDataUrlPrefix(pendingImage) }
      : null;
    if (!text && !image) {
      toast("Nothing to send yet", {
        description: "Type a question or attach an image first.",
      });
      return;
    }

    const conversationId = activeId;
    const userMessage: AshyMessage = {
      id: newId(),
      role: "user",
      text,
      images: image ? [image] : undefined,
    };

    setConversations((previous) =>
      previous.map((conversation) =>
        conversation.id === conversationId
          ? {
              ...conversation,
              title:
                conversation.title === "New chat" && text
                  ? titleFrom(text)
                  : conversation.title,
              messages: [...conversation.messages, userMessage],
            }
          : conversation,
      ),
    );
    setDraft("");
    setPendingImage(null);
    setPreviewLarge(false);
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    const historyForRequest = [...messages, userMessage];
    await requestReply(conversationId, historyForRequest, context);
  }, [
    busy,
    draft,
    pendingImage,
    activeId,
    messages,
    requestReply,
    context,
  ]);

  const stopGenerating = useCallback(() => {
    requestIdRef.current += 1;
    setBusy(false);
  }, []);

  const regenerate = useCallback(() => {
    if (busy || messages.length === 0) return;
    const last = messages[messages.length - 1];
    if (last.role !== "assistant") return;
    const withoutLast = messages.slice(0, -1);
    mutate(activeId, () => withoutLast);
    void requestReply(activeId, withoutLast, context);
  }, [busy, messages, mutate, activeId, requestReply, context]);

  /* --- image attach + crop ---------------------------------------------- */

  /**
   * Opens the device image picker. The input's value is cleared first so that
   * re-picking the same file (or cancelling and retrying) always fires a
   * `change` event. Nothing ever opens the picker on its own.
   */
  const openFilePicker = useCallback(() => {
    const input = fileInputRef.current;
    if (!input) return;
    input.value = "";
    input.click();
  }, []);

  const handleFile = useCallback(async (file: File | undefined) => {
    if (!file) return; // student cancelled the picker — nothing to do
    if (!isAcceptedImage(file)) {
      // TEMP DIAGNOSTIC (no file contents, just type/size) — remove after verifying live.
      console.error(`[ashy-diag] picker: unsupported type "${file.type}"`);
      toast("Unsupported image", {
        description:
          "Please use a PNG, JPEG, or WebP image. HEIC/HEIF isn't supported by this browser's image tools.",
      });
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      console.error(`[ashy-diag] picker: file too large (${file.size} bytes)`);
      toast("Image too large", {
        description: "Please choose an image under 8 MB.",
      });
      return;
    }
    try {
      const dataUrl = await readImageFile(file);
      setPreviewLarge(false);
      setCropSrc(dataUrl);
      setCropOpen(true);
    } catch (error) {
      console.error(
        "[ashy-diag] picker: could not read file",
        error instanceof Error ? error.message : "unknown",
      );
      toast("Couldn't read that image", { description: "Please try another file." });
    }
  }, []);

  /* --- voice ------------------------------------------------------------- */

  const toggleListening = useCallback(() => {
    if (listening) {
      dictationRef.current?.stop();
      return;
    }
    const dictation = createDictation({
      onPartial: (partial) => {
        const base = draftBeforeVoiceRef.current;
        setDraft(base ? `${base} ${partial}`.trimStart() : partial);
      },
      onFinished: (finished) => {
        setListening(false);
        dictationRef.current = null;
        setDraft(() => {
          const base = draftBeforeVoiceRef.current;
          return base ? `${base} ${finished}`.trimStart() : finished;
        });
      },
      onStopped: () => {
        setListening(false);
        dictationRef.current = null;
      },
    });
    if (!dictation) {
      toast("Voice input isn't supported in this browser.");
      return;
    }
    draftBeforeVoiceRef.current = draft.trim();
    setListening(true);
    dictationRef.current = dictation;
    dictation.start();
  }, [listening, draft]);

  /* --- effects ----------------------------------------------------------- */

  // Keep the newest message in view.
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
  }, [messages.length, busy, activeId]);

  // Auto-grow the composer (but never let it swallow the screen).
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
  }, [draft]);

  // Speech must never outlive the page.
  useEffect(() => {
    return () => {
      stopSpeaking();
    };
  }, []);

  const toggleSpeak = (message: AshyMessage) => {
    if (!canSpeak) return;
    if (speakingId === message.id) {
      stopSpeaking();
      setSpeakingId(null);
      return;
    }
    const started = speakText(message.text, () => setSpeakingId(null));
    if (started) setSpeakingId(message.id);
  };

  const copyMessage = async (message: AshyMessage) => {
    try {
      await navigator.clipboard.writeText(message.text);
      setCopiedId(message.id);
      window.setTimeout(() => setCopiedId(null), 1500);
    } catch {
      toast("Couldn't copy — select the text and copy manually.");
    }
  };

  const isLastAssistant =
    messages.length > 0 &&
    messages[messages.length - 1].role === "assistant";

  return (
    <div className="mx-auto flex h-[calc(100dvh-14rem)] min-h-[26rem] w-full max-w-3xl flex-col lg:h-[calc(100dvh-9rem)]">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden
            className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"
          >
            <Sparkles className="size-5" />
          </span>
          <div className="min-w-0">
            <h1 className="text-lg leading-tight font-bold tracking-tight">
              Ashy
            </h1>
            <p className="hidden text-xs text-muted-foreground sm:block">
              Your personal Student OS assistant
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="cursor-pointer"
                aria-label="Recent conversations"
              >
                <History className="size-3.5" aria-hidden />
                <span className="hidden sm:inline">History</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 p-2">
              <p className="px-2 pb-1.5 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                Conversations
              </p>
              <ul className="max-h-64 space-y-0.5 overflow-y-auto">
                {conversations.map((conversation) => (
                  <li key={conversation.id}>
                    <button
                      type="button"
                      onClick={() => setActiveId(conversation.id)}
                      className={cn(
                        "w-full cursor-pointer truncate rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                        conversation.id === activeId
                          ? "bg-primary/10 text-primary"
                          : "text-foreground hover:bg-accent",
                      )}
                    >
                      {conversation.title}
                    </button>
                  </li>
                ))}
              </ul>
            </PopoverContent>
          </Popover>

          <Button
            variant="outline"
            size="sm"
            className="cursor-pointer"
            onClick={startNewChat}
          >
            <Plus className="size-3.5" aria-hidden />
            New chat
          </Button>
        </div>
      </div>

      {/* Study context handed over from a mission or chapter */}
      {context ? (
        <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
          <p className="min-w-0 truncate text-xs text-muted-foreground">
            <span className="font-semibold text-primary">Context · </span>
            {context.split("\n").join(" · ")}
          </p>
          <button
            type="button"
            aria-label="Dismiss context"
            className="cursor-pointer rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
            onClick={() => setContextDismissed(true)}
          >
            <X className="size-3.5" aria-hidden />
          </button>
        </div>
      ) : null}

      {/* Messages */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto py-4">
        {messages.length === 0 ? (
          <WelcomeScreen onPick={(prompt) => {
            setDraft(prompt);
            textareaRef.current?.focus();
          }} />
        ) : (
          <ul className="space-y-5">
            {messages.map((message, index) => {
              const isLast = index === messages.length - 1;

              if (message.role === "user") {
                return (
                  <li
                    key={message.id}
                    className="flex justify-end"
                  >
                    <div className="max-w-[85%] space-y-2">
                      {message.images?.length ? (
                        <div className="flex justify-end">
                          {message.images.map((image, imageIndex) => (
                            <img
                              key={`${message.id}-${imageIndex}`}
                              src={`data:${image.mimeType};base64,${image.data}`}
                              alt="Image sent to Ashy"
                              className="max-h-48 max-w-full rounded-lg border object-contain"
                            />
                          ))}
                        </div>
                      ) : null}
                      {message.text ? (
                        <div className="rounded-2xl rounded-tr-md bg-primary px-3.5 py-2.5 text-sm break-words whitespace-pre-wrap text-primary-foreground">
                          {message.text}
                        </div>
                      ) : null}
                    </div>
                  </li>
                );
              }

              // Assistant
              return (
                <li key={message.id} className="flex items-start gap-3">
                  <span
                    aria-hidden
                    className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"
                  >
                    <Sparkles className="size-4" />
                  </span>

                  <div className="min-w-0 flex-1 space-y-2">
                    {message.error ? (
                      <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-3.5">
                        <p className="flex items-center gap-2 text-sm font-medium text-destructive">
                          <AlertTriangle className="size-4 shrink-0" aria-hidden />
                          {ASHY_FAILURE_COPY[message.error]}
                        </p>
                        {isLast && !busy ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="mt-3 cursor-pointer"
                            onClick={regenerate}
                          >
                            <RefreshCw className="size-3.5" aria-hidden />
                            Retry
                          </Button>
                        ) : null}
                      </div>
                    ) : (
                      <>
                        <div className="rounded-xl border bg-card px-3.5 py-3">
                          <MessageContent text={message.text} />
                        </div>

                        <div className="flex flex-wrap items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 cursor-pointer gap-1.5 px-2 text-xs text-muted-foreground"
                            onClick={() => void copyMessage(message)}
                          >
                            {copiedId === message.id ? (
                              <Check className="size-3.5 text-primary" aria-hidden />
                            ) : (
                              <Copy className="size-3.5" aria-hidden />
                            )}
                            {copiedId === message.id ? "Copied" : "Copy"}
                          </Button>

                          {canSpeak ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 cursor-pointer gap-1.5 px-2 text-xs text-muted-foreground"
                              onClick={() => toggleSpeak(message)}
                            >
                              {speakingId === message.id ? (
                                <VolumeX className="size-3.5" aria-hidden />
                              ) : (
                                <Volume2 className="size-3.5" aria-hidden />
                              )}
                              {speakingId === message.id ? "Stop" : "Listen"}
                            </Button>
                          ) : null}

                          {isLast && isLastAssistant && !busy ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 cursor-pointer gap-1.5 px-2 text-xs text-muted-foreground"
                              onClick={regenerate}
                            >
                              <RefreshCw className="size-3.5" aria-hidden />
                              Regenerate
                            </Button>
                          ) : null}
                        </div>
                      </>
                    )}
                  </div>
                </li>
              );
            })}

            {busy ? <ThinkingIndicator /> : null}
          </ul>
        )}
      </div>

      {/* Pending attachment preview */}
      {pendingImage ? (
        <div className="mb-2 flex items-center gap-2 rounded-xl border bg-card p-2.5">
          <button
            type="button"
            className="shrink-0 cursor-zoom-in rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            aria-label={previewLarge ? "Hide larger preview" : "Preview image"}
            title="Preview image"
            onClick={() => setPreviewLarge((current) => !current)}
          >
            <img
              src={pendingImage}
              alt="Cropped image ready to send"
              className={cn(
                "rounded-lg border object-contain transition-all",
                previewLarge
                  ? "max-h-56 w-auto max-w-[min(100%,22rem)]"
                  : "h-16 w-auto max-w-32",
              )}
            />
          </button>

          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-foreground">
              Ready to send
            </p>
            <p className="truncate text-xs text-muted-foreground">
              Only this crop goes to Ashy.
            </p>
          </div>

          <Button
            variant="outline"
            size="sm"
            className="h-8 cursor-pointer text-xs"
            onClick={() => {
              setCropSrc(pendingImage);
              setCropOpen(true);
            }}
          >
            <Crop className="size-3.5" aria-hidden />
            Crop image
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 cursor-pointer text-xs"
            onClick={openFilePicker}
            disabled={busy}
          >
            <ImagePlus className="size-3.5" aria-hidden />
            Replace
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 cursor-pointer px-2 text-xs"
            aria-label="Remove image"
            title="Remove image"
            onClick={() => {
              setPendingImage(null);
              setPreviewLarge(false);
            }}
          >
            <X className="size-4" aria-hidden />
          </Button>
        </div>
      ) : null}

      {/* Composer */}
      <form
        className="flex items-end gap-1.5 rounded-xl border bg-card p-2"
        onSubmit={(event) => {
          event.preventDefault();
          void sendMessage();
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(event) => {
            void handleFile(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Choose image"
          title="Choose image"
          className="shrink-0 text-muted-foreground"
          disabled={busy}
          onClick={openFilePicker}
        >
          <Paperclip className="size-4" aria-hidden />
        </Button>

        {canDictate ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={listening ? "Stop listening" : "Speak your question"}
            title={listening ? "Stop listening" : "Speak your question"}
            className={cn(
              "shrink-0",
              listening
                ? "text-destructive"
                : "text-muted-foreground",
            )}
            disabled={busy}
            onClick={toggleListening}
          >
            {listening ? (
              <span className="flex items-center gap-1">
                <span className="size-2 animate-pulse rounded-full bg-destructive" />
                <Mic className="size-4" aria-hidden />
              </span>
            ) : (
              <Mic className="size-4" aria-hidden />
            )}
          </Button>
        ) : null}

        <Textarea
          ref={textareaRef}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              void sendMessage();
            }
          }}
          rows={1}
          placeholder={
            listening ? "Listening… speak now" : "Type your question…"
          }
          aria-label="Message Ashy"
          className="max-h-40 min-h-10 flex-1 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
        />

        {busy ? (
          <Button
            type="button"
            variant="secondary"
            size="icon"
            aria-label="Stop generating"
            title="Stop"
            className="shrink-0"
            onClick={stopGenerating}
          >
            <Square className="size-4" aria-hidden />
          </Button>
        ) : (
          <Button
            type="submit"
            size="icon"
            aria-label="Send to Ashy"
            title="Send to Ashy"
            className="shrink-0"
            disabled={!draft.trim() && !pendingImage}
          >
            {draft.trim() || pendingImage ? (
              <ArrowUp className="size-4" aria-hidden />
            ) : (
              <Send className="size-4" aria-hidden />
            )}
          </Button>
        )}
      </form>

      <p className="mt-1.5 text-center text-[11px] text-muted-foreground">
        Ashy can make mistakes — check important answers.{" "}
        <Link
          to="/dashboard"
          className="text-primary hover:underline"
        >
          Back to Home
        </Link>
      </p>

      <ImageCropDialog
        open={cropOpen}
        src={cropSrc}
        onClose={() => {
          setCropOpen(false);
          setCropSrc(null);
        }}
        onConfirm={(cropped) => setPendingImage(cropped)}
      />
    </div>
  );
}
