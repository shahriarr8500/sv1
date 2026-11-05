/**
 * Quran text client.
 *
 * Source: AlQuran Cloud (https://alquran.cloud), the same provider the app
 * already used for recitation audio. Arabic always comes from the Tanzil
 * Uthmani edition; the English text is a translation edition fetched
 * alongside it, so an Ayah's translation is the one published for that exact
 * Ayah number — nothing is generated, paraphrased or re-ordered here.
 *
 * Two normalisations are applied, both deterministic and tested:
 *
 *   1. A byte-order mark and stray control characters are stripped.
 *   2. The Uthmani edition prefixes the Bismillah to Ayah 1 of every Surah
 *      except At-Tawbah (and except Al-Fatihah, where it *is* Ayah 1). The
 *      translation editions do not include it, so the prefix is removed from
 *      Ayah 1 to keep Arabic and English aligned; the page renders the
 *      Bismillah once as an opening line instead. If the prefix does not match
 *      exactly, the text is left untouched rather than guessed at.
 */

import type { TranslationEdition } from "@/lib/student-os/quran";

const API_BASE = "https://api.alquran.cloud/v1";
const ARABIC_EDITION = "quran-uthmani";
const TRANSLITERATION_EDITION = "en.transliteration";

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

export interface AyahText {
  /** Ayah number inside its Surah (1-based). */
  numberInSurah: number;
  arabic: string;
  translation: string;
  /** Roman transliteration, when the provider supplies it. */
  transliteration: string;
}

export interface SurahText {
  surah: number;
  translation: string;
  ayahs: AyahText[];
}

export interface SurahMeta {
  number: number;
  /** Arabic name exactly as published, e.g. سُورَةُ البَقَرَةِ. */
  arabicName: string;
  englishName: string;
  englishNameTranslation: string;
  ayahCount: number;
  revelation: string;
}

/* -------------------------------------------------------------------------- */
/* Arabic normalisation                                                        */
/* -------------------------------------------------------------------------- */

const HARAKAT = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640\uFEFF]/g;

/** Diacritic-insensitive form, used only to recognise the Bismillah prefix. */
export function normalizeArabic(value: string): string {
  return value
    .replace(HARAKAT, "")
    .replace(/[\u0622\u0623\u0625\u0671]/g, "\u0627")
    .replace(/\u0649/g, "\u064A")
    .replace(/\u0629/g, "\u0647")
    .replace(/\s+/g, " ")
    .trim();
}

const BISMILLAH_WORDS = ["بسم", "الله", "الرحمن", "الرحيم"];

/** Strips control characters and the byte-order mark the API sometimes sends. */
export function cleanText(value: string): string {
  return value
    .replace(/\p{Cc}/gu, "")
    .replace(/\uFEFF/g, "")
    .trim();
}

/**
 * Removes a leading Bismillah from Ayah 1 while leaving every other Ayah — and
 * Al-Fatihah, where the Bismillah is Ayah 1 itself — untouched.
 */
export function stripBismillahPrefix(text: string, surah: number): string {
  const cleaned = cleanText(text);
  if (surah === 1) return cleaned;

  const words = cleaned.split(/\s+/);
  // Only strip when real Ayah text follows the four Bismillah words.
  if (words.length <= BISMILLAH_WORDS.length) return cleaned;

  const head = words
    .slice(0, BISMILLAH_WORDS.length)
    .map((word) => normalizeArabic(word));
  if (head.join(" ") !== BISMILLAH_WORDS.join(" ")) return cleaned;

  return words.slice(BISMILLAH_WORDS.length).join(" ");
}

/* -------------------------------------------------------------------------- */
/* Parsing (pure — the shape of the API is verified before use)                */
/* -------------------------------------------------------------------------- */

