/**
 * Candidate filtering: the visibility hard gate and the single-candidate
 * rule. Hidden, struck-through, zero-size, transparent or offscreen nodes
 * are discarded before scoring; two visible, unequal candidates for the same
 * scalar is ambiguity, and ambiguity is refused — the engine never picks the
 * friendlier number.
 *
 * Visibility is judged from computed/inline style and DOM ancestry only —
 * never from getBoundingClientRect(), which returns an all-zero rect for
 * every element under jsdom (no real layout engine) and would make this
 * gate untestable against the fixture corpus. The offscreen-positioning
 * check below is a style-based heuristic (large negative absolute/fixed
 * offset) for exactly that reason.
 */
const LARGE_NEGATIVE_OFFSET = /^-\d{3,}(\.\d+)?px$/;
const HIDDEN_ATTR_SELECTOR = '[hidden], [aria-hidden="true"]';

function computedStyleOf(el: Element): CSSStyleDeclaration | undefined {
  const win = el.ownerDocument?.defaultView;
  return win ? win.getComputedStyle(el) : undefined;
}

function isOffscreenPositioned(style: CSSStyleDeclaration): boolean {
  if (style.position !== "absolute" && style.position !== "fixed") return false;
  return LARGE_NEGATIVE_OFFSET.test(style.left) || LARGE_NEGATIVE_OFFSET.test(style.top);
}

/** A common visually-hidden ("sr-only") clip pattern: a 1x1 clipped box. */
function isClippedToAPixel(style: CSSStyleDeclaration): boolean {
  return style.width === "1px" && style.height === "1px" && style.overflow === "hidden";
}

/** Visibility hard gate for a single rendered node. */
export function isVisibleCandidate(el: Element): boolean {
  if (el.closest(HIDDEN_ATTR_SELECTOR)) return false;
  if (el.closest("del, s, strike")) return false;

  const style = computedStyleOf(el);
  if (!style) return true; // no window (non-DOM test context): nothing to disqualify on
  if (style.display === "none") return false;
  if (style.visibility === "hidden" || style.visibility === "collapse") return false;
  if (style.opacity === "0") return false;
  if (style.textDecorationLine.includes("line-through")) return false;
  if (isOffscreenPositioned(style)) return false;
  if (isClippedToAPixel(style)) return false;
  return true;
}

function normalizedText(el: Element): string {
  return (el.textContent ?? "").trim().replace(/\s+/g, " ");
}

/**
 * Applies the visibility gate, then the single-candidate rule: returns the
 * one surviving element (or several exactly-equal ones collapsed to one), or
 * null when the survivors disagree or none survive.
 */
export function selectSingleCandidate(els: readonly Element[]): Element | null {
  const visible = els.filter(isVisibleCandidate);
  if (visible.length === 0) return null;

  const distinctTexts = new Set(visible.map(normalizedText));
  if (distinctTexts.size > 1) return null; // disagreement — degrade, never pick

  return visible[0] ?? null;
}
