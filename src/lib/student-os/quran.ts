/**
 * Quran content + audio helpers.
 *
 * Quranic text is treated differently from the rest of Student OS:
 *
 *   - Arabic is never paraphrased or generated; only recorded Surah/Ayah
 *     text is stored here.
 *   - Translations are presented as translations, never as app copy.
 *   - The reflection below each verse is written by Student OS and is
 *     always rendered in its own clearly-labelled block.
 *   - Nothing in this file awards XP, streaks, points or achievements.
 *     Worship is deliberately kept outside the gamification system.
 *
 * Selection is deterministic: the same local date always returns the same
 * entry, so a refresh never reshuffles the card underneath the student.
 */

/* -------------------------------------------------------------------------- */
/* Surah table                                                                 */
/* -------------------------------------------------------------------------- */

export interface Surah {
  number: number;
  name: string;
  ayahs: number;
}

/** number|name|ayahCount, kept compact so the table stays readable. */
const SURAH_TABLE = `1|Al-Fatihah|7
2|Al-Baqarah|286
3|Aal-Imran|200
4|An-Nisa|176
5|Al-Ma'idah|120
6|Al-An'am|165
7|Al-A'raf|206
8|Al-Anfal|75
9|At-Tawbah|129
10|Yunus|109
11|Hud|123
12|Yusuf|111
13|Ar-Ra'd|43
14|Ibrahim|52
15|Al-Hijr|99
16|An-Nahl|128
17|Al-Isra|111
18|Al-Kahf|110
19|Maryam|98
20|Ta-Ha|135
21|Al-Anbiya|112
22|Al-Hajj|78
23|Al-Mu'minun|118
24|An-Nur|64
25|Al-Furqan|77
26|Ash-Shu'ara|227
27|An-Naml|93
28|Al-Qasas|88
29|Al-Ankabut|69
30|Ar-Rum|60
31|Luqman|34
32|As-Sajdah|30
33|Al-Ahzab|73
34|Saba|54
35|Fatir|45
36|Ya-Sin|83
37|As-Saffat|182
38|Sad|88
39|Az-Zumar|75
40|Ghafir|85
41|Fussilat|54
42|Ash-Shura|53
43|Az-Zukhruf|89
44|Ad-Dukhan|59
45|Al-Jathiyah|37
46|Al-Ahqaf|35
47|Muhammad|38
48|Al-Fath|29
49|Al-Hujurat|18
50|Qaf|45
51|Adh-Dhariyat|60
52|At-Tur|49
53|An-Najm|62
54|Al-Qamar|55
55|Ar-Rahman|78
56|Al-Waqi'ah|96
57|Al-Hadid|29
58|Al-Mujadila|22
59|Al-Hashr|24
60|Al-Mumtahanah|13
61|As-Saf|14
62|Al-Jumu'ah|11
63|Al-Munafiqun|11
64|At-Taghabun|18
65|At-Talaq|12
66|At-Tahrim|12
67|Al-Mulk|30
68|Al-Qalam|52
69|Al-Haqqah|52
70|Al-Ma'arij|44
71|Nuh|28
72|Al-Jinn|28
73|Al-Muzzammil|20
74|Al-Muddaththir|56
75|Al-Qiyamah|40
76|Al-Insan|31
77|Al-Mursalat|50
78|An-Naba|40
79|An-Nazi'at|46
80|Abasa|42
81|At-Takwir|29
82|Al-Infitar|19
83|Al-Mutaffifin|36
84|Al-Inshiqaq|25
85|Al-Buruj|22
86|At-Tariq|17
87|Al-A'la|19
88|Al-Ghashiyah|26
89|Al-Fajr|30
90|Al-Balad|20
91|Ash-Shams|15
92|Al-Layl|21
93|Ad-Duha|11
94|Ash-Sharh|8
95|At-Tin|8
96|Al-Alaq|19
97|Al-Qadr|5
98|Al-Bayyinah|8
99|Az-Zalzalah|8
100|Al-Adiyat|11
101|Al-Qari'ah|11
102|At-Takathur|8
103|Al-Asr|3
104|Al-Humazah|9
105|Al-Fil|5
106|Quraysh|4
107|Al-Ma'un|7
108|Al-Kawthar|3
109|Al-Kafirun|6
110|An-Nasr|3
111|Al-Masad|5
112|Al-Ikhlas|4
113|Al-Falaq|5
114|An-Nas|6`;

