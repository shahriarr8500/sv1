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

type FailureKind = "unauthorized" | "quota" | "unavailable" | "blocked";

const FAILURE_MESSAGES: Record<FailureKind, string> = {
  unauthorized: "Ashy is only available to signed-in students.",
  quota: "Ashy has reached its current usage limit. Please try again later.",
  unavailable: "Ashy is temporarily unavailable. Please try again in a moment.",
  blocked:
    "Ashy couldn't answer that. Try rephrasing your question a little.",
};

type Result =
  | { ok: true; text: string }
  | { ok: false; kind: FailureKind; message: string };

function fail(kind: FailureKind): Result {
  return { ok: false, kind, message: FAILURE_MESSAGES[kind] };
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

You help with Mathematics, Physics, Chemistry, Biology, ICT, English and general academic questions.`;

/** Maps an HTTP status from Gemini onto a friendly failure. */
function kindForStatus(status: number): FailureKind {
  if (status === 429) return "quota";
  if (status === 401 || status === 403) return "unavailable";
  return "unavailable";
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
    if (!key) return fail("unavailable");

    // --- Validation -----------------------------------------------------
    if (args.history.length === 0 || args.history.length > MAX_HISTORY) {
      return fail("unavailable");
    }

    let imagesLeft = MAX_IMAGES_TOTAL;
    const contents = args.history.map((turn) => {
      const parts: Array<Record<string, unknown>> = [];
      const text = turn.text.slice(0, MAX_TEXT_CHARS).trim();
      if (text) parts.push({ text });

      for (const image of turn.images ?? []) {
        if (imagesLeft <= 0) break;
        if (
          !ALLOWED_IMAGE_TYPES.includes(image.mimeType) ||
          image.data.length === 0 ||
          image.data.length > MAX_IMAGE_CHARS
        ) {
          return null; // whole turn rejected below
        }
        imagesLeft -= 1;
        parts.push({
          inline_data: { mime_type: image.mimeType, data: image.data },
        });
      }

      if (parts.length === 0) return null;
      return { role: turn.role, parts };
    });

    if (contents.some((entry) => entry === null)) return fail("unavailable");
    const cleanContents = contents.filter(
      (entry): entry is NonNullable<typeof entry> => entry !== null,
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
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...body, key }),
          signal: AbortSignal.timeout(60_000),
        },
      );
    } catch {
      return fail("unavailable");
    }

    if (!response.ok) {
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
