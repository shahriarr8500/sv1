/**
 * Tests for the Quran reading domain: the Surah table, per-Ayah audio
 * addressing, the Bismillah rules, and the parsing that pairs Arabic with the
 * correct English translation.
 *
 * Run with:  bun src/tests/quran.test.ts
 * Exit code 0 = all assertions passed.
 *
 * The API payloads below are trimmed copies of real AlQuran Cloud responses
 * (Uthmani Arabic + Saheeh International), including the Bismillah prefix the
 * Uthmani edition puts on Ayah 1 — the exact case the reader has to normalise.
 */

import {
  DEFAULT_RECITER,
  DEFAULT_TRANSLATION,
  RECITERS,
  SURAHS,
  TOTAL_AYAHS,
  TRANSLATIONS,
  ayahAudioUrl,
  ayahCount,
  firstGlobalAyah,
  getReciter,
  getSurah,
  getTranslation,
  globalAyahNumber,
  showsSeparateBismillah,
  surahName,
} from "../lib/student-os/quran";
import {
  cleanText,
  normalizeArabic,
  parseSurahIndex,
  parseSurahText,
  stripBismillahPrefix,
} from "../lib/student-os/quran-text";
import {
  ARABIC_SIZE_RANGE,
  DEFAULT_QURAN_PREFS,
  QURAN_PREFS_KEY,
  normalizeQuranPrefs,
  readQuranPrefs,
  writeQuranPrefs,
} from "../lib/student-os/quran-prefs";

let checks = 0;
let failures = 0;

function assert(condition: boolean, label: string): void {
  checks += 1;
  if (!condition) {
    failures += 1;
    console.error(`FAIL  ${label}`);
  }
}

/* -------------------------------------------------------------------------- */
/* 1. The Surah table                                                          */
/* -------------------------------------------------------------------------- */

assert(SURAHS.length === 114, "there are exactly 114 Surahs");
assert(
  SURAHS.every((surah, index) => surah.number === index + 1),
  "Surah numbers run 1…114 in order",
);
assert(
  SURAHS.reduce((sum, surah) => sum + surah.ayahs, 0) === TOTAL_AYAHS,
  "the Ayah counts add up to the 6236 Ayahs of the Quran",
);
assert(getSurah(1)?.ayahs === 7, "Al-Fatihah has 7 Ayahs");
assert(getSurah(2)?.ayahs === 286, "Al-Baqarah has 286 Ayahs");
assert(getSurah(9)?.ayahs === 129, "At-Tawbah has 129 Ayahs");
assert(getSurah(114)?.ayahs === 6, "An-Nas has 6 Ayahs");
assert(
  getSurah(1)?.name === "Al-Fatihah",
  "Surah names are the published ones",
);
assert(getSurah(0) === undefined, "Surah 0 does not exist");
assert(getSurah(115) === undefined, "Surah 115 does not exist");
assert(surahName(9) === "At-Tawbah", "surahName resolves a known Surah");
assert(
  surahName(200) === "Surah 200",
  "an unknown number has a readable fallback",
);

/* -------------------------------------------------------------------------- */
/* 2. Running Ayah numbers — how audio files are addressed                     */
/* -------------------------------------------------------------------------- */

assert(firstGlobalAyah(1) === 1, "Al-Fatihah starts at Ayah 1");
assert(firstGlobalAyah(2) === 8, "Al-Baqarah starts at running Ayah 8");
assert(firstGlobalAyah(9) === 1236, "At-Tawbah starts at running Ayah 1236");
assert(firstGlobalAyah(114) === 6231, "An-Nas starts at running Ayah 6231");
assert(globalAyahNumber(1, 1) === 1, "1:1 is running Ayah 1");
assert(globalAyahNumber(1, 7) === 7, "1:7 is running Ayah 7");
assert(globalAyahNumber(2, 1) === 8, "2:1 is running Ayah 8");
assert(
  globalAyahNumber(2, 255) === 262,
  "2:255 (Ayat al-Kursi) is running Ayah 262",
);
assert(
  globalAyahNumber(114, 6) === 6236,
  "114:6 is the last Ayah of the Quran",
);
assert(ayahCount(2) === 286, "ayahCount reads the Surah table");
assert(ayahCount(999) === 0, "an unknown Surah has no Ayahs");

assert(
  ayahAudioUrl(1, 1) ===
    "https://cdn.islamic.network/quran/audio/128/ar.alafasy/1.mp3",
  "Ayah audio URL uses the running Ayah number",
);
assert(
  ayahAudioUrl(2, 255).endsWith("/262.mp3"),
  "2:255 points at the 262nd Ayah file",
);
assert(
  ayahAudioUrl(2, 255, "ar.husary").includes("/ar.husary/262.mp3"),
  "the reciter is part of the audio path",
);
assert(
  ayahAudioUrl(1, 1) !== ayahAudioUrl(1, 2),
  "consecutive Ayahs never share a file",
);

