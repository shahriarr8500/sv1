/**
 * Ashy — the Student OS study assistant.
 *
 * A full-page chat built on the server-side Gemini action (`convex/ashy.ts`),
 * so the API key never reaches the browser. Conversations are persisted in
 * Convex (`convex/ashyConversations.ts`): the outgoing message is saved
 * before the model runs, the earlier turns come back as Gemini context, and
 * the page renders reactively from the saved messages — so a refresh, a
 * deep link (`/ashy?c=<id>`) or a new tab always lands on the same chat.
 *
 * Layout: a collapsible left history panel on laptop (search, pinned,
 * projects, grouped chats) and a full-height drawer on mobile, both driven
 * by the shared HistoryPanel component.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAction, useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { Link, useSearchParams } from "react-router";
import { toast } from "sonner";
import {
  AlertTriangle,
  Camera,
  Check,
  ArrowDown,
  Copy,
  Crop,
  Globe,
  Image as ImageIcon,
  ImagePlus,
  ListChecks,
  Mic,
  Paperclip,
  Pencil,
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
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { MessageContent } from "@/components/ashy/MessageContent";
import { CameraCaptureDialog } from "@/components/ashy/CameraCaptureDialog";
import {
  AshyVideoCard,
  AshyVideoPlayer,
} from "@/components/ashy/AshyVideoPlayer";
import { SourcesRow } from "@/components/ashy/SourcesRow";
import {
  HistoryPanel,
  type HistoryPanelHandle,
} from "@/components/ashy/HistoryPanel";
import { ChatHeader } from "@/components/ashy/ChatHeader";
import {
  ImageCropDialog,
  MAX_IMAGE_BYTES,
  isAcceptedImage,
  readImageFile,
  stripDataUrlPrefix,
} from "@/components/ashy/ImageCropDialog";
import {
  ACCEPTED_IMAGE_MIME_TYPES,
  IMAGE_REJECTION_COPY,
  detectImageMimeFromBase64,
  isAcceptedImageMime,
  mimeTypeFromDataUrl,
} from "@/lib/ashy-attachments";
import {
  ASHY_FAILURE_COPY,
  ASHY_STARTERS,
  loadAshyPanelOpen,
  loadAshyPrefs,
  saveAshyDraft,
  loadAshyDraft,
  saveAshyPanelOpen,
  saveAshyPrefs,
  type AshyMessage,
  type AshyPrefs,
  type AshyProjectRow,
  type AshyVideo,
  createDictation,
  newId,
  speakText,
  speechInputSupported,
  speechOutputSupported,
  stopSpeaking,
} from "@/lib/ashy";
import { youtubeSearchUrl } from "@/lib/ashy-youtube";
import { useTargets } from "@/state/targets";
import { useImpersonation } from "@/hooks/use-impersonation";
import { todayKey } from "@/lib/student-os/target-calendar";
import { lookupItem } from "@/lib/student-os/syllabus";
import { xpForSubject } from "@/lib/student-os/gamification";

type ConvId = Id<"conversations">;
type ProjId = Id<"projects">;
/** The panel passes plain strings; Convex wants typed ids at the call sites. */
const asConvId = (id: string) => id as ConvId;
const asProjId = (id: string) => id as ProjId;

const SMART_CHIPS = [
  "Explain it step by step",
  "Give me practice problems",
  "Find a video for this",
];

/* -------------------------------------------------------------------------- */
/* Pieces                                                                      */
/* -------------------------------------------------------------------------- */

function ThinkingIndicator({ searching }: { searching?: boolean }) {
  return (
    <li className="flex items-center gap-3">
      <span
        aria-hidden
        className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"
      >
        <Sparkles className="size-4" />
      </span>
      <div className="space-y-1.5">
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
        {searching ? (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Globe className="size-3.5" aria-hidden />
            Searching the web…
          </span>
        ) : null}
      </div>
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
            className="cursor-pointer rounded-lg border bg-card px-3 py-2.5 text-left text-sm transition-colors hover:border-primary/40 hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {prompt}
          </button>
        ))}
      </div>      </div>
  );
}


/* -------------------------------------------------------------------------- */
/* Page                                                                        */
/* -------------------------------------------------------------------------- */

