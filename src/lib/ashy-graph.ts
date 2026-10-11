/**
 * Ashy graph engine — a small, SAFE expression parser and plot sampler
 * (Phase 3).
 *
 * There is deliberately no `eval`, no `new Function`, no dynamic import and
 * no property access anywhere in this file: expressions are tokenized and
 * parsed into a plain AST of whitelisted operations, then evaluated by a
 * closed walker. This is what allows Ashy to render graphs from AI-suggested
 * expressions without ever executing AI-generated code.
 *
 * Grammar (recursive descent, with school-friendly implicit multiplication):
 *   expr    := term (('+' | '-') term)*
 *   term    := unary (('*' | '/') unary | implicit)*
 *   unary   := '-' unary | power
 *   power   := atom ('^' unary)?            (right-associative)
 *   atom    := number | name | name '(' expr ')' | '(' expr ')'
 *
 * Supported names: x (the variable), a–d (sliders), pi, e, and the one-arg
 * functions sin cos tan asin acos atan sqrt abs exp ln log floor ceil round.
 */

import { isFiniteNumber, makeVec } from "./ashy-math";
import type { AshyExplore } from "./ashy";

/** Longest expression accepted — generous for school math, bounded for DoS. */
export const MAX_EXPRESSION_LENGTH = 160;

/** Slider parameters the grapher exposes (auto-detected from the AST). */
export const GRAPH_PARAMETERS = ["a", "b", "c", "d"] as const;

/** Whitelisted one-argument functions. */
export const GRAPH_FUNCTIONS: Record<string, (arg: number) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  sqrt: Math.sqrt,
  abs: Math.abs,
  exp: Math.exp,
  ln: Math.log,
  log: Math.log10,
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
};

/** Whitelisted named constants. */
export const GRAPH_CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  e: Math.E,
};

export const GRAPH_VARIABLE = "x";

/* -------------------------------------------------------------------------- */
/* Tokens & AST                                                                */
/* -------------------------------------------------------------------------- */

type Token =
  | { kind: "num"; value: number }
  | { kind: "name"; name: string }
  | { kind: "op"; op: "+" | "-" | "*" | "/" | "^" }
  | { kind: "lparen" }
  | { kind: "rparen" };

type Node =
  | { kind: "num"; value: number }
  | { kind: "var"; name: string }
  | { kind: "neg"; arg: Node }
  | { kind: "call"; name: string; arg: Node }
  | { kind: "bin"; op: "+" | "-" | "*" | "/"; l: Node; r: Node }
  | { kind: "pow"; l: Node; r: Node };

export interface ParsedExpression {
  ok: true;
  ast: Node;
  /** Parameters (a–d) actually referenced, in slider order. */
  params: string[];
}

export interface ParseFailure {
  ok: false;
  /** Student-facing message — safe to display, never echoes raw code. */
  error: string;
}

export type ParseResult = ParsedExpression | ParseFailure;

/* -------------------------------------------------------------------------- */
/* Tokenizer                                                                   */
/* -------------------------------------------------------------------------- */

function tokenize(source: string): Token[] | null {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const char = source[i];
    if (char === " " || char === "\t" || char === "\n") {
      i += 1;
      continue;
    }
    if (char >= "0" && char <= "9") {
      let end = i;
      while (end < source.length && source[end] >= "0" && source[end] <= "9") {
        end += 1;
      }
      if (source[end] === ".") {
        end += 1;
        while (end < source.length && source[end] >= "0" && source[end] <= "9") {
          end += 1;
        }
      }
      const value = Number(source.slice(i, end));
      if (!Number.isFinite(value)) return null;
      tokens.push({ kind: "num", value });
      i = end;
      continue;
    }
    if (char >= "a" && char <= "z") {
      let end = i;
      while (end < source.length && source[end] >= "a" && source[end] <= "z") {
        end += 1;
      }
      tokens.push({ kind: "name", name: source.slice(i, end) });
      i = end;
      continue;
    }
    if (char === "(") {
      tokens.push({ kind: "lparen" });
      i += 1;
      continue;
    }
    if (char === ")") {
      tokens.push({ kind: "rparen" });
      i += 1;
      continue;
    }
    if (char === "+" || char === "-" || char === "*" || char === "/" || char === "^") {
      tokens.push({ kind: "op", op: char });
      i += 1;
      continue;
    }
    return null; // any other character (including uppercase, quotes, $) fails
  }
  return tokens;
}

