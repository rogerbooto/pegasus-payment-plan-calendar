/**
 * Compiles a validated instalment-phrase pattern string (the restricted
 * token language from src/config/loader.ts: literals plus {count} {money}
 * {cadence}) into a RegExp that binds count + amount + cadence in one text
 * cluster (D6 §A.2/§E.3 -- a count found in one node and an amount found in
 * another are never joined). This is the ONE compiler used by both the
 * generic detector and every adapter, so the binding rule can't be
 * re-implemented (and silently weakened) per call site.
 *
 * Patterns arriving here have already passed src/config/loader.ts's
 * charset/token validation, but this function re-derives the token split
 * itself (never trusts a caller-supplied regex) and only ever emits a
 * pattern built from the fixed token table below -- there is no path from a
 * config string to an interpolated regex fragment.
 */
export interface InstalmentPhraseMatch {
  readonly countRaw: string;
  readonly moneyRaw: string;
  readonly cadenceRaw: string | undefined;
}

const TOKEN_ORDER = ["{count}", "{money}", "{cadence}"] as const;
type Token = (typeof TOKEN_ORDER)[number];

/** Fixed, non-interpolated regex fragments -- the only shapes a token can ever expand to. */
const TOKEN_REGEX: Readonly<Record<Token, string>> = {
  "{count}": "(\\d{1,2})",
  "{money}": "((?:CA\\$|US\\$|\\$)\\s?[\\d,]+\\.\\d{2}|[\\d,]+[.,]\\d{2}\\s?(?:CAD|USD|\\$))",
  "{cadence}":
    "(every\\s+week|weekly|every\\s+\\d+\\s+weeks?|every\\s+month|monthly|" +
    "chaque\\s+semaine|aux\\s+\\d+\\s+semaines|chaque\\s+mois)",
};

/** Escapes literal (non-whitespace) text for safe inclusion in a RegExp. */
function escapeLiteral(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Converts a literal (non-token) pattern segment to a regex fragment,
 * preserving BOUNDARY whitespace as \s+ (not just internal whitespace).
 * A naive "trim, then join non-whitespace pieces with \\s+" loses the
 * space between a token and the literal word that follows it (e.g.
 * "{count} payments" would otherwise require "4payments" with no space at
 * all) -- splitting on a CAPTURING whitespace regex keeps every run of
 * whitespace, including leading/trailing, as its own element to map.
 */
function literalToRegexFragment(segment: string): string {
  return segment
    .split(/(\s+)/)
    .map((piece) => (/^\s+$/.test(piece) ? "\\s+" : escapeLiteral(piece)))
    .join("");
}

const TOKEN_SPLIT = /(\{count\}|\{money\}|\{cadence\})/g;

/** Which capture group index (1-based) each token occupies, in source order. */
export interface CompiledPattern {
  readonly regex: RegExp;
  readonly groupOrder: readonly Token[];
}

export function compilePattern(pattern: string): CompiledPattern {
  const segments = pattern.split(TOKEN_SPLIT).filter((s) => s.length > 0);
  const groupOrder: Token[] = [];
  let source = "";
  for (const segment of segments) {
    if ((TOKEN_ORDER as readonly string[]).includes(segment)) {
      const token = segment as Token;
      groupOrder.push(token);
      source += TOKEN_REGEX[token];
    } else {
      // A validated pattern's literal text (including the whitespace
      // BETWEEN a token and the word next to it) becomes \s+ so minor
      // markup-driven spacing differences (a <br> collapsed to a space by
      // textContent, e.g.) don't cause a spurious non-match -- see
      // literalToRegexFragment's docstring for why boundary whitespace
      // must be preserved, not just internal whitespace.
      source += literalToRegexFragment(segment);
    }
  }
  return { regex: new RegExp(source, "i"), groupOrder };
}

/**
 * Runs a compiled pattern against ONE cluster of text (a single element's
 * normalized textContent) and extracts count/money/cadence together, or
 * null if the pattern doesn't match this cluster at all. A pattern with no
 * {cadence} token yields `cadenceRaw: undefined` -- cadence stays an
 * unresolved (missing) scalar rather than a guess, exactly per D6 §D.2.
 */
export function matchInstalmentPhrase(compiled: CompiledPattern, text: string): InstalmentPhraseMatch | null {
  const m = compiled.regex.exec(text);
  if (!m) return null;
  let countRaw: string | undefined;
  let moneyRaw: string | undefined;
  let cadenceRaw: string | undefined;
  compiled.groupOrder.forEach((token, i) => {
    const value = m[i + 1];
    if (token === "{count}") countRaw = value;
    else if (token === "{money}") moneyRaw = value;
    else if (token === "{cadence}") cadenceRaw = value;
  });
  if (countRaw === undefined || moneyRaw === undefined) return null;
  return { countRaw, moneyRaw, cadenceRaw };
}