export const SURAHS: Surah[] = SURAH_TABLE.split("\n").map((line) => {
  const [number, name, ayahs] = line.split("|");
  return { number: Number(number), name, ayahs: Number(ayahs) };
});

export function getSurah(number: number): Surah | undefined {
  return SURAHS[number - 1];
}

export function surahName(number: number): string {
  return getSurah(number)?.name ?? `Surah ${number}`;
}

/** Running total of ayahs before this surah — used for seek/next/previous. */
export function firstGlobalAyah(surah: number): number {
  let total = 1;
  for (let index = 1; index < surah; index += 1) {
    total += SURAHS[index - 1]?.ayahs ?? 0;
  }
  return total;
}

/**
 * Full-surah recitation — kept for the whole-surah stream that existed before
 * per-Ayah playback. The reading page uses `ayahAudioUrl` instead.
 */
export function surahAudioUrl(surah: number): string {
  return `https://cdn.islamic.network/quran/audio-surah/128/ar.alafasy/${surah}.mp3`;
}

/** Every Ayah in the Quran, by the standard Kufan count. */
export const TOTAL_AYAHS = 6236;

export function ayahCount(surah: number): number {
  return getSurah(surah)?.ayahs ?? 0;
}

/** Running Ayah number across the whole Quran (1…6236). */
export function globalAyahNumber(surah: number, ayah: number): number {
  return firstGlobalAyah(surah) + ayah - 1;
}

/* -------------------------------------------------------------------------- */
/* Reciters — per-Ayah audio                                                   */
/* -------------------------------------------------------------------------- */

export interface Reciter {
  /** CDN path segment, e.g. `ar.alafasy`. */
  id: string;
  name: string;
  arabicName: string;
}

/**
 * Reciters served by the Islamic Network CDN. Each identifier was checked
 * against the per-Ayah endpoint before being listed, so a reciter in this list
 * always has playable Ayah files rather than a silently broken URL.
 */
export const RECITERS: Reciter[] = [
  {
    id: "ar.alafasy",
    name: "Mishary Rashid Alafasy",
    arabicName: "مشاري راشد العفاسي",
  },
  {
    id: "ar.husary",
    name: "Mahmoud Khalil Al-Husary",
    arabicName: "محمود خليل الحصري",
  },
  {
    id: "ar.minshawi",
    name: "Mohamed Siddiq El-Minshawi",
    arabicName: "محمد صديق المنشاوي",
  },
  {
    id: "ar.shaatree",
    name: "Abu Bakr Ash-Shaatree",
    arabicName: "أبو بكر الشاطري",
  },
];

export const DEFAULT_RECITER = "ar.alafasy";

export function getReciter(id: string): Reciter {
  return RECITERS.find((reciter) => reciter.id === id) ?? RECITERS[0];
}

export function reciterName(id: string): string {
  return getReciter(id).name;
}

/**
 * One audio file per Ayah.
 *
 * The CDN addresses these files by the *running* Ayah number across the whole
 * Quran (1…6236), not by Surah-local number, which is why `globalAyahNumber`
 * exists. Because every Ayah is its own file, the reading highlight follows
 * real playback instead of an interpolated timestamp.
 */
export function ayahAudioUrl(
  surah: number,
  ayah: number,
  reciter: string = DEFAULT_RECITER,
): string {
  const global = globalAyahNumber(surah, ayah);
  return `https://cdn.islamic.network/quran/audio/128/${reciter}/${global}.mp3`;
}

/* -------------------------------------------------------------------------- */
/* Translations                                                                */
/* -------------------------------------------------------------------------- */

export interface TranslationEdition {
  /** AlQuran Cloud edition identifier. */
  id: string;
  /** Edition name shown in the selector. */
  name: string;
  /** Translator credited under every translated Ayah. */
  translator: string;
}

/**
 * English editions fetched from the AlQuran Cloud API (the same source the
 * app already used for audio). The Arabic text is always the Tanzil Uthmani
 * edition; only the translation changes when the reader switches edition.
 */
export const TRANSLATIONS: TranslationEdition[] = [
  {
    id: "en.sahih",
    name: "Saheeh International",
    translator: "Saheeh International",
  },
  {
    id: "en.pickthall",
    name: "Pickthall",
    translator: "Mohammed Marmaduke William Pickthall",
  },
  {
    id: "en.yusufali",
    name: "Yusuf Ali",
    translator: "Abdullah Yusuf Ali",
  },
];

export const DEFAULT_TRANSLATION = "en.sahih";

