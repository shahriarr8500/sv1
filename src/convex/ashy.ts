"use node";

/**
 * Ashy — the Student OS study assistant, backed by Google's Gemini API.
 *
 * The Gemini key lives only here, in a Convex **server-side** environment
 * variable (`GEMINI_API_KEY`). It is never shipped to the browser, never
 * read through a `VITE_` variable, and never returned to the client. The
 * model is also configurable server-side (`GEMINI_MODEL`) so it can be
 * swapped later without touching the app.
 *
 * Everything the client ever sees is either the model's text or one of the
 * friendly messages below — raw provider errors, stack traces and keys stay
 * on the server.
 */

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { action } from "./_generated/server";

/** Google's current recommendation for new projects (verified Oct 2026). */
const DEFAULT_MODEL = "gemini-3.5-flash-lite";
const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

/* Input limits — generous for study use, tight enough to stay safe. */
const MAX_HISTORY = 40;
const MAX_TEXT_CHARS = 12_000;
const MAX_IMAGES_TOTAL = 8;
const MAX_IMAGE_CHARS = 4_000_000; // ~3 MB binary, base64 encoded
const ALLOWED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
];

type FailureKind =
  | "unauthorized"
  | "quota"
  | "unavailable"
  | "blocked"
  | "invalidImage";

const FAILURE_MESSAGES: Record<FailureKind, string> = {
  unauthorized: "Ashy is only available to signed-in students.",
  quota: "Ashy has reached its current usage limit. Please try again later.",
  unavailable: "Ashy is temporarily unavailable. Please try again in a moment.",
  blocked:
    "Ashy couldn't answer that. Try rephrasing your question a little.",
  invalidImage:
    "That image couldn't be read. Please attach it again as a PNG, JPEG or WebP and retry.",
};

type Result =
  | { ok: true; text: string }
  | { ok: false; kind: FailureKind; message: string };

function fail(kind: FailureKind): Result {
  return { ok: false, kind, message: FAILURE_MESSAGES[kind] };
}

/**
 * Provider detail that is safe to write to the backend logs: API keys are
 * redacted and the line is capped. Nothing here ever reaches the client.
 */
function sanitizeLog(detail: unknown): string {
  const raw =
    typeof detail === "string" ? detail : JSON.stringify(detail) ?? String(detail);
  return raw.replace(/AIza[0-9A-Za-z_-]{10,}/g, "[redacted]").slice(0, 500);
}

interface ChatImage {
  mimeType: string;
  data: string;
}

interface ChatTurn {
  role: "user" | "model";
  text: string;
  images?: ChatImage[];
}

const turnValidator = v.object({
  role: v.union(v.literal("user"), v.literal("model")),
  text: v.string(),
  images: v.optional(
    v.array(
      v.object({
        mimeType: v.string(),
        data: v.string(),
      }),
    ),
  ),
});

const SYSTEM_PROMPT = `You are Ashy, the built-in study assistant inside Student OS — a focused academic app for students.

Personality:
- Friendly, intelligent, patient, calm and academically focused.
- Concise when the question is simple; detailed when it genuinely needs depth.
- Never corporate, never childish, never an over-enthusiastic salesperson.

Teaching style:
- For academic problems prefer step-by-step understanding: given information, formula, substitution, calculation, final answer, then a one-line explanation.
- If the student explicitly asks for a short answer, give one.
- Match depth to the request. "What is Avogadro's number?" deserves one sentence, not a lecture.
- Use the student's real subject context when it is provided; never invent syllabus content that was not given.

Formatting:
- Answer in Markdown: short headings, bullet points and numbered steps instead of walls of text.
- Write mathematics in LaTeX delimiters: inline as $x^2 + 5x - 3 = 0$, display math on its own line inside $$ ... $$.
- Use chemical formulas with normal subscripts in LaTeX, e.g. $\\text{H}_2\\text{O}$, and code blocks for code.
- Never fabricate data, marks, dates or syllabus structure.

You help with Mathematics, Physics, Chemistry, Biology, ICT, English and general academic questions.

Images:
- When a student sends a photo of a question, work from what is actually visible in the image.
- If the image is blurry, too small, or the question is cut off, ask the student to upload a clearer crop instead of guessing.
- Never invent numbers, text, diagrams or syllabus details you cannot read clearly.
- Keep answering follow-up questions about an image already in the conversation as if it were still in front of you.`;

/** Maps an HTTP status from Gemini onto a friendly failure. */
function kindForStatus(status: number): FailureKind {
  if (status === 429) return "quota";
  if (status === 401 || status === 403) return "unavailable";
  return "unavailable";
}

/**
 * Identifies an image from the magic bytes of its base64 payload, so the
 * backend never has to trust the MIME type the client claims. Returns the
 * image's MIME type, or null when the bytes are not a recognizable image.
 */
