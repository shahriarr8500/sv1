/**
 * Ashy client helpers — types, history building, and voice utilities.
 *
 * The conversation lives entirely in the Ashy page for V1 (a reliable
 * current-session history rather than a backend chat store), so this module
 * only holds pure helpers shared by the page and its components.
 */

export type AshyFailureKind =
  | "unauthorized"
  | "quota"
  | "unavailable"
  | "blocked"
  | "invalidImage";

export interface AshyImage {
  /** MIME type: image/png, image/jpeg, image/webp, image/gif. */
  mimeType: string;
  /** Base64 payload WITHOUT the data: prefix. */
  data: string;
}

export interface AshyMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  images?: AshyImage[];
  /** Set on assistant messages that represent a failure instead of an answer. */
  error?: AshyFailureKind;
  /** Real YouTube results the backend searched for (never invented). */
  videos?: AshyVideo[];
  /** Set when the video search itself failed — carries fallback copy + query. */
  videoSearch?: AshyVideoSearchFailure;
  /** Google Search sources backing a searched answer. */
  sources?: AshySource[];
  /** The Google Search queries the model ran for this answer. */
  searchQueries?: string[];
  /** Honest note about skipped/failed/rate-limited web search. */
  searchNotice?: string;
  /** True when the answer was grounded in live Google Search results. */
  grounded?: boolean;
  /** Google's Search-suggestions entry point (a plain link). */
  searchEntryPointUrl?: string;
  /** Quick-reply chips (e.g. the planning clarifying questions). */
  chips?: string[];
  /** Real syllabus item ids/labels of week 1 — "Add to Missions" button. */
  planMissions?: { itemIds: string[]; labels: string[] };
  /** Which limit produced the notice: the app's per-user cap or Gemini's 429. */
  searchNoticeKind?: "userLimit" | "providerQuota" | "other";
}

/** One real, backend-searched YouTube video. */
export interface AshyVideo {
  videoId: string;
  title: string;
  channel: string;
  thumbnail: string;
  durationLabel: string;
}

export interface AshyVideoSearchFailure {
  query: string;
  ok: false;
  message: string;
}

export interface AshySource {
  title: string;
  url: string;
  domain: string;
}

/** One turn as the server-side action expects it. */
export interface AshyTurn {
  role: "user" | "model";
  text: string;
  images?: AshyImage[];
}

export interface AshyConversation {
  id: string;
  title: string;
  messages: AshyMessage[];
}

/** Friendly copy for every failure the backend can report. */
export const ASHY_FAILURE_COPY: Record<AshyFailureKind, string> = {
  unauthorized: "Ashy is only available to signed-in students.",
  quota: "Ashy has reached its current usage limit. Please try again later.",
  unavailable: "Ashy is temporarily unavailable. Please try again in a moment.",
  blocked: "Ashy couldn't answer that. Try rephrasing your question a little.",
  invalidImage:
    "That image couldn't be read. Please attach it again as a PNG, JPEG or WebP and retry.",
};

export function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

/**
 * Converts on-screen messages into Gemini turns. Failed assistant turns are
 * dropped (they carry no content), and the tail is capped so one very long
 * session can never blow past the request limits.
 */
export function buildHistory(
  messages: AshyMessage[],
  maxTurns = 30,
): AshyTurn[] {
  const usable = messages.filter(
    (message) => !message.error && (message.text.trim() !== "" || (message.images?.length ?? 0) > 0),
  );
  return usable.slice(-maxTurns).map((message) => {
    const turn: AshyTurn = {
      role: message.role === "user" ? "user" : "model",
      text: message.text,
    };
    if (message.images && message.images.length > 0) {
      turn.images = message.images;
    }
    return turn;
  });
}

/** Suggested prompts for the welcome screen (inserted, never auto-sent). */
export const ASHY_STARTERS: string[] = [
  "What is Newton's second law?",
  "Help me solve 2x² + 5x − 3 = 0",
  "Explain this chemistry reaction step by step",
  "Give me 5 practice problems on vectors",
];

/** Plain text for speech output: strips code blocks, math delimiters, etc. */
export function toSpeechText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " code snippet removed. ")
    .replace(/\$\$[\s\S]*?\$\$/g, " ")
    .replace(/\$[^$]+\$/g, (match) => match.slice(1, -1).replace(/\\[a-zA-Z]+/g, " "))
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/[*_~|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/* -------------------------------------------------------------------------- */
/* Voice input (Web Speech API)                                               */
/* -------------------------------------------------------------------------- */

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    0: { transcript: string };
  }>;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
}

function getSpeechRecognition(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function speechInputSupported(): boolean {
  return getSpeechRecognition() !== null;
}

export function speechOutputSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/**
 * Dictation session. The transcript is collected here and handed back as a
 * draft — voice never sends anything by itself.
 */
export function createDictation(options: {
  onPartial?: (text: string) => void;
  onFinished: (text: string) => void;
  onStopped: () => void;
}): { start: () => void; stop: () => void } | null {
  const Ctor = getSpeechRecognition();
  if (!Ctor) return null;

  let instance: SpeechRecognitionLike | null = null;
  let collected = "";

  return {
    start() {
      collected = "";
      const recognition = new Ctor();
      recognition.lang = "en-US";
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.onresult = (event) => {
        let interim = "";
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const result = event.results[i];
          if (result.isFinal) collected += `${result[0].transcript} `;
          else interim += result[0].transcript;
        }
        options.onPartial?.(`${collected}${interim}`.trim());
      };
      recognition.onerror = () => {
        instance = null;
        options.onStopped();
      };
      recognition.onend = () => {
        instance = null;
        const finalText = collected.trim();
        if (finalText) options.onFinished(finalText);
        else options.onStopped();
      };
      instance = recognition;
      try {
        recognition.start();
      } catch {
        instance = null;
        options.onStopped();
      }
    },
    stop() {
      try {
        instance?.stop();
      } catch {
        instance = null;
        options.onStopped();
      }
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Voice output (speech synthesis)                                            */
/* -------------------------------------------------------------------------- */

export function stopSpeaking(): void {
  if (!speechOutputSupported()) return;
  window.speechSynthesis.cancel();
}

/** Reads a message aloud. Returns false when speech is unavailable. */
export function speakText(text: string, onDone: () => void): boolean {
  if (!speechOutputSupported()) return false;
  // Cancelling first makes this a toggle-friendly "replace whatever is playing".
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(toSpeechText(text));
  utterance.rate = 1;
  utterance.onend = onDone;
  utterance.onerror = onDone;
  window.speechSynthesis.speak(utterance);
  return true;
}