assert(RECITERS.length >= 4, "several verified reciters are offered");
assert(
  RECITERS.every((reciter) => reciter.id.startsWith("ar.")),
  "reciter ids are CDN path segments",
);
assert(
  getReciter("nope").id === DEFAULT_RECITER,
  "an unknown reciter falls back safely",
);

/* -------------------------------------------------------------------------- */
/* 3. Translations, Bismillah rules, normalisation                             */
/* -------------------------------------------------------------------------- */

assert(TRANSLATIONS.length >= 3, "multiple English editions are offered");
assert(
  TRANSLATIONS.every((edition) => edition.id.startsWith("en.")),
  "translation ids are provider identifiers",
);
assert(
  getTranslation("en.pickthall").id === "en.pickthall",
  "a known edition resolves",
);
assert(
  getTranslation("xx.nope").id === DEFAULT_TRANSLATION,
  "an unknown translation falls back to the default",
);

assert(
  !showsSeparateBismillah(1),
  "Al-Fatihah has no separate Bismillah (it is Ayah 1)",
);
assert(!showsSeparateBismillah(9), "At-Tawbah has no Bismillah");
assert(showsSeparateBismillah(2), "Al-Baqarah opens with the Bismillah");
assert(showsSeparateBismillah(114), "An-Nas opens with the Bismillah");

const bismillah = "بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ";

assert(
  stripBismillahPrefix(`${bismillah} الٓمٓ`, 2) === "الٓمٓ",
  "the Uthmani Bismillah prefix is removed from Ayah 1 of Al-Baqarah",
);
assert(
  stripBismillahPrefix(`\uFEFF${bismillah} الٓمٓ`, 2) === "الٓمٓ",
  "a leading byte-order mark is removed with the prefix",
);
assert(
  stripBismillahPrefix("الٓمٓ", 2) === "الٓمٓ",
  "Ayah 1 without a prefix is left untouched",
);
assert(
  stripBismillahPrefix(bismillah, 1) === bismillah,
  "the Bismillah stays whole in Al-Fatihah, where it is Ayah 1",
);
assert(
  stripBismillahPrefix(`${bismillah} الٓمٓ`, 1) === `${bismillah} الٓمٓ`,
  "Al-Fatihah is never stripped",
);
assert(
  stripBismillahPrefix("بَرَآءَةٌ مِّنَ ٱللَّهِ وَرَسُولِهِ", 9) ===
    "بَرَآءَةٌ مِّنَ ٱللَّهِ وَرَسُولِهِ",
  "At-Tawbah's opening Ayah is left untouched",
);
const saba =
  "إِنَّهُۥ مِن سُلَيْمَٰنَ وَإِنَّهُۥ بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ";
assert(
  stripBismillahPrefix(saba, 27) === saba,
  "a Bismillah in the middle of an Ayah (27:30) is never stripped",
);
assert(
  stripBismillahPrefix("   ", 2) === "",
  "whitespace-only text reduces to an empty string",
);

assert(
  normalizeArabic("ٱللَّهِ") === "الله",
  "normalisation folds alef wasla and harakat",
);
assert(
  normalizeArabic("ٱلرَّحْمَٰنِ") === "الرحمن",
  "normalisation folds the superscript alef",
);
assert(
  cleanText("\uFEFFtext\u0000") === "text",
  "control characters are stripped",
);

/* -------------------------------------------------------------------------- */
/* 4. Parsing — Arabic and English must stay paired                            */
/* -------------------------------------------------------------------------- */

function makePayload(
  editions: Array<{
    id: string;
    ayahs: Array<{ text: string; numberInSurah: number }>;
  }>,
  declaredCount?: number,
) {
  return {
    code: 200,
    status: "OK",
    data: editions.map((edition) => ({
      edition: { identifier: edition.id },
      numberOfAyahs: declaredCount ?? edition.ayahs.length,
      ayahs: edition.ayahs,
    })),
  };
}