function detectImageMime(base64: string): string | null {
  const head = Buffer.from(base64.slice(0, 32), "base64");
  if (head.length < 12) return null;
  // PNG signature: 89 50 4E 47 0D 0A 1A 0A
  if (
    head[0] === 0x89 &&
    head[1] === 0x50 &&
    head[2] === 0x4e &&
    head[3] === 0x47
  ) {
    return "image/png";
  }
  // JPEG: FF D8 FF
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) {
    return "image/jpeg";
  }
  // GIF87a / GIF89a
  if (head.toString("latin1", 0, 4).startsWith("GIF8")) return "image/gif";
  // WEBP: "RIFF" .... "WEBP"
  if (
    head.toString("latin1", 0, 4) === "RIFF" &&
    head.toString("latin1", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

export const chat = action({
  args: {
    history: v.array(turnValidator),
    /** Minimal study context (subject/chapter/topic) — never raw user data. */
    context: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args: { history: ChatTurn[]; context?: string },
  ): Promise<Result> => {
    // --- Authentication -------------------------------------------------
    // The route is already behind RequireAuth; this re-checks server-side so
    // a hand-rolled request can never reach the model anonymously.
    const identity = await getAuthUserId(ctx);
    if (identity === null) return fail("unauthorized");

    const key = process.env.GEMINI_API_KEY?.trim();
    if (!key) {
      console.error("[ashy] GEMINI_API_KEY is not set on this deployment.");
      return fail("unavailable");
    }

    // --- Validation -----------------------------------------------------
    if (args.history.length === 0 || args.history.length > MAX_HISTORY) {
      return fail("unavailable");
    }

    let imagesLeft = MAX_IMAGES_TOTAL;
    // Walk newest → oldest so the image the student just attached can never be
    // the one that gets dropped: the multimodal budget is spent on recent
    // turns first, and only older images are trimmed from context when it runs
    // out. An image we cannot identify from its bytes fails the request loudly
    // instead of being silently ignored.
    const contents: Array<
      { role: "user" | "model"; parts: Array<Record<string, unknown>> } | null
    > = new Array(args.history.length).fill(null);

    for (let i = args.history.length - 1; i >= 0; i -= 1) {
      const turn = args.history[i];
      const parts: Array<Record<string, unknown>> = [];
      const text = turn.text.slice(0, MAX_TEXT_CHARS).trim();
      if (text) parts.push({ text });

      for (const image of turn.images ?? []) {
        if (image.data.length === 0 || image.data.length > MAX_IMAGE_CHARS) {
          return fail("invalidImage");
        }
        // MIME type comes from the bytes themselves, never from the client.
        const mime = detectImageMime(image.data);
        if (!mime || !ALLOWED_IMAGE_TYPES.includes(mime)) {
          return fail("invalidImage");
        }
        if (imagesLeft <= 0) continue; // older image — trimmed from context
        imagesLeft -= 1;
        parts.push({
          inline_data: { mime_type: mime, data: image.data },
        });
      }

      // A turn left with nothing (an image-only turn past the budget) is
      // dropped from the payload rather than failing the whole conversation.
      if (parts.length > 0) contents[i] = { role: turn.role, parts };
    }

    const cleanContents = contents.filter(
      (entry): entry is NonNullable<(typeof contents)[number]> => entry !== null,
    );
    if (cleanContents.length === 0) return fail("unavailable");

    const context = args.context?.trim().slice(0, 600);
    const body: Record<string, unknown> = {
      systemInstruction: {
        parts: [
          {
            text: context
              ? `${SYSTEM_PROMPT}\n\nCurrent Student OS study context (use only if relevant):\n${context}`
              : SYSTEM_PROMPT,
          },
        ],
      },
      contents: cleanContents,
      generationConfig: { temperature: 0.6 },
    };

    // --- Call Gemini (single attempt, no automatic retries) -------------
    const model = process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
    let response: Response;
    try {
      response = await fetch(
        `${API_BASE}/${encodeURIComponent(model)}:generateContent`,
        {
          method: "POST",
          // The key goes in a header, never in the JSON body: the Generative
          // Language API rejects unknown body fields with 400 INVALID_ARGUMENT
          // ("Unknown name \"key\""), which used to surface as a generic
          // "temporarily unavailable" failure.
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": key,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(60_000),
        },
      );
    } catch (error) {
      console.error(`[ashy] Gemini request error: ${sanitizeLog(error)}`);
      return fail("unavailable");
    }

    if (!response.ok) {
      let detail = "";
      try {
        const payload = (await response.json()) as {
          error?: { status?: string; message?: string };
        };
        detail = [payload.error?.status, payload.error?.message]
          .filter(Boolean)
          .join(" — ");
      } catch {
        // Non-JSON error body; the status alone still identifies the failure.
      }
      console.error(`[ashy] Gemini HTTP ${response.status}: ${sanitizeLog(detail)}`);
      return fail(kindForStatus(response.status));
    }

    try {
      const payload = (await response.json()) as {
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string }> };
          finishReason?: string;
        }>;
      };
      const candidate = payload.candidates?.[0];
      const text = (candidate?.content?.parts ?? [])
        .map((part) => part.text ?? "")
        .join("")
        .trim();
      if (!text) return fail("blocked");
      return { ok: true, text };
    } catch {
      return fail("unavailable");
    }
  },
});