/* -------------------------------------------------------------------------- */
/* Parser                                                                      */
/* -------------------------------------------------------------------------- */

/** True when a token can begin an atom (used for implicit multiplication). */
function startsAtom(token: Token | undefined): boolean {
  return (
    token !== undefined &&
    (token.kind === "num" || token.kind === "name" || token.kind === "lparen")
  );
}

export function parseExpression(source: string): ParseResult {
  const trimmed = source.trim().slice(0, MAX_EXPRESSION_LENGTH);
  if (trimmed.length === 0) return { ok: false, error: "Enter an expression, e.g. sin(x)." };
  if (source.trim().length > MAX_EXPRESSION_LENGTH) {
    return { ok: false, error: `Expressions are limited to ${MAX_EXPRESSION_LENGTH} characters.` };
  }
  const tokens = tokenize(trimmed);
  if (tokens === null || tokens.length === 0) {
    return {
      ok: false,
      error:
        "That expression uses symbols I can't plot. You can use numbers, x, parameters a–d, + − × ÷, ^, parentheses and functions like sin, cos, sqrt, ln, log.",
    };
  }

  const usedNames = new Set<string>();
  let position = 0;

  const peek = (): Token | undefined => tokens[position];

  function parseExpr(): Node | null {
    let left = parseTerm();
    if (left === null) return null;
    for (;;) {
      const token = peek();
      if (token && token.kind === "op" && (token.op === "+" || token.op === "-")) {
        position += 1;
        const right = parseTerm();
        if (right === null) return null;
        left = { kind: "bin", op: token.op, l: left, r: right };
      } else return left;
    }
  }

  function parseTerm(): Node | null {
    let left = parseUnary();
    if (left === null) return null;
    for (;;) {
      const token = peek();
      if (token && token.kind === "op" && (token.op === "*" || token.op === "/")) {
        position += 1;
        const right = parseUnary();
        if (right === null) return null;
        left = { kind: "bin", op: token.op, l: left, r: right };
        continue;
      }
      // School-friendly implicit multiplication: 2x, 3sin(x), 2(x+1).
      if (startsAtom(token)) {
        const right = parseUnary();
        if (right === null) return null;
        left = { kind: "bin", op: "*", l: left, r: right };
        continue;
      }
      return left;
    }
  }

  function parseUnary(): Node | null {
    const token = peek();
    if (token && token.kind === "op" && token.op === "-") {
      position += 1;
      const arg = parseUnary();
      return arg === null ? null : { kind: "neg", arg };
    }
    if (token && token.kind === "op" && token.op === "+") {
      position += 1; // unary plus: no-op
      return parseUnary();
    }
    return parsePower();
  }

  function parsePower(): Node | null {
    const base = parseAtom();
    if (base === null) return null;
    const token = peek();
    if (token && token.kind === "op" && token.op === "^") {
      position += 1;
      const exponent = parseUnary(); // right-associative: 2^3^2 = 2^(3^2)
      if (exponent === null) return null;
      return { kind: "pow", l: base, r: exponent };
    }
    return base;
  }

  function parseAtom(): Node | null {
    const token = peek();
    if (!token) return failAt("The expression ends too early.");
    if (token.kind === "num") {
      position += 1;
      return { kind: "num", value: token.value };
    }
    if (token.kind === "lparen") {
      position += 1;
      const inner = parseExpr();
      if (inner === null) return null;
      const close = peek();
      if (!close || close.kind !== "rparen") {
        return failAt("Every ( needs a matching ).");
      }
      position += 1;
      return inner;
    }
    if (token.kind === "name") {
      position += 1;
      const next = peek();
      if (next && next.kind === "lparen") {
        const fn = GRAPH_FUNCTIONS[token.name];
        if (!fn) return failAt(`Unknown function "${token.name}".`);
        position += 1;
        const arg = parseExpr();
        if (arg === null) return null;
        const close = peek();
        if (!close || close.kind !== "rparen") {
          return failAt("Every ( needs a matching ).");
        }
        position += 1;
        usedNames.add(token.name);
        return { kind: "call", name: token.name, arg };
      }
      if (token.name === GRAPH_VARIABLE) {
        usedNames.add(token.name);
        return { kind: "var", name: token.name };
      }
      if (token.name in GRAPH_CONSTANTS) {
        usedNames.add(token.name);
        return { kind: "var", name: token.name };
      }
      if ((GRAPH_PARAMETERS as readonly string[]).includes(token.name)) {
        usedNames.add(token.name);
        return { kind: "var", name: token.name };
      }
      return failAt(`Unknown name "${token.name}". Use x, a–d, pi, e, or a function like sin.`);
    }
    return failAt("Unexpected symbol in the expression.");
  }

  /** Records a parse failure into a thrown sentinel so every level unwinds. */
  class ParseError extends Error {}
  let failureMessage = "";
  function failAt(message: string): never {
    failureMessage = message;
    throw new ParseError(message);
  }

  try {
    const ast = parseExpr();
    if (ast === null || position !== tokens.length) {
      return {
        ok: false,
        error: failureMessage || "I couldn't understand that expression — check the brackets and operators.",
      };
    }
    const params = GRAPH_PARAMETERS.filter((name) => usedNames.has(name));
    return { ok: true, ast, params };
  } catch (error) {
    if (error instanceof ParseError) return { ok: false, error: failureMessage };
    return { ok: false, error: "I couldn't plot that expression." };
  }
}