const realFatihah = makePayload([
  {
    id: "quran-uthmani",
    ayahs: [
      { numberInSurah: 1, text: `\uFEFF${bismillah}` },
      { numberInSurah: 2, text: "ٱلْحَمْدُ لِلَّهِ رَبِّ ٱلْعَٰلَمِينَ" },
      { numberInSurah: 3, text: "ٱلرَّحْمَٰنِ ٱلرَّحِيمِ" },
    ],
  },
  {
    id: "en.sahih",
    ayahs: [
      {
        numberInSurah: 1,
        text: "In the Name of Allah, the Entirely Merciful, the Especially Merciful.",
      },
      {
        numberInSurah: 2,
        text: "[All] praise is [due] to Allah, Lord of the worlds -",
      },
      {
        numberInSurah: 3,
        text: "The Entirely Merciful, the Especially Merciful,",
      },
    ],
  },
  {
    id: "en.transliteration",
    ayahs: [
      { numberInSurah: 1, text: "Bismillaahir Rahmaanir Raheem" },
      { numberInSurah: 2, text: "Alhamdu lillaahi Rabbil 'aalameen" },
      { numberInSurah: 3, text: "Ar-Rahmaanir-Raheem" },
    ],
  },
]);

const fatihah = parseSurahText(realFatihah, 1, getTranslation("en.sahih"));
assert(fatihah.ayahs.length === 3, "every Ayah of the payload is kept");
assert(
  fatihah.ayahs[0]?.arabic === bismillah,
  "Al-Fatihah Ayah 1 keeps the Bismillah as its text",
);
assert(
  fatihah.ayahs[0]?.translation.startsWith("In the Name of Allah"),
  "Ayah 1 pairs with the translation of Ayah 1",
);
assert(
  fatihah.ayahs[1]?.translation.includes("Lord of the worlds"),
  "Ayah 2 pairs with the translation of Ayah 2",
);
assert(
  fatihah.ayahs[2]?.transliteration === "Ar-Rahmaanir-Raheem",
  "transliteration is available when the provider sends it",
);
assert(
  fatihah.ayahs.every((ayah, index) => ayah.numberInSurah === index + 1),
  "Ayah numbers stay in order",
);

// A translation edition that lists its Ayahs in a different order must still
// pair by Ayah number, never by array position.
const shuffled = makePayload([
  {
    id: "quran-uthmani",
    ayahs: [
      { numberInSurah: 1, text: "ٱلْحَمْدُ لِلَّهِ" },
      { numberInSurah: 2, text: "ٱلرَّحْمَٰنِ ٱلرَّحِيمِ" },
    ],
  },
  {
    id: "en.sahih",
    ayahs: [
      { numberInSurah: 2, text: "The Entirely Merciful" },
      { numberInSurah: 1, text: "All praise is due to Allah" },
    ],
  },
]);
const paired = parseSurahText(shuffled, 3, getTranslation("en.sahih"));
assert(
  paired.ayahs[0]?.translation === "All praise is due to Allah",
  "pairing follows numberInSurah, not translation array order",
);
assert(
  paired.ayahs[1]?.translation === "The Entirely Merciful",
  "the second Ayah keeps its own translation",
);
assert(
  paired.ayahs[0]?.transliteration === "",
  "missing transliteration is empty, not invented",
);

const prefixed = makePayload([
  {
    id: "quran-uthmani",
    ayahs: [{ numberInSurah: 1, text: `${bismillah} الٓمٓ` }],
  },
  { id: "en.sahih", ayahs: [{ numberInSurah: 1, text: "Alif, Lam, Meem." }] },
]);
const normalized = parseSurahText(prefixed, 2, getTranslation("en.sahih"));
assert(
  normalized.ayahs[0]?.arabic === "الٓمٓ",
  "Ayah 1 Arabic is aligned with its translation",
);
assert(
  normalized.ayahs[0]?.translation === "Alif, Lam, Meem.",
  "the translation of Ayah 1 is untouched",
);

function throws(fn: () => unknown, label: string): void {
  let threw = false;
  try {
    fn();
  } catch {
    threw = true;
  }
  assert(threw, label);
}

throws(
  () =>
    parseSurahText(
      makePayload([
        { id: "quran-uthmani", ayahs: [{ numberInSurah: 1, text: "آية" }] },
        { id: "en.sahih", ayahs: [] },
      ]),
      2,
      getTranslation("en.sahih"),
    ),
  "a missing translation aborts instead of rendering half an Ayah list",
);

throws(
  () =>
    parseSurahText(
      makePayload([
        {
          id: "quran-uthmani",
          ayahs: [
            { numberInSurah: 1, text: "آية" },
            { numberInSurah: 2, text: "آية" },
          ],
        },
        { id: "en.sahih", ayahs: [{ numberInSurah: 1, text: "one" }] },
      ]),
      2,
      getTranslation("en.sahih"),
    ),
  "a truncated Surah is rejected",
);

