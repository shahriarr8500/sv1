/**
 * Backend tests for Ashy's link-fallback chain (Phase 6).
 *
 * Run with:  bun src/tests/ashyResourceFallback.test.ts
 * Exit code 0 = all assertions passed.
 *
 * These execute the SAME functions the Convex action runs in production
 * (src/convex/ashyResources.ts), with providers forced to fail exactly as
 * the spec requires. Output prints DOMAINS ONLY — never API keys, page
 * snippets, provider titles or full model responses.
 *
 * The unauthenticated-rejection check needs a live Convex deployment, so it
 * runs separately: bunx convex call ashy.chat '{"history":[...]}'
 */

import { readFileSync } from "node:fs";
import {
  BACKUP_NOTICE,
  CURATED_LINK_LIBRARY,
  LIMIT_NOTICE,
  MAX_LINK_SOURCES,
  TAVILY_DAILY_LIMIT,
  TRUSTED_LINK_DOMAINS,
  buildResourceQuery,
  fetchTavilySearch,
  isResourceIntent,
  matchCuratedTopic,
  runResourceFallback,
  shouldRunResourceFallback,
  stripUrlsAndQueryLines,
  type ResourceLink,
} from "../convex/ashyResources";
import { extractVideoQueries } from "../convex/ashyShared";
import { isPlanningIntent, isProgressIntent } from "../convex/ashyPlanning";

let checks = 0;
let failures = 0;

function assert(condition: boolean, label: string): void {
  checks += 1;
  if (!condition) {
    failures += 1;
    console.error(`FAIL  ${label}`);
  }
}

function domainList(links: ResourceLink[]): string {
  return links.map((entry) => entry.domain).join(", ");
}

function isHttp(link: ResourceLink): boolean {
  return link.url.startsWith("https://") || link.url.startsWith("http://");
}

/* -------------------------------------------------------------------------- */
/* Fixture: a realistic Tavily response body (shape per docs.tavily.com)       */
/* -------------------------------------------------------------------------- */

const TAVILY_FIXTURE: unknown = {
  query: "vectors",
  results: [
    {
      title: "HyperPhysics Vectors",
      url: "https://hyperphysics.phy-astr.gsu.edu/hbase/vect.html",
      content: "A vector has magnitude and direction ... untrusted snippet.",
      score: 0.98,
    },
    {
      // Non-http result — must be rejected by the parser.
      title: "Bad protocol",
      url: "javascript:alert(1)",
      content: "should never surface",
      score: 0.97,
    },
    {
      title: "Vectors — The Physics Classroom",
      url: "https://www.physicsclassroom.com/class/vectors",
      content: "Vector addition, components, projectile motion ...",
      score: 0.96,
    },
    {
      // Duplicate URL — must be deduped.
      title: "HyperPhysics Vectors (again)",
      url: "https://hyperphysics.phy-astr.gsu.edu/hbase/vect.html",
      content: "duplicate row",
      score: 0.95,
    },
    { url: "https://www.khanacademy.org/math/physics", score: 0.94 },
    {
      title: "OpenStax Physics",
      url: "https://openstax.org/books/physics/pages/1-introduction",
      content: "Introductory college physics textbook.",
      score: 0.93,
    },
    {
      title: "Wikipedia — Vector",
      url: "https://en.wikipedia.org/wiki/Vector_(mathematics_and_physics)",
      content: "In mathematics and physics, a vector is ...",
      score: 0.92,
    },
  ],
};