interface ApiEdition {
  text?: unknown;
  numberInSurah?: unknown;
  ayahs?: unknown;
  edition?: { identifier?: unknown };
  numberOfAyahs?: unknown;
  name?: unknown;
  englishName?: unknown;
  englishNameTranslation?: unknown;
  revelationType?: unknown;
  number?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function editionList(payload: unknown): ApiEdition[] {
  if (!isRecord(payload))
    throw new Error("Unexpected response from the Quran service.");
  if (payload.code !== 200) {
    throw new Error("The Quran service did not return this Surah.");
  }
  const data = payload.data;
  if (!Array.isArray(data)) {
    throw new Error("The Quran service returned an unexpected format.");
  }
  return data as ApiEdition[];
}

function findEdition(list: ApiEdition[], identifier: string): ApiEdition {
  const match = list.find(
    (entry) =>
      isRecord(entry.edition) && entry.edition.identifier === identifier,
  );
  if (!match || !Array.isArray(match.ayahs)) {
    throw new Error(`The ${identifier} edition is unavailable right now.`);
  }
  return match;
}

/**
 * Validates the Surah payload and pairs each Arabic Ayah with the translated
 * Ayah of the same `numberInSurah`. A length or numbering mismatch is an error,
 * never a partially rendered Surah.
 */
export function parseSurahText(
  payload: unknown,
  surah: number,
  translation: TranslationEdition,
): SurahText {
  const list = editionList(payload);
  const arabic = findEdition(list, ARABIC_EDITION);
  const translated = findEdition(list, translation.id);

  const arabicAyahs = arabic.ayahs as Array<{
    text?: unknown;
    numberInSurah?: unknown;
  }>;
  const translatedAyahs = translated.ayahs as Array<{
    text?: unknown;
    numberInSurah?: unknown;
  }>;

  let transliterationAyahs: Array<{ text?: unknown; numberInSurah?: unknown }> =
    [];
  try {
    transliterationAyahs = findEdition(list, TRANSLITERATION_EDITION)
      .ayahs as Array<{ text?: unknown; numberInSurah?: unknown }>;
  } catch {
    // Transliteration is optional; the reading view simply omits it.
  }

  const declared = arabic.numberOfAyahs;
  if (
    typeof declared === "number" &&
    (arabicAyahs.length !== declared || translatedAyahs.length !== declared)
  ) {
    throw new Error("This Surah arrived incomplete. Please try again.");
  }

  const byNumber = new Map<number, string>();
  for (const ayah of translatedAyahs) {
    const number = Number(ayah.numberInSurah);
    if (Number.isInteger(number) && typeof ayah.text === "string") {
      byNumber.set(number, cleanText(ayah.text));
    }
  }

  const transliterationByNumber = new Map<number, string>();
  for (const ayah of transliterationAyahs) {
    const number = Number(ayah.numberInSurah);
    if (Number.isInteger(number) && typeof ayah.text === "string") {
      transliterationByNumber.set(number, cleanText(ayah.text));
    }
  }

  const ayahs: AyahText[] = [];
  for (const [index, ayah] of arabicAyahs.entries()) {
    const numberInSurah = Number(ayah.numberInSurah);
    const expected = index + 1;
    if (numberInSurah !== expected) {
      throw new Error(
        "This Surah's Ayah order did not match. Please try again.",
      );
    }
    if (typeof ayah.text !== "string" || ayah.text.trim() === "") {
      throw new Error("An Ayah came back empty. Please try again.");
    }
    const english = byNumber.get(numberInSurah);
    if (english === undefined) {
      throw new Error("A translation is missing for one of these Ayahs.");
    }
    ayahs.push({
      numberInSurah,
      arabic: stripBismillahPrefix(ayah.text, surah),
      translation: english,
      transliteration: transliterationByNumber.get(numberInSurah) ?? "",
    });
  }

  if (ayahs.length === 0) throw new Error("This Surah came back empty.");
  return { surah, translation: translation.id, ayahs };
}

export function parseSurahIndex(payload: unknown): SurahMeta[] {
  const list = editionList(payload);
  const metas: SurahMeta[] = [];
  for (const entry of list) {
    const number = Number(entry.number);
    const ayahCount = Number(entry.numberOfAyahs);
    if (!Number.isInteger(number) || !Number.isInteger(ayahCount)) continue;
    metas.push({
      number,
      arabicName: typeof entry.name === "string" ? cleanText(entry.name) : "",
      englishName:
        typeof entry.englishName === "string" ? entry.englishName : "",
      englishNameTranslation:
        typeof entry.englishNameTranslation === "string"
          ? entry.englishNameTranslation
          : "",
      ayahCount,
      revelation:
        typeof entry.revelationType === "string" ? entry.revelationType : "",
    });
  }
  if (metas.length !== 114) {
    throw new Error("The Surah index arrived incomplete. Please try again.");
  }
  return metas.sort((a, b) => a.number - b.number);
}

/* -------------------------------------------------------------------------- */
/* Network                                                                     */
/* -------------------------------------------------------------------------- */

async function requestJson(
  url: string,
  signal?: AbortSignal,
): Promise<unknown> {
  const response = await fetch(url, {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(
      response.status >= 500
        ? "The Quran service is unavailable right now. Please try again shortly."
        : "The Quran service rejected this request. Please try again.",
    );
  }
  return response.json();
}

export async function fetchSurahIndex(
  signal?: AbortSignal,
): Promise<SurahMeta[]> {
  return parseSurahIndex(await requestJson(`${API_BASE}/surah`, signal));
}

export async function fetchSurahText(
  surah: number,
  translation: TranslationEdition,
  signal?: AbortSignal,
): Promise<SurahText> {
  const editions = [
    ARABIC_EDITION,
    translation.id,
    TRANSLITERATION_EDITION,
  ].join(",");
  const payload = await requestJson(
    `${API_BASE}/surah/${surah}/editions/${editions}`,
    signal,
  );
  return parseSurahText(payload, surah, translation);
}

/** Reference used for copying and sharing, e.g. "Al-Baqarah 2:255". */
export function ayahReference(
  surahName: string,
  surah: number,
  ayah: number,
): string {
  return `${surahName} ${surah}:${ayah}`;
}