throws(
  () =>
    parseSurahText(
      makePayload([
        {
          id: "quran-uthmani",
          ayahs: [
            { numberInSurah: 2, text: "آية" },
            { numberInSurah: 1, text: "آية" },
          ],
        },
        {
          id: "en.sahih",
          ayahs: [
            { numberInSurah: 1, text: "one" },
            { numberInSurah: 2, text: "two" },
          ],
        },
      ]),
      2,
      getTranslation("en.sahih"),
    ),
  "out-of-order Arabic Ayahs are rejected",
);

throws(
  () =>
    parseSurahText(
      { code: 500, status: "ERROR" },
      2,
      getTranslation("en.sahih"),
    ),
  "a failed API response throws instead of rendering",
);
throws(
  () => parseSurahText({ code: 200, data: [] }, 2, getTranslation("en.sahih")),
  "an empty edition list throws",
);

/* -------------------------------------------------------------------------- */
/* 5. Surah index                                                              */
/* -------------------------------------------------------------------------- */

const indexPayload = {
  code: 200,
  data: Array.from({ length: 114 }, (_, i) => ({
    number: i + 1,
    name: `سُورَةُ ${i + 1}`,
    englishName: `Surah ${i + 1}`,
    englishNameTranslation: `Meaning ${i + 1}`,
    numberOfAyahs: 3,
    revelationType: i % 2 === 0 ? "Meccan" : "Medinan",
  })),
};

const index = parseSurahIndex(indexPayload);
assert(index.length === 114, "the Surah index keeps all 114 entries");
assert(
  index[0]?.number === 1 && index[113]?.number === 114,
  "the index stays ordered",
);
assert(
  index[1]?.revelation === "Medinan",
  "the revelation place is carried through",
);
throws(
  () => parseSurahIndex({ code: 200, data: indexPayload.data.slice(0, 113) }),
  "an incomplete Surah index is rejected",
);

/* -------------------------------------------------------------------------- */
/* 6. Reading preferences                                                      */
/* -------------------------------------------------------------------------- */

assert(DEFAULT_QURAN_PREFS.showTranslation, "translations are on by default");
assert(
  DEFAULT_QURAN_PREFS.autoScroll,
  "following the recitation is on by default",
);
assert(
  DEFAULT_QURAN_PREFS.layout === "comfortable",
  "the default layout is comfortable",
);

const clamped = normalizeQuranPrefs({
  translation: "xx.nope",
  arabicSize: 400,
  translationSize: 1,
  lineHeight: 12,
  layout: "weird",
});
assert(
  clamped.translation === DEFAULT_QURAN_PREFS.translation,
  "an unknown translation falls back to the default",
);
assert(
  clamped.arabicSize === ARABIC_SIZE_RANGE.max,
  "an oversized Arabic font is clamped",
);
assert(
  clamped.translationSize === 12,
  "a tiny translation font is clamped to the minimum",
);
assert(clamped.lineHeight === 3, "line spacing is clamped to the maximum");
assert(clamped.layout === "comfortable", "an unknown layout falls back");
assert(
  normalizeQuranPrefs(null).arabicSize === DEFAULT_QURAN_PREFS.arabicSize,
  "null preferences fall back to the defaults",
);
assert(
  normalizeQuranPrefs({ arabicSize: Number.NaN }).arabicSize ===
    DEFAULT_QURAN_PREFS.arabicSize,
  "NaN preferences fall back to the defaults",
);
assert(
  normalizeQuranPrefs({ showTranslation: false }).showTranslation === false,
  "an explicit false is preserved, not replaced by the default",
);

const store = new Map<string, string>();
const fakeStorage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => {
    store.set(key, value);
  },
};
writeQuranPrefs(
  { ...DEFAULT_QURAN_PREFS, arabicSize: 38, layout: "compact" },
  fakeStorage,
);
const restored = readQuranPrefs(fakeStorage);
assert(restored.arabicSize === 38, "preferences survive a round trip");
assert(restored.layout === "compact", "the layout preference is persisted");
assert(
  store.has(QURAN_PREFS_KEY),
  "preferences are written under the versioned key",
);
store.set(QURAN_PREFS_KEY, "{not json");
assert(
  readQuranPrefs(fakeStorage).arabicSize === DEFAULT_QURAN_PREFS.arabicSize,
  "corrupt stored preferences fall back instead of throwing",
);
assert(
  readQuranPrefs(undefined).arabicSize === DEFAULT_QURAN_PREFS.arabicSize,
  "no storage still works",
);

/* -------------------------------------------------------------------------- */

console.log(`\n${checks} checks, ${failures} failures`);
if (failures > 0) {
  console.error("quran tests FAILED");
  process.exit(1);
}
console.log("quran tests passed");