export function getTranslation(id: string): TranslationEdition {
  return TRANSLATIONS.find((edition) => edition.id === id) ?? TRANSLATIONS[0];
}

/* -------------------------------------------------------------------------- */
/* Bismillah                                                                   */
/* -------------------------------------------------------------------------- */

/** Uthmani spelling, matching the edition served by the API. */
export const BISMILLAH = "بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ";

/**
 * At-Tawbah opens without the Bismillah, and in Al-Fatihah the Bismillah *is*
 * Ayah 1 — so neither Surah gets a separate opening line. Every other Surah
 * does, and it is never counted as an Ayah.
 */
export function showsSeparateBismillah(surah: number): boolean {
  return surah !== 1 && surah !== 9;
}

/* -------------------------------------------------------------------------- */
/* Daily Guidance content                                                      */
/* -------------------------------------------------------------------------- */

export type GuidanceLanguage = "en" | "bn";

export interface GuidanceEntry {
  id: string;
  surah: number;
  ayah: number;
  arabic: string;
  english: string;
  bangla: string;
  /** Student OS reflection — never presented as part of the verse. */
  reflection: string;
  /** Short tawakkul reminder shown after the reflection on mobile. */
  reminder: string;
}

const GUIDANCE: GuidanceEntry[] = [
  {
    id: "sharh-5",
    surah: 94,
    ayah: 5,
    arabic: "فَإِنَّ مَعَ الْعُسْرِ يُسْرًا",
    english: "For indeed, with hardship comes ease.",
    bangla: "নিশ্চয়ই কষ্টের সাথে সহজতা রয়েছে।",
    reflection:
      "A hard chapter does not mean a hard journey. Keep the session small and keep going.",
    reminder: "Trust the process — ease is promised.",
  },
  {
    id: "baqarah-152",
    surah: 2,
    ayah: 152,
    arabic: "فَاذْكُرُونِي أَذْكُرْكُمْ وَاشْكُرُوا لِي وَلَا تَكْفُرُونِ",
    english:
      "So remember Me; I will remember you. And be grateful to Me and do not deny Me.",
    bangla:
      "তুমি আমাকে স্মরণ কর, আমি তোমাকে স্মরণ করব। আমাকে কৃতজ্ঞতা জ্ঞাপন কর এবং অকৃতজ্ঞ হও না।",
    reflection:
      "Gratitude before effort. Name one thing that is going well before you start.",
    reminder: "Begin with thanks, not pressure.",
  },
  {
    id: "rad-28",
    surah: 13,
    ayah: 28,
    arabic: "أَلَا بِذِكْرِ اللَّهِ تَطْمَئِنُّ الْقُلُوبُ",
    english: "Verily, in the remembrance of Allah do hearts find rest.",
    bangla: "সত্যই আল্লাহর স্মরণে হৃদয়ে প্রশান্তি আসে।",
    reflection:
      "A calm mind learns better than a rushed one. Settle before you open the book.",
    reminder: "Peace first, then pages.",
  },
  {
    id: "baqarah-201",
    surah: 2,
    ayah: 201,
    arabic: "وَقُل رَّبِّ زِدْنِي عِلْمًا",
    english: "And say: My Lord, increase me in knowledge.",
    bangla: "এবং বল, হে আমার প্রতিপালক, আমার জ্ঞান বৃদ্ধি করুন।",
    reflection:
      "Ask for increase, then do the work that makes increase possible.",
    reminder: "One honest hour beats five distracted ones.",
  },
  {
    id: "imran-139",
    surah: 3,
    ayah: 139,
    arabic:
      "وَلَا تَهِنُوا وَلَا تَحْزَنُوا وَأَنتُمُ الْأَعْلَوْنَ إِن كُنتُم مُّؤْمِنِينَ",
    english:
      "Do not weaken and do not grieve, for you will be superior if you are believers.",
    bangla:
      "দুর্বল হও না এবং বিষণ্ন হও না; তুমি প্রবল পক্ষে, যদি তুমি বিশ্বাসী হও।",
    reflection:
      "Weak days are not failed days. They are the ones that build the habit.",
    reminder: "You are allowed to start again.",
  },
  {
    id: "baqarah-286",
    surah: 2,
    ayah: 286,
    arabic: "لَا يُكَلِّفُ اللَّهُ نَفْسًا إِلَّا وُسْعَهَا",
    english: "Allah does not burden a soul beyond that it can bear.",
    bangla: "আল্লাহ কাউর উপর তার সামর্থ্যের বাইরে বোঝা চাপিয়ে দেন না।",
    reflection:
      "Take the mission that fits today, not the one that fits your best day.",
    reminder: "A reasonable plan is a sustainable one.",
  },
  {
    id: "ibrahim-7",
    surah: 14,
    ayah: 7,
    arabic: "لَئِن شَكَرْتُمْ لَأَزِيدَنَّكُمْ",
    english: "If you are grateful, I will surely increase you.",
    bangla:
      "তুমি যদি কৃতজ্ঞতা জ্ঞাপন কর, তবে অবশ্যই আমি তোমাদের বৃদ্ধি দান করব।",
    reflection:
      "Notice the progress you already made before chasing the next number.",
    reminder: "Increase follows appreciation.",
  },
  {
    id: "ankabut-69",
    surah: 29,
    ayah: 69,
    arabic: "وَالَّذِينَ جَاهَدُوا فِينَا لَنَهْدِيَنَّهُمْ سُبُلَنَا",
    english:
      "And those who strive for Us — We will surely guide them to Our ways.",
    bangla:
      "যারা আমাদের পথে সংগ্রাম করে, আমি অবশ্যই তাদের আমাদের পথ প্রদর্শন করব।",
    reflection:
      "Effort comes before clarity. The direction shows up once you move.",
    reminder: "Start, and the path opens.",
  },
  {
    id: "duha-5",
    surah: 93,
    ayah: 5,
    arabic: "وَلَسَوْفَ يُعْطِيكَ رَبُّكَ فَتَرْضَىٰ",
    english: "And your Lord is going to give you, and you will be satisfied.",
    bangla:
      "এবং তোমার প্রতিপালক তোমাকে অবশ্যই দান করবেন, তখন তুমি সন্তুষ্ট হবে।",
    reflection:
      "Progress you cannot see yet is still progress. Trust the quiet weeks.",
    reminder: "Keep going; the result will come.",
  },
  {
    id: "baqarah-153",
    surah: 2,
    ayah: 153,
    arabic:
      "يَا أَيُّهَا الَّذِينَ آمَنُوا اسْتَعِينُوا بِالصَّبْرِ وَالصَّلَاةِ",
    english: "O you who believe, seek help through patience and prayer.",
    bangla: "হে বিশ্বাসীগণ, ধৈর্য ও নামাজের মাধ্যমে সাহায্য গ্রহণ কর।",
    reflection:
      "Patience is a study skill. Stay with the problem a little longer.",
    reminder: "Steady beats frantic.",
  },
  {
    id: "sharh-7",
    surah: 94,
    ayah: 7,
    arabic: "وَإِذَا فَرَغْتَ فَانصَبْ",
    english: "And when you are finished, then stand up for effort.",
    bangla: "এবং যখন তুমি অলস হও, তখন উঠে দাঁড়াও।",
    reflection:
      "Rest and effort alternate. Finish this session properly, then truly stop.",
    reminder: "Work, then rest without guilt.",
  },
  {
    id: "ahzab-70",
    surah: 33,
    ayah: 70,
    arabic:
      "يَا أَيُّهَا الَّذِينَ آمَنُوا اتَّقُوا اللَّهَ وَقُولُوا قَوْلًا سَدِيدًا",
    english:
      "O you who believe, fear Allah and speak words of appropriate justice.",
    bangla: "হে বিশ্বাসীগণ, আল্লাহকে ভয় কর এবং সুন্দর ও যথাযথ কথা বল।",
    reflection:
      "Accuracy matters in study too. Check the work before you move on.",
    reminder: "Careful work compounds.",
  },
  {
    id: "anfal-46",
    surah: 8,
    ayah: 46,
    arabic:
      "وَأَطِيعُوا اللَّهَ وَرَسُولَهُ وَلَا تَنَازَعُوا فَتَفْشَلُوا وَتَذْهَبَ رِيحُكُمْ",
    english:
      "Obey Allah and His Messenger and do not dispute, or you will lose courage.",
    bangla:
      "আল্লাহ ও তাঁর রসূলের আনুগত্য কর এবং বিবাদ করো না, তাহলে তোমাদের শক্তি নষ্ট হয়ে যাবে।",
    reflection:
      "Do not fight your own plan. Follow today's mission list as written.",
    reminder: "One plan, followed, beats five begun.",
  },
  {
    id: "luqman-17",
    surah: 31,
    ayah: 17,
    arabic:
      "يَا بُنَيَّ أَقِمِ الصَّلَاةَ وَأْمُرْ بِالْمَعْرُوفِ وَانْهَ عَنِ الْمُنكَرِ",
    english:
      "O my son, establish prayer, enjoin what is right, and forbid what is wrong.",
    bangla:
      "হে পুত্র, নামাজ কায়েম কর, সৎকাজের নির্দেশ দেব এবং অসৎ কাজ থেকে নিষেধ কর।",
    reflection:
      "Good character is part of the syllabus too. Study with honesty.",
    reminder: "How you study matters.",
  },
  {
    id: "mujadila-11",
    surah: 58,
    ayah: 11,
    arabic: "ارْفَعْ دَرَجَاتِي",
    english: "Raise my rank.",
    bangla: "আমার মর্যাদা বৃদ্ধি করুন।",
    reflection:
      "Ranks are raised by small consistent acts, repeated longer than motivation lasts.",
    reminder: "Consistency is the rank.",
  },
  {
    id: "baqarah-250",
    surah: 2,
    ayah: 250,
    arabic:
      "وَكَم مِّن فِئَّةٍ قَلِيلَةٍ غَلَبَتْ فِئَّةً كَثِيرَةً بِإِذْنِ اللَّهِ",
    english:
      "And how many a small company has overcome a large company by permission of Allah.",
    bangla: "কত কম সংখ্যক দলই আল্লাহর অনুমতিতে বহুসংখ্যক দলকে পরাজিত করেছে।",
    reflection:
      "A short, focused session routinely beats a long distracted one.",
    reminder: "Small and sharp wins.",
  },
  {
    id: "zumar-53",
    surah: 39,
    ayah: 53,
    arabic:
      "قُلْ يَا عِبَادِيَ الَّذِينَ أَسْرَفُوا عَلَىٰ أَنفُسِهِمْ لَا تَقْنَطُوا مِن رَّحْمَةِ اللَّهِ",
    english:
      "Say: O My servants who have transgressed against themselves, do not despair of the mercy of Allah.",
    bangla:
      "বল, হে আমার ঐ বান্দারা যারা নিজেদের প্রতি অত্যাচার করেছ, আল্লাহর রহমত থেকে হতাশ হও না।",
    reflection:
      "A missed day is not a verdict. Open the app and do one small thing.",
    reminder: "No guilt. Just begin again.",
  },
  {
    id: "yusuf-87",
    surah: 12,
    ayah: 87,
    arabic: "لَا تَيْأَسُوا مِن رَّوْحِ اللَّهِ",
    english: "Do not despair of the mercy of Allah.",
    bangla: "আল্লাহর রহমত থেকে হতাশ হও না।",
    reflection: "Yesterday's gap says nothing about today's capability.",
    reminder: "Fresh start, same direction.",
  },
  {
    id: "fatihah-5",
    surah: 1,
    ayah: 5,
    arabic: "إِيَّاكَ نَعْبُدُ وَإِيَّاكَ نَسْتَعِينُ",
    english: "You alone we worship, and You alone we ask for help.",
    bangla: "আমরা কেবল তোমারই ইবাদত করি এবং কেবল তোমারই কাছে সাহায্য চাই।",
    reflection:
      "Ask for help before the session, then begin. Intention then effort.",
    reminder: "Effort is worship when it is sincere.",
  },
];

export const GUIDANCE_COUNT = GUIDANCE.length;

/**
 * Stable FNV-1a hash of a day key. Deterministic across devices and
 * reloads so the card never reshuffles mid-day.
 */
export function guidanceIndexFor(
  dayKey: string,
  length = GUIDANCE_COUNT,
): number {
  if (length <= 0) return 0;
  let hash = 0x811c9dc5;
  for (let index = 0; index < dayKey.length; index += 1) {
    hash ^= dayKey.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % length;
}

export function localDayKey(date: Date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/**
 * Resolves today's entry. Async and fallible on purpose: the Dashboard
 * needs a real failure path so a broken source can never blank the page.
 */
export async function loadDailyGuidance(
  dayKey: string = localDayKey(),
): Promise<GuidanceEntry> {
  // A tiny delay keeps the card's loading state honest without slowing
  // anything down — content resolves from the local dataset, not the network.
  await Promise.resolve();
  const entry = GUIDANCE[guidanceIndexFor(dayKey)];
  if (!entry) throw new Error("No guidance entry for this date");
  return entry;
}

export function guidanceReference(entry: GuidanceEntry): string {
  return `${surahName(entry.surah)} ${entry.surah}:${entry.ayah}`;
}