async function main(): Promise<void> {
  /* ---------------------------------------------------------------------- */
  /* 1) Grounding forced to fail (429) → Tavily sources                      */
  /* ---------------------------------------------------------------------- */
  const capture: { last: { url: string; init: RequestInit } | null } = {
    last: null,
  };
  const fakeFetch = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    capture.last = { url: String(input), init: init ?? {} };
    return new Response(JSON.stringify(TAVILY_FIXTURE), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  // Direct provider call: verifies the REAL request format (endpoint, POST,
  // Bearer header, include_domains body) and the real response validation.
  const direct = await fetchTavilySearch({
    apiKey: "tvly-test-key-do-not-print",
    query: "vectors articles",
    includeDomains: TRUSTED_LINK_DOMAINS,
    fetchImpl: fakeFetch,
  });
  assert(direct.ok, "T1 direct call succeeds against the documented format");
  assert(
    capture.last?.url === "https://api.tavily.com/search",
    "T1 endpoint is https://api.tavily.com/search",
  );
  assert(capture.last?.init.method === "POST", "T1 method is POST");
  const authHeader = (
    capture.last?.init.headers as Record<string, string> | undefined
  )?.Authorization;
  assert(
    authHeader === "Bearer tvly-test-key-do-not-print",
    "T1 auth is an Authorization: Bearer header",
  );
  const sentBody = JSON.parse(String(capture.last?.init.body)) as Record<
    string,
    unknown
  >;
  assert(sentBody.query === "vectors articles", "T1 body carries the query");
  assert(
    Array.isArray(sentBody.include_domains) &&
      TRUSTED_LINK_DOMAINS.every((domain) =>
        (sentBody.include_domains as string[]).includes(domain),
      ),
    "T1 body carries the trusted include_domains list",
  );

  // Full chain: grounding 429 → Tavily → Gemini-with-context.
  const grounded429 = await runResourceFallback(
    "give me articles about vectors",
    { status: 429, kind: "providerQuota" },
    {
      fetchTavily: (query, restrict) =>
        fetchTavilySearch({
          apiKey: "tvly-test-key-do-not-print",
          query,
          includeDomains: restrict ? TRUSTED_LINK_DOMAINS : undefined,
          fetchImpl: fakeFetch,
        }),
      generate: async () =>
        "Start with [1] for fundamentals, then [2] for practice. See the cards below.",
    },
  );
  assert(grounded429.sourceKind === "tavily", "T1 source kind is tavily");
  assert(
    grounded429.links.length === MAX_LINK_SOURCES,
    "T1 links capped at 5 after dedupe/protocol filter",
  );
  assert(
    grounded429.links.every(isHttp),
    "T1 every returned link is http(s)",
  );
  assert(
    grounded429.trace.includes("grounding:429"),
    "T1 trace records the Gemini 429",
  );
  assert(
    grounded429.notice === BACKUP_NOTICE,
    "T1 quiet backup notice is used",
  );
  assert(
    grounded429.noticeKind === "providerQuota",
    "T1 notice kind blames Gemini's quota, not our constants",
  );
  assert(grounded429.searched, "T1 marks the answer as searched");
  assert(
    !JSON.stringify(grounded429).includes("tvly-test-key"),
    "T1 the API key never appears in any result",
  );
  assert(
    !JSON.stringify(grounded429).includes("untrusted snippet"),
    "T1 snippets never leave the context block",
  );
  console.log(`T1 tavily domains: ${domainList(grounded429.links)}`);

  /* ---------------------------------------------------------------------- */
  /* 1b) Trusted-domain attempt empty → one retry without the restriction    */
  /* ---------------------------------------------------------------------- */
  const seenRestrictions: boolean[] = [];
  const emptyThenHit = await runResourceFallback(
    "links for thermodynamics",
    { status: 429, kind: "providerQuota" },
    {
      fetchTavily: async (_query: string, restrict: boolean) => {
        seenRestrictions.push(restrict);
        if (restrict) return { ok: true, links: [] };
        return {
          ok: true,
          links: [
            {
              title: "Thermal Physics",
              url: "https://www.physicsclassroom.com/class/thermal-physics",
              domain: "physicsclassroom.com",
            },
          ],
        };
      },
      generate: async () => "Try [1].",
    },
  );
  assert(
    seenRestrictions.length === 2 && seenRestrictions[0] && !seenRestrictions[1],
    "T1b retries once without include_domains when the first attempt is empty",
  );
  assert(
    emptyThenHit.sourceKind === "tavily",
    "T1b unrestricted retry still yields tavily links",
  );

  /* ---------------------------------------------------------------------- */
  /* 2) Both providers fail → curated library                                */
  /* ---------------------------------------------------------------------- */
  const bothFailed = await runResourceFallback(
    "give me articles about vectors",
    { status: 429, kind: "providerQuota" },
    {
      fetchTavily: async () => ({ ok: false, status: 429 }),
      generate: async () => "Use [1] for the basics and [2] for examples.",
    },
  );
  assert(bothFailed.sourceKind === "curated", "T2 source kind is curated");
  assert(
    bothFailed.links.every((entry) =>
      CURATED_LINK_LIBRARY[1].links.some((curated) => curated.url === entry.url),
    ),
    "T2 curated links come from the verified library",
  );
  assert(
    bothFailed.trace.includes("tavily:http429"),
    "T2 trace records Tavily's 429 status",
  );
  assert(bothFailed.trace.includes("curated:ok"), "T2 trace records curated");
  assert(
    bothFailed.notice === BACKUP_NOTICE,
    "T2 quiet backup notice is used",
  );
  assert(
    matchCuratedTopic("give me articles about vectors")?.key === "vectors",
    "T2 topic matcher picks vectors",
  );
  console.log(`T2 curated domains: ${domainList(bothFailed.links)}`);

  /* ---------------------------------------------------------------------- */
  /* 2b) Curated matched but Gemini itself fails → deterministic text         */
  /* ---------------------------------------------------------------------- */
  const geminiDown = await runResourceFallback(
    "share links for current electricity",
    { status: 429, kind: "providerQuota" },
    {
      fetchTavily: async () => null,
      generate: async () => null,
    },
  );
  assert(geminiDown.sourceKind === "curated", "T2b source kind is curated");
  assert(
    geminiDown.links.length > 0 && geminiDown.links.every(isHttp),
    "T2b curated links still returned when Gemini fails",
  );
  assert(
    !/https?:\/\//.test(geminiDown.text),
    "T2b deterministic text contains no raw URLs",
  );
  assert(
    geminiDown.text.includes("[1]") || geminiDown.text.includes("1."),
    "T2b deterministic text numbers the links",
  );
  console.log(`T2b curated domains: ${domainList(geminiDown.links)}`);

  /* ---------------------------------------------------------------------- */
  /* 3) Everything fails → constructed Google search links                    */
  /* ---------------------------------------------------------------------- */
  const allFailed = await runResourceFallback(
    "give me some links about qqqqzzz",
    { status: 429, kind: "providerQuota" },
    {
      fetchTavily: async () => null,
      generate: async () => null,
    },
  );
  assert(
    allFailed.sourceKind === "searchLinks",
    "T3 source kind is searchLinks",
  );
  assert(allFailed.links.length === 2, "T3 returns the two search links");
  assert(
    allFailed.links.every((entry) => entry.domain === "google.com"),
    "T3 both links are google.com",
  );
  assert(
    allFailed.links[0].url.startsWith("https://www.google.com/search?q="),
    "T3 plain Google search link is constructed and encoded",
  );
  assert(
    allFailed.links[1].url.includes("site%3A"),
    "T3 site-specific search link uses site: with encoding",
  );
  assert(
    !/https?:\/\//.test(allFailed.text),
    "T3 deterministic text contains no raw URLs",
  );
  assert(
    allFailed.notice.includes("unavailable"),
    "T3 the student is told live search was unavailable",
  );
  assert(
    allFailed.noticeKind === "providerQuota",
    "T3 notice kind still reports which limit hit",
  );
  console.log(`T3 search domains: ${domainList(allFailed.links)}`);

  /* ---------------------------------------------------------------------- */
  /* 3b) Grounding never ran (per-user cap) → graceful limit message          */
  /* ---------------------------------------------------------------------- */
  let tavilyWasCalled = false;
  const capped = await runResourceFallback(
    "links about matrices",
    { status: null, kind: "userLimit" },
    {
      fetchTavily: async () => {
        tavilyWasCalled = true;
        return { ok: false, status: 0 };
      },
      generate: async () => "See [1].",
      tavilyUsage: async () => TAVILY_DAILY_LIMIT,
    },
  );
  assert(!tavilyWasCalled, "T3b no Tavily call once the daily limit is hit");
  assert(
    capped.notice === LIMIT_NOTICE && capped.noticeKind === "userLimit",
    "T3b graceful message + userLimit kind when the constant is exhausted",
  );
  assert(
    capped.trace.some((token) => token.startsWith("tavily:limit")),
    "T3b trace records the per-user limit",
  );
  assert(
    capped.sourceKind === "curated",
    "T3b curated library still serves links",
  );
  console.log(`T3b limit domains: ${domainList(capped.links)}`);

  /* ---------------------------------------------------------------------- */
  /* 3c) Cache hit → no provider call, still Tavily links                     */
  /* ---------------------------------------------------------------------- */
  let cacheFetchCalled = false;
  const cached = await runResourceFallback(
    "give me articles about waves",
    { status: 429, kind: "providerQuota" },
    {
      fetchTavily: async () => {
        cacheFetchCalled = true;
        return { ok: false, status: 500 };
      },
      generate: async () => "Start with [1].",
      cachedTavily: async () => [
        {
          title: "Waves",
          url: "https://www.physicsclassroom.com/class/waves",
          domain: "physicsclassroom.com",
        },
      ],
    },
  );
  assert(!cacheFetchCalled, "T3c cache hit skips the provider call");
  assert(
    cached.sourceKind === "tavily" && cached.trace.includes("tavily:cache"),
    "T3c cache hit still reports tavily links",
  );
  console.log(`T3c cache domains: ${domainList(cached.links)}`);

  /* ---------------------------------------------------------------------- */
  /* 4) text / image / progress / planner / video requests unchanged         */
  /* ---------------------------------------------------------------------- */
  const untouchedAsks: Array<[string, string]> = [
    ["text", "What is Newton's second law?"],
    ["text", "Solve 2x² + 5x − 3 = 0"],
    ["image", "Solve this question in the photo"],
    ["progress", "How am I doing in my syllabus?"],
    ["planner", "Make me a study plan for 7 months"],
    ["video", "Give me a video on vectors"],
  ];
  for (const [kind, ask] of untouchedAsks) {
    assert(!isResourceIntent(ask), `T4 ${kind} ask is not a resource ask: ${ask}`);
    assert(
      !shouldRunResourceFallback(ask, {
        planningReply: isPlanningIntent(ask),
        progressAsk: isProgressIntent(ask),
        hasImage: kind === "image",
      }),
      `T4 gate stays closed for ${kind}: ${ask}`,
    );
  }
  assert(isPlanningIntent("Make me a study plan for 7 months"), "T4 planner detection unchanged");
  assert(isProgressIntent("How am I doing in my syllabus?"), "T4 progress detection unchanged");
  const marker = extractVideoQueries('Here you go [[video: "vectors class 12 lecture"]]');
  assert(
    marker.queries[0] === "vectors class 12 lecture",
    "T4 video marker extraction unchanged",
  );
  const imageLinks = shouldRunResourceFallback("share links for vectors", {
    planningReply: false,
    progressAsk: false,
    hasImage: true,
  });
  assert(!imageLinks, "T4 photos never trigger the link fallback");
  const positiveAsks = [
    "give me articles about vectors",
    "share links for kinematics",
    "any news about the HSC circular?",
    "best websites to learn calculus",
  ];
  for (const ask of positiveAsks) {
    assert(isResourceIntent(ask), `T4 resource ask detected: ${ask}`);
  }
  console.log("T4 untouched flows: text, image, progress, planner, video");

  /* ---------------------------------------------------------------------- */
  /* 5) Curated library integrity + query building + URL stripping           */
  /* ---------------------------------------------------------------------- */
  for (const topic of CURATED_LINK_LIBRARY) {
    for (const entry of topic.links) {
      assert(isHttp(entry), `T5 ${topic.key} link is http(s): ${entry.domain}`);
      assert(
        entry.url.includes(entry.domain),
        `T5 ${topic.key} domain matches its URL: ${entry.domain}`,
      );
      assert(
        TRUSTED_LINK_DOMAINS.some(
          (trusted) => entry.domain === trusted || entry.domain.endsWith(`.${trusted}`),
        ) || entry.domain === "wikipedia.org",
        `T5 ${topic.key} domain is on the trusted list: ${entry.domain}`,
      );
    }
  }
  const totalCurated = CURATED_LINK_LIBRARY.reduce(
    (sum, topic) => sum + topic.links.length,
    0,
  );
  console.log(
    `T5 curated library: ${CURATED_LINK_LIBRARY.length} topics, ${totalCurated} verified links`,
  );

  assert(
    buildResourceQuery("give me articles about vectors") === "vectors",
    "T5 query builder strips the intent boilerplate",
  );
  const stripped = stripUrlsAndQueryLines(
    "Start with [HyperPhysics](https://hyperphysics.phy-astr.gsu.edu/hbase/vect.html) then https://example.com/x\nSearch query: vectors for hsc",
  );
  assert(
    !stripped.includes("http") && !stripped.toLowerCase().includes("search query:"),
    "T5 URLs and Search query lines are stripped from fallback text",
  );
  assert(stripped.includes("HyperPhysics"), "T5 link labels survive the strip");

  /* ---------------------------------------------------------------------- */
  /* 6) Log hygiene: no keys, snippets or full responses in backend logs     */
  /* ---------------------------------------------------------------------- */
  const resourceSource = readFileSync(
    new URL("../convex/ashyResources.ts", import.meta.url),
    "utf8",
  );
  assert(
    !resourceSource.includes("console."),
    "T6 the fallback module never logs",
  );
  const dataSource = readFileSync(
    new URL("../convex/ashyData.ts", import.meta.url),
    "utf8",
  );
  assert(
    !dataSource.includes("console."),
    "T6 the data layer never logs",
  );

  const backendFiles = ["../convex/ashy.ts"];
  const forbidden: RegExp[] = [
    /\$\{key\}/,
    /\$\{tavilyKey\}/,
    /\.message\b/,
    /\bsnippet\b/,
    /\brawText\b/,
    /tvly-[A-Za-z0-9]/,
    /AIza/,
  ];
  for (const file of backendFiles) {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    const bodies = consoleBodies(source);
    assert(
      bodies.length > 0,
      `T6 log scan actually sees console calls in ${file.slice(3)}`,
    );
    for (const body of bodies) {
      const hit = forbidden.find((pattern) => pattern.test(body));
      assert(
        hit === undefined,
        `T6 log line avoids ${String(hit)} in ${file.slice(3)}`,
      );
    }
  }
  console.log("T6 log hygiene: status/failure-kind only in backend logs");

  /* ---------------------------------------------------------------------- */
  console.log("");
  if (failures > 0) {
    console.error(`${failures}/${checks} assertions FAILED`);
    process.exit(1);
  }
  console.log(`All ${checks} assertions passed.`);
}

/** Extracts the text of each console.*(...) call, paren-balanced. */
function consoleBodies(source: string): string[] {
  const bodies: string[] = [];
  let index = 0;
  for (;;) {
    const start = source.indexOf("console.", index);
    if (start === -1) break;
    const open = source.indexOf("(", start);
    if (open === -1) break;
    let depth = 0;
    let end = open;
    for (let i = open; i < source.length; i += 1) {
      const ch = source[i];
      if (ch === "(") depth += 1;
      else if (ch === ")") {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    bodies.push(source.slice(start, end + 1));
    index = end + 1;
  }
  return bodies;
}

void main().catch((error: unknown) => {
  console.error("Test runner crashed:", error instanceof Error ? error.name : "unknown");
  process.exit(1);
});
