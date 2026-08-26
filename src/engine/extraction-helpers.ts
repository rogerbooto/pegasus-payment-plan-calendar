/**
 * Shared anchor-location helpers used by BOTH the generic detector and
 * every platform adapter, so "primary selector first, label-lexicon
 * fallback second, never launder an ambiguous primary result through the
 * fallback" has exactly one implementation.
 *
 * These helpers call the visibility/normalization PRIMITIVES
 * (isVisibleCandidate, normalizeOrReject) directly rather than through an
 * injected ExtractionCore: `CheckoutAdapter.locate()` runs before any
 * `ExtractionCore` is available by interface design (the design spec -- `locate`
 * takes only a `PageProbe`), so locate-time candidate filtering must work
 * without one. Nothing here re-implements those primitives; it calls the
 * real src/parser/* functions, exactly as src/parser/candidates.ts itself
 * does internally. The money/arithmetic half of the core (which DOES need
 * to be the injected `core` argument) is only ever invoked from
 * `extract()`, in the adapters and the generic detector -- see
 * src/engine/adapter-common.ts and src/engine/generic-detector.ts.
 */
import type { PageProbe } from "./types";
import { selectSingleCandidate, isVisibleCandidate } from "../parser/candidates";
import { normalizeOrReject } from "../parser/unicode";
import { compilePattern, matchInstalmentPhrase, type InstalmentPhraseMatch } from "./pattern-compiler";

export interface LocatedAnchor {
  readonly element: Element;
  /** True when found via the platform-specific/primary selector, false via the label-lexicon fallback. */
  readonly viaPrimaryAnchor: boolean;
}

const LABEL_MATCH_ELEMENT_SELECTOR = "span, div, td, dt, dd, p, strong, b, th, small";
/** Text-bearing tags the instalment-phrase scan considers; bounds the O(n) DOM walk. */
const TEXT_BEARING_SELECTOR = "div, span, p, li, td, dt, dd, strong, b, small, label";

function normalizedTrim(text: string | null): string {
  return (text ?? "").trim().replace(/\s+/g, " ");
}

function findValueNearLabel(label: Element): Element[] {
  const sibling = label.nextElementSibling;
  if (sibling && normalizedTrim(sibling.textContent).length > 0) return [sibling];
  const parent = label.parentElement;
  if (!parent) return [];
  return [...parent.children].filter((el) => el !== label && normalizedTrim(el.textContent).length > 0);
}

/**
 * Locates a single-value anchor (order total or a bnpl-widget text marker):
 * the CSS selector list is tried first (a platform adapter's primary,
 * documented anchor). If CSS matches nothing at all, the label lexicon is
 * the fallback (used verbatim by the generic detector, which has no CSS
 * selectors of its own). If CSS matches but the result is AMBIGUOUS
 * (multiple disagreeing visible candidates), the search stops there and
 * returns null -- an ambiguous primary result is never rescued by the
 * weaker label-lexicon path, which would let a CSS-visible decoy be
 * laundered through a second heuristic.
 */
export function locateByCssOrLabel(
  page: PageProbe,
  cssSelectors: readonly string[],
  labelLexicon: readonly string[] | undefined,): LocatedAnchor | null {
  const cssCandidates = cssSelectors.flatMap((sel) => [...page.querySelectorAll(sel)]);
  if (cssCandidates.length > 0) {
    const selected = selectSingleCandidate(cssCandidates);
    return selected ? { element: selected, viaPrimaryAnchor: true } : null;
  }
  if (!labelLexicon || labelLexicon.length === 0) return null;

  const lexicon = new Set(labelLexicon.map((t) => t.toLowerCase()));
  const labelCandidates = [...page.querySelectorAll(LABEL_MATCH_ELEMENT_SELECTOR)].filter((el) =>
    lexicon.has(normalizedTrim(el.textContent).toLowerCase()),);
  const valueCandidates = labelCandidates.flatMap((label) => findValueNearLabel(label));
  if (valueCandidates.length === 0) return null;
  const selected = selectSingleCandidate(valueCandidates);
  return selected ? { element: selected, viaPrimaryAnchor: false } : null;
}

/**
 * Locates a BNPL provider widget: a platform-controlled custom element/class
 * first, a known provider iframe origin second. Only the iframe's `src` is
 * ever read (for its origin) -- never its contents.
 */
export function locateProviderWidget(
  page: PageProbe,
  cssSelectors: readonly string[],
  iframeOrigins: readonly string[] | undefined,): Element | null {
  for (const sel of cssSelectors) {
    const found = page.querySelectorAll(sel);
    if (found.length > 0) return found[0] ?? null;
  }
  if (!iframeOrigins || iframeOrigins.length === 0) return null;
  for (const frame of page.querySelectorAll("iframe")) {
    const src = frame.getAttribute("src") ?? "";
    if (iframeOrigins.some((origin) => src.includes(origin))) return frame;
  }
  return null;
}

/**
 * Matches ONE element's own normalized text against a pattern list (never a
 * subtree's aggregate text), so a count in one node and an amount in
 * another are structurally unable to be joined. Rejects (returns
 * null) if the element isn't currently visible or its text fails the
 * bidi/homoglyph normalization boundary -- the same visibility hard gate
 * every other candidate must pass.
 */
export function matchClusterElement(element: Element, patterns: readonly string[]): InstalmentPhraseMatch | null {
  if (!isVisibleCandidate(element)) return null;
  const text = normalizedTrim(element.textContent);
  if (text.length === 0) return null;
  const normalized = normalizeOrReject(text);
  if (normalized.kind !== "ok") return null;
  for (const pattern of patterns) {
    const match = matchInstalmentPhrase(compilePattern(pattern), normalized.text);
    if (match) return match;
  }
  return null;
}

/**
 * Locates the instalment-phrase cluster: the most specific (leaf-most)
 * element whose own text matches one of the patterns (via
 * matchClusterElement above). An ancestor whose full-subtree textContent
 * happens to superset-match is never preferred over the narrower node that
 * actually carries the phrase.
 */
export function locateInstalmentCluster(
  page: PageProbe,
  patterns: readonly string[],): { element: Element; match: InstalmentPhraseMatch } | null {
  const matches: { element: Element; match: InstalmentPhraseMatch }[] = [];

  for (const el of page.querySelectorAll(TEXT_BEARING_SELECTOR)) {
    const match = matchClusterElement(el, patterns);
    if (match) matches.push({ element: el, match });
  }

  if (matches.length === 0) return null;
  const matchedElements = new Set(matches.map((m) => m.element));
  const leafMatches = matches.filter(
    (m) =>
      !matches.some(
        (other) => other.element !== m.element && m.element.contains(other.element) && matchedElements.has(other.element),),);
  return leafMatches[0] ?? matches[0] ?? null;
}