export default function AshyPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawContext = searchParams.get("context") ?? "";
  const [contextDismissed, setContextDismissed] = useState(false);
  const context =
    rawContext && !contextDismissed ? rawContext.trim() : undefined;

  /* --- impersonation --------------------------------------------- */
  const { isImpersonating, target } = useImpersonation();
  const effectiveTargetId =
    isImpersonating && target ? target.id : null;

  /* --- local preferences, panel and drafts ----------------------------- */
  const [prefs, setPrefs] = useState<AshyPrefs>(() => loadAshyPrefs());
  const [panelOpen, setPanelOpen] = useState<boolean>(() => loadAshyPanelOpen());
  const [drawerOpen, setDrawerOpen] = useState(false);

  /* --- the open conversation ------------------------------------------- */
  const [activeId, setActiveId] = useState<ConvId | null>(() => {
    const fromUrl = searchParams.get("c");
    return fromUrl ? asConvId(fromUrl) : null;
  });
  const [chatNotFound, setChatNotFound] = useState(false);
  /** Project that a NEW chat will be created inside (chip above composer). */
  const [openProjectId, setOpenProjectId] = useState<string | null>(null);

  /* --- composer --------------------------------------------------------- */
  const [draft, setDraft] = useState(
    () => loadAshyDraft(activeId)?.text ?? "",
  );
  const [pendingImage, setPendingImage] = useState<string | null>(
    () => loadAshyDraft(activeId)?.imageData ?? null,
  );
  const [cropOpen, setCropOpen] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [cropFromCamera, setCropFromCamera] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [previewLarge, setPreviewLarge] = useState(false);
  /** clientMessageId of the user message being edited and resent. */
  const [editingId, setEditingId] = useState<string | null>(null);

  /* --- request state ---------------------------------------------------- */
  const [busy, setBusy] = useState(false);
  const [busyConvId, setBusyConvId] = useState<string | null>(null);
  /** True while the student is scrolled up (shows "Jump to latest"). */
  const [showJump, setShowJump] = useState(false);
  const [searchMode, setSearchMode] = useState<"auto" | "on" | "off">("auto");
  const jumpRef = useRef<HTMLButtonElement | null>(null);

  /* --- local overlay (optimistic + unconfirmed messages) ---------------- */
  const [pending, setPending] = useState<Record<string, AshyMessage[]>>({});

  /* --- player, voice, misc ---------------------------------------------- */
  const [player, setPlayer] = useState<{
    video: AshyVideo;
    mode: "full" | "mini";
  } | null>(null);
  const [listening, setListening] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [missionsAddedId, setMissionsAddedId] = useState<string | null>(null);
  const [smartDismissedFor, setSmartDismissedFor] = useState<string | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [newProjectDialog, setNewProjectDialog] = useState<{
    moveChatId?: string;
  } | null>(null);
  const [newProjectForm, setNewProjectForm] = useState({
    name: "",
    emoji: "",
    instructions: "",
  });

  /* --- Convex ----------------------------------------------------------- */
  const chatAction = useAction(api.ashy.chat);
  const { results: convResults, status: convStatus, loadMore } =
    usePaginatedQuery(
      api.ashyConversations.listConversations,
      {},
      { initialNumItems: 30 },
    );
  const projectsQuery = useQuery(api.ashyConversations.listProjects, {});
  const conversation = useQuery(
    api.ashyConversations.getConversation,
    activeId ? { conversationId: activeId } : "skip",
  );
  const createConversationMut = useMutation(api.ashyConversations.createConversation);
  const renameConversationMut = useMutation(api.ashyConversations.renameConversation);
  const setPinnedMut = useMutation(api.ashyConversations.setConversationPinned);
  const moveChatMut = useMutation(api.ashyConversations.moveConversationToProject);
  const deleteChatMut = useMutation(api.ashyConversations.deleteConversation);
  const restoreChatMut = useMutation(api.ashyConversations.restoreConversation);
  const editMessageMut = useMutation(api.ashyConversations.editUserMessage);
  const dropReplyMut = useMutation(api.ashyConversations.dropTrailingReply);
  const appendReplyMut = useMutation(api.ashyConversations.appendReply);
  const createProjectMut = useMutation(api.ashyConversations.createProject);
  const renameProjectMut = useMutation(api.ashyConversations.renameProject);
  const updateProjectMut = useMutation(api.ashyConversations.updateProject);
  const deleteProjectMut = useMutation(api.ashyConversations.deleteProject);
  const reportHistoryViewedMut =
    useMutation(api.ashyConversations.reportAshyHistoryViewed);
  const reportChatOpenedMut = useMutation(api.ashyConversations.reportAshyChatOpened);

  const { addMissions } = useTargets();
  const requestIdRef = useRef(0);
  const lastSendRef = useRef<{
    conversationId: string;
    clientMessageId: string;
    text: string;
    image: { mimeType: string; data: string } | null;
  } | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const atBottomRef = useRef(true);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const captureInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const desktopPanelRef = useRef<HistoryPanelHandle | null>(null);
  const mobilePanelRef = useRef<HistoryPanelHandle | null>(null);
  /** Latest server-confirmed message ids — used to prune the local overlay. */
  const serverIdsRef = useRef<Set<string>>(new Set());
  const dictationRef = useRef<ReturnType<typeof createDictation> | null>(null);
  const draftBeforeVoiceRef = useRef("");

  const chats = useMemo(
    () =>
      convResults.map((row) => ({
        id: row._id as string,
        title: row.title,
        pinned: row.pinned ?? false,
        projectId: (row.projectId ?? null) as string | null,
        updatedAt: row.updatedAt,
        messageCount: row.messageCount ?? 0,
      })),
    [convResults],
  );
  const projects: AshyProjectRow[] = useMemo(
    () =>
      (projectsQuery?.projects ?? []).map((project) => ({
        id: project.id as string,
        name: project.name,
        emoji: project.emoji,
        instructions: project.instructions,
        chatCount: project.chatCount,
      })),
    [projectsQuery],
  );

  /* --- messages: server truth + local overlay --------------------------- */
  const serverMessages = conversation?.messages;
  const messages = useMemo(() => {
    const base: AshyMessage[] = (serverMessages ?? []).map((message) => ({
      ...message,
      role: message.role,
      // Failure kinds arrive typed from the Convex schema; they match the
      // client's AshyFailureKind union exactly (see src/lib/ashy.ts).
      error: message.error as AshyMessage["error"],
    }));
    const localList = activeId ? (pending[activeId] ?? []) : [];
    if (localList.length === 0) return base;
    const serverIds = new Set(base.map((message) => message.id));
    return [...base, ...localList.filter((message) => !serverIds.has(message.id))];
  }, [serverMessages, pending, activeId]);

  const activeProject = conversation?.projectId
    ? (projects.find((project) => project.id === conversation.projectId) ??
      null)
    : null;
  const newChatProject = openProjectId
    ? (projects.find((project) => project.id === openProjectId) ?? null)
    : null;
  const title = conversation?.title ?? "New chat";
  const hasChat = messages.length > 0;
  const busyForActive = busy && busyConvId === activeId;
  const conversationLoading = activeId !== null && conversation === undefined;

  // Read-only while an admin is viewing another student's account: every write
  // path is blocked on the backend, and the UI reflects that so the admin has
  // no expectation they can edit the student's chats.
  const readOnly =
    isImpersonating && target !== null && effectiveTargetId !== null;

  /** Only the newest search notice renders — once per conversation. */
  const latestNoticeIndex = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].searchNotice) return i;
    }
    return -1;
  }, [messages]);
  const canSpeak = speechOutputSupported();
  const canDictate = speechInputSupported();

  const lastMessage = messages[messages.length - 1];
  const lastUserMessage = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].role === "user") return messages[i];
    }
    return null;
  }, [messages]);

  const smartChipsVisible =
    !busy &&
    lastMessage !== undefined &&
    lastMessage.role === "assistant" &&
    !lastMessage.error &&
    lastMessage.text.trim() !== "" &&
    !lastMessage.chips?.length &&
    !lastMessage.planMissions?.itemIds.length &&
    smartDismissedFor !== lastMessage.id;

  /* --- local overlay helpers -------------------------------------------- */

  const addPending = useCallback(
    (conversationId: string, message: AshyMessage) => {
      // Prune local copies the server has already confirmed for this chat.
      const confirmed = serverIdsRef.current;
      setPending((previous) => {
        const kept = (previous[conversationId] ?? []).filter(
          (entry) => !confirmed.has(entry.id),
        );
        return { ...previous, [conversationId]: [...kept, message] };
      });
    },
    [],
  );

  const dropPending = useCallback(
    (conversationId: string, messageId: string) => {
      setPending((previous) => ({
        ...previous,
        [conversationId]: (previous[conversationId] ?? []).filter(
          (message) => message.id !== messageId,
        ),
      }));
    },
    [],
  );

  const dropPendingErrors = useCallback((conversationId: string) => {
    setPending((previous) => ({
      ...previous,
      [conversationId]: (previous[conversationId] ?? []).filter(
        (message) => !message.error,
      ),
    }));
  }, []);

  const trimPendingAfter = useCallback(
    (conversationId: string, messageId: string) => {
      setPending((previous) => {
        const list = previous[conversationId] ?? [];
        const index = list.findIndex((message) => message.id === messageId);
        if (index === -1) {
          return { ...previous, [conversationId]: [] };
        }
        return {
          ...previous,
          [conversationId]: list.slice(0, index + 1),
        };
      });
    },
    [],
  );

  // Track which message ids the server has confirmed (rendering already
  // dedupes on the fly; this only keeps the overlay small).
  useEffect(() => {
    if (serverMessages) {
      serverIdsRef.current = new Set(
        serverMessages.map((message) => message.id),
      );
    }
  }, [serverMessages]);

  /* --- URL sync + missing chats ----------------------------------------- */

  const applyActiveId = useCallback(
    (id: ConvId | null) => {
      setActiveId(id);
      setChatNotFound(false);
      setShowJump(false);
      // Restore this chat's saved draft/attachment (or a blank composer).
      const stored = loadAshyDraft(id);
      setDraft(stored?.text ?? "");
      setPendingImage(stored?.imageData ?? null);
      setPreviewLarge(false);
      setEditingId(null);
      setSearchParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          if (id) next.set("c", id);
          else next.delete("c");
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  // A chat id in the URL that isn't ours (or was deleted) falls back to a
  // friendly notice plus a fresh chat. The recovery runs on the next tick so
  // this effect never sets state synchronously.
  useEffect(() => {
    if (!(conversation === null && activeId)) return;
    const handle = window.setTimeout(() => {
      toast("That chat couldn't be found", {
        description: "It may have been deleted. Opening a new chat.",
      });
      setChatNotFound(true);
      void applyActiveId(null);
    }, 0);
    return () => window.clearTimeout(handle);
  }, [conversation, activeId]);

  /* --- drafts (per conversation, memory + localStorage) ------------------ */

  useEffect(() => {
    saveAshyDraft(activeId, {
      text: draft,
      imageData: pendingImage ?? undefined,
    });
  }, [draft, pendingImage, activeId]);

  useEffect(() => {
    saveAshyPrefs(prefs);
  }, [prefs]);

  useEffect(() => {
    saveAshyPanelOpen(panelOpen);
  }, [panelOpen]);

  /* --- scrolling --------------------------------------------------------- */

  const handleScroll = useCallback(() => {
    const container = scrollRef.current;
    if (!container) return;
    const atBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight < 80;
    atBottomRef.current = atBottom;
    setShowJump(!atBottom);
    // Keep the latest-affordance mounted for the layout/stable focus path.
    void jumpRef.current;
    if (!atBottom) {
      setShowJump(true);
    }
  }, []);

  // Keep the newest message in view only when the student is already there —
  // never yank the view while they are reading something older.
  useEffect(() => {
    const container = scrollRef.current;
    if (!container || !atBottomRef.current) return;
    const reduce =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    container.scrollTo({
      top: container.scrollHeight,
      behavior: reduce ? "auto" : "smooth",
    });
  }, [messages.length, busy, activeId]);

  // Auto-grow the composer up to ~6 lines.
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 144)}px`;
  }, [draft]);

  // Speech must never outlive the page.
  useEffect(() => () => stopSpeaking(), []);

  /* --- global shortcuts -------------------------------------------------- */

  const focusSearch = useCallback(() => {
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      setDrawerOpen(true);
      mobilePanelRef.current?.focusSearch();
    } else if (panelOpen) {
      desktopPanelRef.current?.focusSearch();
    } else {
      setPanelOpen(true);
      window.setTimeout(() => desktopPanelRef.current?.focusSearch(), 150);
    }
  }, [panelOpen]);

  const startNewChat = useCallback(() => {
    requestIdRef.current += 1; // orphan any in-flight request
    setBusy(false);
    setBusyConvId(null);
    void applyActiveId(null);
    setDraft("");
    saveAshyDraft(null, null);
    setPendingImage(null);
    setPreviewLarge(false);
    setDrawerOpen(false);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      if (mod && !event.shiftKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        focusSearch();
      } else if (mod && event.shiftKey && event.key.toLowerCase() === "o") {
        event.preventDefault();
        startNewChat();
      } else if (event.key === "Escape" && drawerOpen) {
        setDrawerOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [focusSearch, startNewChat, drawerOpen]);

  /* --- the request ------------------------------------------------------- */

  const runRequest = useCallback(
    async (
      params: {
        conversationId: string;
        clientMessageId?: string;
        text?: string;
        image?: { mimeType: string; data: string } | null;
        mode: "send" | "regenerate";
      },
      myRequest: number,
    ) => {
      const result = await chatAction({
        conversationId: asConvId(params.conversationId),
        clientMessageId: params.clientMessageId,
        text: params.text,
        images: params.image ? [params.image] : undefined,
        mode: params.mode,
        context,
        searchMode,
        answerLength: prefs.answerLength,
      });
      if (requestIdRef.current !== myRequest) return; // stopped or superseded
      if (result.ok) {
        const assistantMessage: AshyMessage = {
          id: newId(),
          role: "assistant",
          text: result.text,
          videos: result.videos,
          videoSearch: result.videoSearch,
          sources: result.sources,
          searchQueries: result.searchQueries,
          searchNotice: result.searchNotice,
          searchNoticeKind: result.searchNoticeKind,
          grounded: result.grounded,
          searchEntryPointUrl: result.searchEntryPointUrl,
          chips: result.chips,
          planMissions: result.planMissions,
        };
        addPending(params.conversationId, assistantMessage);
        // Persist the answer (idempotent). If this write fails the local
        // copy stays visible for the session; a reload drops just the reply.
        void appendReplyMut({
          conversationId: asConvId(params.conversationId),
          clientMessageId: assistantMessage.id,
          text: assistantMessage.text,
          videos: assistantMessage.videos,
          videoSearch: assistantMessage.videoSearch,
          sources: assistantMessage.sources,
          searchQueries: assistantMessage.searchQueries,
          searchNotice: assistantMessage.searchNotice,
          searchNoticeKind: assistantMessage.searchNoticeKind,
          grounded: assistantMessage.grounded,
          searchEntryPointUrl: assistantMessage.searchEntryPointUrl,
          chips: assistantMessage.chips,
          planMissions: assistantMessage.planMissions,
        }).catch(() => {
          // Local copy already shown — nothing else to do.
        });
      } else {
        // Failure kind only in the log — never the message text.
        console.error(`[ashy] reply failed kind=${result.kind}`);
        addPending(params.conversationId, {
          id: newId(),
          role: "assistant",
          text: "",
          error: result.kind as AshyMessage["error"],
        });
      }
    },
    [chatAction, context, searchMode, prefs.answerLength, addPending, appendReplyMut],
  );

  const sendMessage = useCallback(
    async (overrideText?: string) => {
      if (busy) return;
      const text = (overrideText ?? draft).trim();
      // The declared type is derived from the data URL itself (the cropper
      // re-encodes to JPEG; older drafts may hold PNG/WebP). The backend
      // re-derives the MIME from the bytes anyway — this is for consistency.
      const image = pendingImage
        ? {
            mimeType: mimeTypeFromDataUrl(pendingImage),
            data: stripDataUrlPrefix(pendingImage),
          }
        : null;
      if (!text && !image) {
        toast("Nothing to send yet", {
          description: "Type a question or attach an image first.",
        });
        return;
      }

      const myRequest = requestIdRef.current + 1;
      requestIdRef.current = myRequest;
      setBusy(true);
      setSmartDismissedFor(null);
      const editedId = editingId;

      try {
        // Editing the last message: update it server-side (everything after
        // it is dropped) and regenerate the answer from that point.
        if (editedId && activeId) {
          const conversationId = activeId;
          await editMessageMut({
            conversationId,
            clientMessageId: editedId,
            text,
          });
          trimPendingAfter(conversationId, editedId);
          setEditingId(null);
          setDraft("");
          setPendingImage(null);
          setPreviewLarge(false);
          saveAshyDraft(conversationId, null);
          if (requestIdRef.current !== myRequest) return;
          setBusyConvId(conversationId);
          await runRequest({ conversationId, mode: "regenerate" }, myRequest);
          return;
        }

        // Normal send: ensure a conversation exists first (a new chat is
        // created on the first message, inside the open project if any).
        let conversationId: ConvId | null = activeId;
        if (!conversationId) {
          conversationId = await createConversationMut({
            projectId: openProjectId ? asProjId(openProjectId) : undefined,
          });
          void applyActiveId(conversationId);
        }

        const userMessage: AshyMessage = {
          id: newId(),
          role: "user",
          text,
          images: image ? [image] : undefined,
        };
        addPending(conversationId, userMessage);
        lastSendRef.current = {
          conversationId,
          clientMessageId: userMessage.id,
          text,
          image,
        };
        setDraft("");
        setPendingImage(null);
        setPreviewLarge(false);
        saveAshyDraft(conversationId, null);
        if (requestIdRef.current !== myRequest) return;
        setBusyConvId(conversationId);
        await runRequest(
          {
            conversationId,
            clientMessageId: userMessage.id,
            text,
            image,
            mode: "send",
          },
          myRequest,
        );
      } catch {
        if (requestIdRef.current !== myRequest) return;
        const conversationId = activeId;
        if (conversationId) {
          console.error("[ashy] send failed kind=network");
          addPending(conversationId, {
            id: newId(),
            role: "assistant",
            text: "",
            error: "unavailable",
          });
        } else {
          toast("Couldn't send that", { description: "Check your connection and try again." });
        }
      } finally {
        if (requestIdRef.current === myRequest) {
          setBusy(false);
          setBusyConvId(null);
        }
      }
    },
    [
      busy,
      draft,
      pendingImage,
      activeId,
      editingId,
      openProjectId,
      createConversationMut,
      editMessageMut,
      applyActiveId,
      addPending,
      runRequest,
      trimPendingAfter,
    ],
  );

  const stopGenerating = useCallback(() => {
    requestIdRef.current += 1; // orphan the in-flight answer (it isn't kept)
    setBusy(false);
    setBusyConvId(null);
  }, []);

  /** Retry after a failed send: same clientMessageId, so it never duplicates. */
  const retryLastSend = useCallback(async () => {
    const send = lastSendRef.current;
    if (busy || !send) return;
    const myRequest = requestIdRef.current + 1;
    requestIdRef.current = myRequest;
    setBusy(true);
    setBusyConvId(send.conversationId);
    try {
      dropPendingErrors(send.conversationId);
      await runRequest({ ...send, mode: "send" }, myRequest);
    } catch {
      if (requestIdRef.current !== myRequest) return;
      addPending(send.conversationId, {
        id: newId(),
        role: "assistant",
        text: "",
        error: "unavailable",
      });
    } finally {
      if (requestIdRef.current === myRequest) {
        setBusy(false);
        setBusyConvId(null);
      }
    }
  }, [busy, dropPendingErrors, runRequest, addPending]);

  /** Regenerate the last answer from the stored conversation. */
  const regenerate = useCallback(async () => {
    if (busy || !activeId || lastMessage?.role !== "assistant") return;
    const myRequest = requestIdRef.current + 1;
    requestIdRef.current = myRequest;
    setBusy(true);
    setBusyConvId(activeId);
    try {
      // A local-only trailing answer (never persisted) is simply replaced.
      dropPending(activeId, lastMessage.id);
      const fromServer = serverMessages?.some(
        (message) => message.id === lastMessage.id,
      );
      if (fromServer) await dropReplyMut({ conversationId: activeId });
      await runRequest({ conversationId: activeId, mode: "regenerate" }, myRequest);
    } catch {
      if (requestIdRef.current !== myRequest) return;
      addPending(activeId, {
        id: newId(),
        role: "assistant",
        text: "",
        error: "unavailable",
      });
    } finally {
      if (requestIdRef.current === myRequest) {
        setBusy(false);
        setBusyConvId(null);
      }
    }
  }, [busy, activeId, lastMessage, serverMessages, dropReplyMut, runRequest, dropPending, addPending]);

  /* --- conversation management ------------------------------------------- */

  const openChat = useCallback(
    (id: string) => {
      if (id === activeId) {
        setDrawerOpen(false);
        return;
      }
      requestIdRef.current += 1; // orphan any in-flight request
      setBusy(false);
      setBusyConvId(null);
      void applyActiveId(asConvId(id));
      const chat = chats.find((row) => row.id === id);
      setOpenProjectId(chat?.projectId ?? null);
      setDrawerOpen(false);
    },
    [activeId, chats],
  );

  const renameActiveChat = useCallback(() => {
    setRenameValue(title);
    setRenameOpen(true);
  }, [title]);

  const submitRename = useCallback(() => {
    if (!activeId) return;
    const value = renameValue.trim();
    if (!value) return;
    void renameConversationMut({ conversationId: activeId, title: value }).catch(
      () => toast("Couldn't rename that chat"),
    );
    setRenameOpen(false);
  }, [activeId, renameValue, renameConversationMut]);

  const togglePin = useCallback(
    (chatId: string, pinned: boolean) => {
      void setPinnedMut({ conversationId: asConvId(chatId), pinned }).catch(
        () => toast("Couldn't update the pin"),
      );
    },
    [setPinnedMut],
  );

  const moveChat = useCallback(
    (chatId: string, projectId: string | null) => {
      void moveChatMut({
        conversationId: asConvId(chatId),
        projectId: projectId === null ? null : asProjId(projectId),
      }).catch(() => toast("Couldn't move that chat"));
      if (chatId === activeId) setOpenProjectId(projectId);
    },
    [moveChatMut, activeId],
  );

  const deleteChat = useCallback(
    (chatId: string) => {
      if (chatId === activeId) void applyActiveId(null);
      void deleteChatMut({ conversationId: asConvId(chatId) })
        .then(() => {
          toast("Chat deleted", {
            duration: 8000,
            action: {
              label: "Undo",
              onClick: () => {
                void restoreChatMut({ conversationId: asConvId(chatId) }).catch(
                  () => toast("Couldn't restore that chat"),
                );
              },
            },
          });
        })
        .catch(() => toast("Couldn't delete that chat"));
    },
    [activeId, deleteChatMut, restoreChatMut],
  );

  const createProject = useCallback(
    async (input: {
      name: string;
      emoji?: string;
      instructions?: string;
      moveChatId?: string;
    }) => {
      try {
        const projectId = await createProjectMut({
          name: input.name,
          emoji: input.emoji,
          instructions: input.instructions,
        });
        if (input.moveChatId) {
          await moveChatMut({
            conversationId: asConvId(input.moveChatId),
            projectId,
          });
          if (input.moveChatId === activeId) setOpenProjectId(projectId);
        }
        toast("Project created");
      } catch {
        toast("Couldn't create the project");
      }
    },
    [createProjectMut, moveChatMut, activeId],
  );

  const deleteProject = useCallback(
    (projectId: string, mode: "move" | "delete") => {
      void deleteProjectMut({ projectId: asProjId(projectId), mode })
        .then(({ affected }) => {
          if (openProjectId === projectId) setOpenProjectId(null);
          toast(
            mode === "move"
              ? `Project deleted — ${affected} chat${affected === 1 ? "" : "s"} moved to Chats`
              : `Project and ${affected} chat${affected === 1 ? "" : "s"} deleted`,
          );
        })
        .catch(() => toast("Couldn't delete that project"));
    },
    [deleteProjectMut, openProjectId],
  );

  const exportChat = useCallback(
    (format: "text" | "markdown") => {
      const lines = messages
        .filter((message) => !message.error && message.text.trim())
        .map((message) => {
          const who = message.role === "user" ? "You" : "Ashy";
          return format === "markdown"
            ? `**${who}**\n\n${message.text}`
            : `${who}: ${message.text}`;
        });
      if (lines.length === 0) {
        toast("Nothing to export yet");
        return;
      }
      const transcript =
        format === "markdown"
          ? `# ${title}\n\n${lines.join("\n\n")}`
          : lines.join("\n\n");
      navigator.clipboard
        .writeText(transcript)
        .then(() => toast("Chat copied to clipboard"))
        .catch(() =>
          toast("Couldn't copy", { description: "Your browser blocked the clipboard." }),
        );
    },
    [messages, title],
  );

  /* --- image attach + crop ----------------------------------------------- */

  const openFilePicker = useCallback(() => {
    const input = fileInputRef.current;
    if (!input) return;
    input.value = "";
    input.click();
  }, []);

  const handleFile = useCallback(
    async (file: File | undefined, source: "gallery" | "camera" = "gallery") => {
      if (!file) return; // student cancelled the picker
      if (!isAcceptedImage(file)) {
        toast("Unsupported image", {
          description:
            "Please use a PNG, JPEG, or WebP image. HEIC/HEIF isn't supported by this browser's image tools.",
        });
        return;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        toast("Image too large", {
          description: "Please choose an image under 8 MB.",
        });
        return;
      }
      try {
        const dataUrl = await readImageFile(file);
        // `accept` and file.type are hints only — the picker and the OS can
        // both be wrong. Confirm the bytes really are a supported image
        // before the cropper opens, so a bad file is rejected here with a
        // clear message instead of failing at send time.
        if (
          !isAcceptedImageMime(detectImageMimeFromBase64(stripDataUrlPrefix(dataUrl)) ?? "")
        ) {
          toast("Unsupported image", {
            description: IMAGE_REJECTION_COPY.unsupportedBytes,
          });
          return;
        }
        setPreviewLarge(false);
        setCropFromCamera(source === "camera");
        setCropSrc(dataUrl);
        setCropOpen(true);
      } catch {
        toast("Couldn't read that image", { description: "Please try another file." });
      }
    },
    [],
  );

  /* --- take photo (camera) ------------------------------------------------ */

  const openCameraFlow = useCallback(() => {
    const hasCaptureInput =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(pointer: coarse)").matches;
    if (hasCaptureInput) {
      const input = captureInputRef.current;
      if (input) {
        input.value = "";
        input.click();
        return;
      }
    }
    setCameraOpen(true);
  }, []);

  const takePhoto = useCallback(() => {
    setAttachOpen(false);
    openCameraFlow();
  }, [openCameraFlow]);

  const chooseFromGallery = useCallback(() => {
    setAttachOpen(false);
    openFilePicker();
  }, [openFilePicker]);

  /* --- voice -------------------------------------------------------------- */

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

  const addPlanMissions = useCallback(
    (planMissions: { itemIds: string[]; labels: string[] }, messageId: string) => {
      const xpById: Record<string, number> = {};
      for (const itemId of planMissions.itemIds) {
        const located = lookupItem(itemId);
        xpById[itemId] = located ? xpForSubject(located.subject) : 25;
      }
      const added = addMissions(planMissions.itemIds, todayKey(), xpById);
      if (added > 0) {
        setMissionsAddedId(messageId);
        toast(`Added ${added} mission${added === 1 ? "" : "s"} for today`, {
          description: "Open Missions to see them.",
        });
      } else {
        toast("Nothing new to add", {
          description: "Those targets are already planned for today.",
        });
      }
    },
    [addMissions],
  );

  /* --- preferences application -------------------------------------------- */

  const scaleClass =
    prefs.textSize === "sm"
      ? "text-[13px]"
      : prefs.textSize === "lg"
        ? "text-base"
        : "text-sm";
  const listSpacing = prefs.density === "compact" ? "space-y-3" : "space-y-5";
  const bubblePadding =
    prefs.density === "compact" ? "px-3 py-2" : "px-3.5 py-3";

  /* --- search (debounced) -------------------------------------------------- */

  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  useEffect(() => {
    const handle = window.setTimeout(() => setSearchTerm(searchInput), 250);
    return () => window.clearTimeout(handle);
  }, [searchInput]);
  const searchResultsQuery = useQuery(
    api.ashyConversations.searchConversations,
    searchTerm.trim().length >= 2 ? { term: searchTerm.trim() } : "skip",
  );

  // When impersonation starts or the target changes, clear every local piece
  // of Ashy state that could otherwise show the previous user's chats,
  // drafts, search results or deep link. The backend now controls which chats
  // are returned, but the client still keeps per-conversation drafts and the
  // active conversation id in memory + localStorage, so those must be reset.
  const previousTargetRef = useRef<string | null>(null);
  useEffect(() => {
    if (isImpersonating && effectiveTargetId) {
      // Report that the admin opened this target's Ashy history (server-deduped).
      void reportHistoryViewedMut({});
    }
  }, [isImpersonating, effectiveTargetId]);

  // Key drafts by the effective user so stopping impersonation cannot leave
  // the student's drafts behind in localStorage for the admin to see later.
  useEffect(() => {
    if (!isImpersonating) {
      // Back to the admin's own account: drop any residual target drafts and
      // reset the active chat so a stale deep link can't be reopened.
      if (previousTargetRef.current !== null) {
        saveAshyDraft(null, null);
        void applyActiveId(null);
        setSearchInput("");
        setSearchTerm("");
      }
      previousTargetRef.current = null;
      return;
    }
    if (effectiveTargetId === previousTargetRef.current) return;
    previousTargetRef.current = effectiveTargetId;
    // New target: clear the prior chat, drafts, search and pending state.
    void applyActiveId(null);
    saveAshyDraft(null, null);
    setSearchInput("");
    setSearchTerm("");
  }, [isImpersonating, effectiveTargetId]);

  // While impersonating, report each chat the admin opens (server-deduped).
  // This runs after applyActiveId commits the new activeId.
  useEffect(() => {
    if (!isImpersonating || !activeId) return;
    void reportChatOpenedMut({ conversationId: activeId });
  }, [isImpersonating, activeId]);

  /* --- panel props --------------------------------------------------------- */

  const panelProps = {
    chats,
    projects,
    activeId,
    loading: convStatus === "LoadingFirstPage" || convStatus === "LoadingMore",
    hasMore: convStatus === "CanLoadMore",
    onLoadMore: () => loadMore(30),
    onNewChat: startNewChat,
    onOpenChat: openChat,
    onRenameChat: (id: string, nextTitle: string) => {
      void renameConversationMut({
        conversationId: asConvId(id),
        title: nextTitle,
      }).catch(() => toast("Couldn't rename that chat"));
    },
    onTogglePin: (chat: { id: string; pinned: boolean }) =>
      togglePin(chat.id, !chat.pinned),
    onMoveChat: moveChat,
    onDeleteChat: deleteChat,
    onCreateProject: createProject,
    onRenameProject: (id: string, name: string) => {
      void renameProjectMut({ projectId: asProjId(id), name }).catch(() =>
        toast("Couldn't rename that project"),
      );
    },
    onUpdateProject: (
      id: string,
      patch: { emoji?: string | null; instructions?: string | null },
    ) => {
      void updateProjectMut({ projectId: asProjId(id), ...patch }).catch(() =>
        toast("Couldn't update that project"),
      );
    },
    onDeleteProject: deleteProject,
    search: {
      term: searchInput,
      onTermChange: setSearchInput,
      results: searchResultsQuery?.results,
      loading: searchResultsQuery === undefined,
    },
  };

  const isCoarsePointer =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: coarse)").matches;

  /* --- render ---------------------------------------------------------------- */

  return (
    <div        className={cn(
        "mx-auto flex h-[calc(100dvh-14rem)] min-h-[26rem] w-full max-w-full lg:h-[calc(100dvh-5.5rem)] lg:min-h-0",
        player?.mode === "mini" && "pb-[112px] lg:pb-0",
        showJump && "pb-10",
      )}
    >
      {/* Desktop: collapsible history pane beside the chat */}
      {panelOpen ? (
        <aside className="hidden lg:flex lg:flex-col lg:w-[300px] lg:min-w-0 lg:flex-shrink-0 lg:border-r lg:border-border lg:bg-muted/40 lg:transition-[width] lg:duration-200">
          <HistoryPanel ref={desktopPanelRef} variant="desktop" {...panelProps} />
        </aside>
      ) : (
        <div className="hidden lg:block lg:w-[12px]" aria-hidden="true" />
      )}

      {/* Mobile: full-height left drawer */}
      <div
        className={cn(
          "fixed inset-0 z-50 lg:hidden",
          drawerOpen ? "" : "pointer-events-none",
        )}
        aria-hidden={!drawerOpen}
      >
        <div
          onClick={() => setDrawerOpen(false)}
          className={cn(
            "absolute inset-0 bg-black/50 transition-opacity motion-reduce:transition-none",
            drawerOpen ? "opacity-100" : "opacity-0",
          )}
        />
        <div
          role="dialog"
          aria-modal={drawerOpen}
          aria-label="Chat history"
          className={cn(
            "absolute inset-y-0 left-0 flex w-[88vw] max-w-sm flex-col border-r bg-background shadow-xl transition-transform motion-reduce:transition-none",
            drawerOpen ? "translate-x-0" : "-translate-x-full",
          )}
          style={{
            paddingTop: "env(safe-area-inset-top)",
            paddingBottom: "env(safe-area-inset-bottom)",
          }}
        >
          <div className="min-h-0 flex-1 p-2">
            <HistoryPanel
              ref={mobilePanelRef}
              variant="mobile"
              {...panelProps}
              onOpenChat={(id) => {
                openChat(id);
                setDrawerOpen(false);
              }}
            />
          </div>
        </div>
      </div>

      {/* Chat pane */}
      <div className="mx-auto flex h-full w-full min-w-0 flex-1 flex-col lg:max-w-[calc(100%-12px)] lg:mr-auto lg:flex-[1]">
        <ChatHeader
          title={title}
          hasChat={hasChat}
          pinned={conversation?.pinned ?? false}
          project={activeProject}
          projects={projects}
          panelOpen={panelOpen}
          prefs={prefs}
          onPrefsChange={setPrefs}
          onToggleHistory={() => {
            if (typeof window !== "undefined" && window.innerWidth < 1024) {
              setDrawerOpen((open) => !open);
            } else {
              setPanelOpen((open) => !open);
            }
          }}
          onNewChat={startNewChat}
          onRenameChat={renameActiveChat}
          onTogglePin={() =>
            activeId && togglePin(activeId, !(conversation?.pinned ?? false))
          }
          onMoveChat={(projectId) => activeId && moveChat(activeId, projectId)}
          onNewProjectForChat={() =>
            setNewProjectDialog({ moveChatId: activeId ?? undefined })
          }
          onExport={exportChat}
          onDeleteChat={() => activeId && deleteChat(activeId)}
          readOnly={readOnly}
        />

        {/* Read-only notice while an admin is viewing another student's
        account. Quiet, non-blocking, and never reveals message content. */}
        {readOnly && target ? (
          <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2 text-xs">
            <p className="min-w-0 flex-1 truncate text-muted-foreground">
              <span className="font-semibold text-foreground">Viewing </span>
              <span className="font-semibold text-primary">
                {target.name || target.email || "this account"}
              </span>
              <span className="text-muted-foreground">· read-only</span>
            </p>
          </div>
        ) : null}

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

        {chatNotFound ? (
          <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2 text-xs text-muted-foreground">
            <span>That chat couldn’t be found — opening a new one.</span>
            <button
              type="button"
              aria-label="Dismiss"
              className="cursor-pointer rounded p-0.5 hover:text-foreground"
              onClick={() => setChatNotFound(false)}
            >
              <X className="size-3.5" aria-hidden />
            </button>
          </div>
        ) : null}

        {/* Message area: full-width pane scrollbar, centered message column */}
        <div className="relative flex min-h-0 flex-1 flex-col">
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className={cn(
              "flex-1 overflow-y-auto px-6" + (prefs.density === "compact" ? " py-2" : " py-4"),
            )}
          >
            <div className="mx-auto w-full max-w-[820px] lg:max-w-[920px]">
              {conversationLoading ? (
              <div className="space-y-4">
                {[0, 1, 2].map((index) => (
                  <div key={index} className="flex items-start gap-3">
                    <Skeleton className="size-8 shrink-0 rounded-full" />
                    <Skeleton className="h-16 flex-1" />
                  </div>
                ))}
              </div>
            ) : messages.length === 0 ? (
              <WelcomeScreen
                onPick={(prompt) => {
                  setDraft(prompt);
                  textareaRef.current?.focus();
                }}
              />
            ) : (
              <ul className={cn("px-0.5", listSpacing, scaleClass)}>
                {messages.map((message, index) => {
                  const isLast = index === messages.length - 1;

                  if (message.role === "user") {
                    const isLastUser = message.id === lastUserMessage?.id;
                    return (
                      <li key={message.id} className="flex justify-end">
                        <div className="max-w-[85%] space-y-2">
                          {message.images?.length ? (
                            <div className="flex justify-end">
                              {message.images.map((image, imageIndex) => (
                                <img
                                  key={`${message.id}-${imageIndex}`}
                                  src={
                                    image.url ??
                                    (image.data
                                      ? `data:${image.mimeType};base64,${image.data}`
                                      : undefined)
                                  }
                                  alt="Image sent to Ashy"
                                  className="max-h-48 max-w-full rounded-lg border object-contain"
                                />
                              ))}
                            </div>
                          ) : null}
                          {message.text ? (
                            <div className="rounded-2xl rounded-tr-md bg-primary px-3.5 py-2.5 break-words whitespace-pre-wrap text-primary-foreground">
                              {message.text}
                            </div>
                          ) : null}
                          {isLastUser && !busy && !editingId ? (
                            <div className="flex justify-end">                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 cursor-pointer gap-1.5 px-2 text-xs text-muted-foreground"
                                    disabled={readOnly}
                                    onClick={() => {
                                      setEditingId(message.id);
                                      setDraft(message.text);
                                      textareaRef.current?.focus();
                                    }}
                                    title={readOnly ? "Read-only while viewing another student's account" : undefined}
                                  >
                                    <Pencil className="size-3.5" aria-hidden />
                                    Edit & resend
                                  </Button>
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
                            {isLast && !busy && !readOnly ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="mt-3 cursor-pointer"
                                onClick={() => void retryLastSend()}
                              >
                                <RefreshCw className="size-3.5" aria-hidden />
                                Retry
                              </Button>
                            ) : null}
                          </div>
                        ) : (
                          <>
                            {message.text ? (
                              <div
                                className={cn(
                                  "rounded-xl border bg-card",
                                  bubblePadding,
                                )}
                              >
                                <MessageContent text={message.text} />
                              </div>
                            ) : null}

                            {/* Search notice: shown once per conversation. */}
                            {message.searchNotice &&
                            index === latestNoticeIndex ? (
                              <p className="px-1 text-[11px] text-muted-foreground">
                                {message.searchNotice}
                              </p>
                            ) : null}

                            {message.videos?.length ? (
                              <div
                                role="list"
                                aria-label="Videos"
                                className="grid grid-cols-1 gap-2 sm:grid-cols-2"
                              >
                                {message.videos.map((video) => (
                                  <AshyVideoCard
                                    key={video.videoId}
                                    video={video}
                                    onPlay={(picked) =>
                                      setPlayer({ video: picked, mode: "full" })
                                    }
                                  />
                                ))}
                              </div>
                            ) : null}

                            {message.videoSearch ? (
                              <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card px-3 py-2 text-xs text-muted-foreground">
                                <span>{message.videoSearch.message}</span>
                                <a
                                  href={youtubeSearchUrl(message.videoSearch.query)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="font-medium text-primary underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                                >
                                  Search on YouTube
                                </a>
                              </div>
                            ) : null}

                            {message.sources?.length ? (
                              <SourcesRow
                                sources={message.sources}
                                searchQueries={message.searchQueries}
                                searchEntryPointUrl={message.searchEntryPointUrl}
                              />
                            ) : null}

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

                              {isLast && !busy && !readOnly ? (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 cursor-pointer gap-1.5 px-2 text-xs text-muted-foreground"
                                  onClick={() => void regenerate()}
                                  title={readOnly ? "Read-only while viewing another student's account" : undefined}
                                >
                                  <RefreshCw className="size-3.5" aria-hidden />
                                  Regenerate
                                </Button>
                              ) : null}
                            </div>

                            {/* Quick-reply chips from the answer. */}
                            {message.chips?.length && isLast && !busy && !readOnly ? (
                              <div className="flex flex-wrap gap-2 pt-0.5">
                                {message.chips.map((chip) => (
                                  <button
                                    key={chip}
                                    type="button"
                                    className="cursor-pointer rounded-full border bg-card px-3 py-1.5 text-xs text-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                                    onClick={() => void sendMessage(chip)}
                                  >
                                    {chip}
                                  </button>
                                ))}
                              </div>
                            ) : null}

                            {/* Plan → one-click "Add week 1 to Missions". */}
                            {message.planMissions?.itemIds.length &&
                            isLast &&
                            !busy ? (
                              <div className="rounded-xl border bg-card p-3">
                                <p className="text-xs font-semibold text-foreground">
                                  Add week 1 targets to Missions?
                                </p>
                                <ul className="mt-1.5 space-y-0.5">
                                  {message.planMissions.labels.map((label, i) => (
                                    <li
                                      key={message.planMissions!.itemIds[i]}
                                      className="text-xs text-muted-foreground"
                                    >
                                      • {label}
                                    </li>
                                  ))}
                                </ul>
                                <div className="mt-2.5 flex items-center gap-2">
                                  <Button
                                    size="sm"
                                    className="h-8 cursor-pointer gap-1.5 px-3 text-xs"
                                    disabled={readOnly}
                                    onClick={() =>
                                      addPlanMissions(message.planMissions!, message.id)
                                    }
                                    title={readOnly ? "Read-only while viewing another student's account" : undefined}
                                  >
                                    <ListChecks className="size-3.5" aria-hidden />
                                    Add {message.planMissions.itemIds.length}{" "}
                                    mission
                                    {message.planMissions.itemIds.length === 1
                                      ? ""
                                      : "s"}
                                  </Button>
                                  {missionsAddedId === message.id ? (
                                    <span className="flex items-center gap-1 text-xs text-primary">
                                      <Check className="size-3.5" aria-hidden />
                                      Added to Missions
                                    </span>
                                  ) : null}
                                </div>
                              </div>
                            ) : null}
                          </>
                        )}
                      </div>
                    </li>
                  );
                })}

                {busyForActive ? (
                  <ThinkingIndicator searching={searchMode !== "off"} />
                ) : null}

                {/* Smart follow-ups after a fresh answer (dismissible). */}
                {smartChipsVisible ? (
                  <li className="flex flex-wrap items-center gap-1.5 pl-11">
                    {SMART_CHIPS.map((chip) => (
                      <button
                        key={chip}
                        type="button"
                        className="cursor-pointer rounded-full border bg-card px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        onClick={() => void sendMessage(chip)}
                      >
                        {chip}
                      </button>
                    ))}
                    <button
                      type="button"
                      aria-label="Dismiss suggestions"
                      onClick={() =>
                        setSmartDismissedFor(lastMessage?.id ?? null)
                      }
                      className="grid size-6 cursor-pointer place-items-center rounded-full text-muted-foreground hover:text-foreground"
                    >
                      <X className="size-3" aria-hidden />
                    </button>
                  </li>
                ) : null}
              </ul>
            )}
          </div>
        </div>
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
              <p className="text-xs font-semibold text-foreground">Ready to send</p>
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
              onClick={() => setAttachOpen(true)}
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

        {/* Compact context row: open-project chip + web-search toggle */}
        <div className="mb-1.5 flex h-8 items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            {editingId ? (
              <span className="inline-flex max-w-56 items-center gap-1 rounded-full border bg-accent px-2 py-0.5 text-[11px] text-muted-foreground">
                <Pencil className="size-3" aria-hidden />
                <span className="truncate">Editing your message</span>
                <button
                  type="button"
                  aria-label="Cancel editing"
                  onClick={() => {
                    setEditingId(null);
                    setDraft("");
                  }}
                  className="cursor-pointer rounded hover:text-foreground"
                >
                  <X className="size-3" aria-hidden />
                </button>
              </span>
            ) : null}
            {newChatProject ? (
              <span className="inline-flex max-w-56 items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                <span className="truncate">
                  in {newChatProject.emoji ? `${newChatProject.emoji} ` : ""}
                  {newChatProject.name}
                </span>
                <button
                  type="button"
                  aria-label="Remove project from new chat"
                  onClick={() => setOpenProjectId(null)}
                  className="cursor-pointer rounded hover:text-foreground"
                >
                  <X className="size-3" aria-hidden />
                </button>
              </span>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() =>
              setSearchMode((mode) =>
                mode === "auto" ? "on" : mode === "on" ? "off" : "auto",
              )
            }
            aria-pressed={searchMode === "on"}
            aria-label={`Search the web: ${searchMode}. Activate to change.`}
            title="Auto: Ashy searches when needed. On: always search. Off: never search."
            className={cn(
              "ml-auto inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              searchMode === "off"
                ? "text-muted-foreground"
                : "border-primary/40 bg-primary/10 text-primary",
            )}
          >
            <Globe className="size-3.5" aria-hidden />
            Search the web:
            <span>
              {searchMode === "auto" ? "Auto" : searchMode === "on" ? "On" : "Off"}
            </span>
          </button>
        </div>

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
            accept={ACCEPTED_IMAGE_MIME_TYPES.join(",")}
            className="hidden"
            onChange={(event) => {
              void handleFile(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
          {/* Second input: native camera capture on mobile/tablet. */}
          <input
            ref={captureInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(event) => {
              void handleFile(event.target.files?.[0], "camera");
              event.target.value = "";
            }}
          />
          <Popover open={attachOpen} onOpenChange={setAttachOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Attach"
                aria-haspopup="menu"
                title={readOnly ? "Read-only while viewing another student's account" : "Attach"}
                className="shrink-0 text-muted-foreground"
                disabled={busy || readOnly}
              >
                <Paperclip className="size-4" aria-hidden />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" sideOffset={8} className="w-56 p-1.5">
              <div role="menu" aria-label="Attach options" className="flex flex-col">
                <button
                  type="button"
                  role="menuitem"
                  onClick={takePhoto}
                  className="flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <Camera className="size-4 text-muted-foreground" aria-hidden />
                  Take photo
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={chooseFromGallery}
                  className="flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <ImageIcon className="size-4 text-muted-foreground" aria-hidden />
                  Choose from gallery
                </button>
              </div>
            </PopoverContent>
          </Popover>

          {canDictate ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={listening ? "Stop listening" : "Speak your question"}
              title={listening ? "Stop listening" : readOnly ? "Read-only while viewing another student's account" : "Speak your question"}
              className={cn(
                "shrink-0",
                listening ? "text-destructive" : "text-muted-foreground",
              )}
              disabled={busy || readOnly}
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
                !event.nativeEvent.isComposing &&
                !isCoarsePointer && // touch: Enter makes a new line
                prefs.enterToSend
              ) {
                event.preventDefault();
                void sendMessage();
              }
            }}
            rows={1}
            placeholder={listening ? "Listening… speak now" : "Type your question…"}
            aria-label="Message Ashy"
            className="max-h-36 min-h-10 flex-1 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
            readOnly={readOnly}
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
              aria-label={editingId ? "Save and resend" : "Send to Ashy"}
              title={editingId ? "Save and resend" : readOnly ? "Read-only while viewing another student's account" : "Send to Ashy"}
              className="shrink-0"
              disabled={!draft.trim() && !pendingImage || readOnly}
            >
              {draft.trim() || pendingImage ? (
                <ArrowDown className="size-4" aria-hidden />
              ) : (
                <Send className="size-4" aria-hidden />
              )}
            </Button>
          )}
        </form>

        <p className="mt-1.5 text-center text-[11px] text-muted-foreground">
          Ashy can make mistakes — check important answers.{" "}
          <Link to="/dashboard" className="text-primary hover:underline">
            Back to Home
          </Link>
        </p>
      </div>

      {/* Rename the open chat */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename chat</DialogTitle>
            <DialogDescription>
              This replaces the auto-generated title.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(event) => setRenameValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                submitRename();
              }
            }}
            maxLength={60}
            autoFocus
            aria-label="Chat title"
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRenameOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={submitRename} disabled={!renameValue.trim()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New project (from the header menu, optionally moving the chat) */}
      <Dialog
        open={newProjectDialog !== null}
        onOpenChange={(open) => {
          if (!open) setNewProjectDialog(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
            <DialogDescription>
              Projects group related chats
              {newProjectDialog?.moveChatId
                ? " — this chat moves into it."
                : "."}{" "}
              Instructions are your own note for Ashy; they never override
              Ashy's rules.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input
                value={newProjectForm.name}
                onChange={(event) =>
                  setNewProjectForm((form) => ({
                    ...form,
                    name: event.target.value,
                  }))
                }
                placeholder="Project name"
                maxLength={60}
                autoFocus
                aria-label="Project name"
                className="flex-1"
              />
              <Input
                value={newProjectForm.emoji}
                onChange={(event) =>
                  setNewProjectForm((form) => ({
                    ...form,
                    emoji: event.target.value,
                  }))
                }
                placeholder="🎓"
                maxLength={8}
                aria-label="Project emoji"
                className="w-20"
              />
            </div>
            <textarea
              value={newProjectForm.instructions}
              onChange={(event) =>
                setNewProjectForm((form) => ({
                  ...form,
                  instructions: event.target.value,
                }))
              }
              placeholder={'Optional instructions, e.g. "Prefer HSC-board examples."'}
              maxLength={2000}
              rows={4}
              aria-label="Project instructions"
              className="w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setNewProjectDialog(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!newProjectForm.name.trim()}
              onClick={() => {
                const dialog = newProjectDialog;
                if (!dialog || !newProjectForm.name.trim()) return;
                void createProject({
                  name: newProjectForm.name.trim(),
                  emoji: newProjectForm.emoji.trim() || undefined,
                  instructions: newProjectForm.instructions.trim() || undefined,
                  moveChatId: dialog.moveChatId,
                });
                setNewProjectForm({ name: "", emoji: "", instructions: "" });
                setNewProjectDialog(null);
              }}
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ImageCropDialog
        open={cropOpen}
        src={cropSrc}
        onClose={() => {
          setCropOpen(false);
          setCropSrc(null);
        }}
        onConfirm={(cropped) => setPendingImage(cropped)}
        onRetake={
          cropFromCamera
            ? () => {
                setCropOpen(false);
                setCropSrc(null);
                openCameraFlow();
              }
            : undefined
        }
      />

      <CameraCaptureDialog
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={(file) => {
          setCameraOpen(false);
          void handleFile(file, "camera");
        }}
        onChooseFromGallery={() => {
          setCameraOpen(false);
          openFilePicker();
        }}
      />

      {/* ONE player instance for both modes. */}
      {player ? (
        <AshyVideoPlayer
          video={player.video}
          mode={player.mode}
          onMinimize={() =>
            setPlayer((current) =>
              current ? { ...current, mode: "mini" } : current,
            )
          }
          onRestore={() =>
            setPlayer((current) =>
              current ? { ...current, mode: "full" } : current,
            )
          }
          onClose={() => setPlayer(null)}
        />
      ) : null}
    </div>
  );
}


