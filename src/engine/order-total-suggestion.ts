/**
 * Produces an OrderTotalSuggestion (src/shared/types.ts) for exactly one
 * caller: src/overlay/OverlayHost.ts's "Add a plan" action on a terminal
 * DEGRADED state. This is a ONE-SHOT read -- called synchronously, at most
 * once per mounted state, from that user action -- and attaches no
 * MutationObserver of its own. The cost doctrine at
 * src/engine/lifecycle.ts:17-22 ("cheap to say something once, expensive
 * to keep watching") is about continuous observation, not a single
 * querySelectorAll pass, so a one-time read here does not reopen it.
 *
 * Reuses the exact anchoring/guardrail machinery the real generic detector
 * uses for the same labelled-total row (src/engine/generic-detector.ts's
 * detectCheckout/extractGeneric): locateByCssOrLabel's exact-label match
 * (plus its one permitted trailing-colon loosening -- see the comment at
 * that match site in src/engine/extraction-helpers.ts), the frozen
 * single-candidate/visibility gate (selectSingleCandidate), and the
 * strict money grammar (ExtractionCore.parseMoney). BLANK (null) on any
 * doubt -- ambiguity, an unparsable amount, or no exact label match at
 * all -- exactly like every other extraction path in this engine.
 *
 * Deliberately does NOT call extractGeneric() itself: that function also
 * looks for an installment-phrase cluster and grades the result through
 * gradeCandidate into a PartialCandidate, neither of which this path may
 * ever produce. A DEGRADED page has, by definition, no honest source for
 * anything but the order total (see engine.ts's fallback rule and this
 * module's return type) -- so this function reimplements only the total
 * half of extractGeneric's locate-normalize-parse sequence, not the whole
 * function.
 */
import type { OrderTotalSuggestion } from "../shared/types";
import type { ExtractionCore, PageProbe } from "./types";
import { locateByCssOrLabel } from "./extraction-helpers";
import { GENERIC_ORDER_TOTAL_LABEL_LEXICON } from "./generic-lexicon";

function normalizedText(el: Element): string {
  return (el.textContent ?? "").trim().replace(/\s+/g, " ");
}

/**
 * Returns an OrderTotalSuggestion carrying exactly `{ cents, currency }`,
 * or null when no single, unambiguous, currency-parsing order-total label
 * can be found. Never throws; never reads anything beyond the one anchor
 * element's own text.
 */
export function readOrderTotalSuggestion(page: PageProbe, core: ExtractionCore): OrderTotalSuggestion | null {
  const anchor = locateByCssOrLabel(page, [], GENERIC_ORDER_TOTAL_LABEL_LEXICON);
  if (!anchor) return null;

  const normalized = core.normalizeText(normalizedText(anchor.element));
  if (normalized.kind !== "ok") return null;

  const parsed = core.parseMoney(normalized.text);
  if (parsed.kind !== "parsed") return null;

  return { cents: parsed.cents, currency: parsed.currency };
}