/* -------------------------------------------------------------------------- */
/* Evaluation & sampling                                                       */
/* -------------------------------------------------------------------------- */

function evaluate(node: Node, x: number, params: Record<string, number>): number {
  switch (node.kind) {
    case "num":
      return node.value;
    case "var":
      if (node.name === GRAPH_VARIABLE) return x;
      if (node.name in GRAPH_CONSTANTS) return GRAPH_CONSTANTS[node.name];
      return params[node.name] ?? Number.NaN;
    case "neg":
      return -evaluate(node.arg, x, params);
    case "call":
      return GRAPH_FUNCTIONS[node.name](evaluate(node.arg, x, params));
    case "bin": {
      const l = evaluate(node.l, x, params);
      const r = evaluate(node.r, x, params);
      switch (node.op) {
        case "+":
          return l + r;
        case "-":
          return l - r;
        case "*":
          return l * r;
        case "/":
          return l / r;
      }
      return Number.NaN;
    }
    case "pow":
      return evaluate(node.l, x, params) ** evaluate(node.r, x, params);
  }
  return Number.NaN;
}

export interface PlotPoint {
  x: number;
  y: number;
}

export interface PlotBounds {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

export const DEFAULT_BOUNDS: PlotBounds = {
  xMin: -10,
  xMax: 10,
  yMin: -10,
  yMax: 10,
};

/**
 * Clamps student- or model-supplied bounds to finite values inside
 * ±1000 with a minimum span, falling back to the defaults when unusable.
 */
export function normalizeBounds(input: Partial<PlotBounds>): PlotBounds {
  const pick = (value: number | undefined, fallback: number): number => {
    if (!isFiniteNumber(value)) return fallback;
    return Math.min(1000, Math.max(-1000, value));
  };
  const xMin = pick(input.xMin, DEFAULT_BOUNDS.xMin);
  const xMax = pick(input.xMax, DEFAULT_BOUNDS.xMax);
  const yMin = pick(input.yMin, DEFAULT_BOUNDS.yMin);
  const yMax = pick(input.yMax, DEFAULT_BOUNDS.yMax);
  const fixSpan = (lo: number, hi: number): [number, number] => {
    if (hi - lo < 0.01) return [lo, lo + 10];
    return [lo, hi];
  };
  const [fxMin, fxMax] = fixSpan(Math.min(xMin, xMax), Math.max(xMin, xMax));
  const [fyMin, fyMax] = fixSpan(Math.min(yMin, yMax), Math.max(yMin, yMax));
  return { xMin: fxMin, xMax: fxMax, yMin: fyMin, yMax: fyMax };
}

/** Default sample density: one sample per ~2 screen pixels. */
export const DEFAULT_SAMPLES = 480;

/**
 * Samples a parsed expression across [xMin, xMax] and splits the points into
 * CONTINUOUS SEGMENTS: a new segment starts after a non-finite value or a
 * jump larger than the discontinuity threshold (so tan(x) breaks cleanly at
 * its asymptotes instead of drawing a vertical wall).
 */
export function plotSegments(
  parsed: ParsedExpression,
  params: Record<string, number>,
  bounds: PlotBounds,
  samples: number = DEFAULT_SAMPLES,
): PlotPoint[][] {
  const count = Math.min(2000, Math.max(20, Math.round(samples)));
  const span = bounds.yMax - bounds.yMin;
  // Two discontinuity signals: an enormous jump (overflow-scale), or a sign
  // flip between two samples that are BOTH far off the chart — the classic
  // signature of an asymptote (tan, 1/x). A curve crossing zero inside the
  // view has small magnitudes at the crossing, so it is never broken.
  const jumpThreshold = Math.max(1e4, span * 100);
  const offChart =
    3 * Math.max(Math.abs(bounds.yMin), Math.abs(bounds.yMax), 1);
  const step = (bounds.xMax - bounds.xMin) / (count - 1);
  const segments: PlotPoint[][] = [];
  let current: PlotPoint[] = [];
  let previousY: number | null = null;
  for (let i = 0; i < count; i += 1) {
    const x = bounds.xMin + step * i;
    const y = evaluate(parsed.ast, x, params);
    if (!Number.isFinite(y)) {
      if (current.length > 0) segments.push(current);
      current = [];
      previousY = null;
      continue;
    }
    if (previousY !== null) {
      const jumped = Math.abs(y - previousY) > jumpThreshold;
      const crossedOffChart =
        previousY * y < 0 &&
        Math.max(Math.abs(previousY), Math.abs(y)) > offChart;
      if (jumped || crossedOffChart) {
        if (current.length > 0) segments.push(current);
        current = [];
      }
    }
    current.push({ x, y });
    previousY = y;
  }
  if (current.length > 0) segments.push(current);
  return segments;
}

/**
 * Re-validates an interactive-visual spec before it may render (Phase 3).
 * Stored message rows are never trusted blindly: vector components must be
 * finite and within `makeVec`'s bounds, and a graph expression must fully
 * parse with THIS parser (whitelisted AST, no eval). Anything else → null.
 */
export function validateExploreSpec(
  explore: AshyExplore | null | undefined,
): AshyExplore | null {
  if (!explore) return null;
  if (explore.type === "vectors") {
    const { ax, ay, bx, by } = explore;
    if (!makeVec(ax, ay) || !makeVec(bx, by)) return null;
    return { type: "vectors", ax, ay, bx, by };
  }
  if (explore.type === "graph") {
    if (typeof explore.expression !== "string") return null;
    if (!parseExpression(explore.expression).ok) return null;
    return { type: "graph", expression: explore.expression };
  }
  return null;
}

/** Convenience: parse + sample in one call (used by tests and previews). */
export function sampleExpression(
  source: string,
  params: Record<string, number> = {},
  bounds: PlotBounds = DEFAULT_BOUNDS,
): { ok: true; segments: PlotPoint[][]; params: string[] } | ParseFailure {
  const parsed = parseExpression(source);
  if (!parsed.ok) return parsed;
  return {
    ok: true,
    segments: plotSegments(parsed, params, normalizeBounds(bounds)),
    params: parsed.params,
  };
}
