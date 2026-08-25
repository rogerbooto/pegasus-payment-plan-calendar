/**
 * The cheap, once-run pre-gate (D6 §G.1): URL path pattern + one structural
 * probe. No checkout fingerprint => the caller (src/engine/lifecycle.ts)
 * goes dormant -- no observer, no timers. Deliberately cheaper than the
 * full detectCheckout/detectInstallmentOffer pair in generic-detector.ts:
 * it only decides "is it worth attaching an observer at all", not
 * production of a scalar.
 */
import type { PageProbe } from "./types";
import { selectAdapter } from "./registry";
import { GENERIC_CHECKOUT_PATH_PATTERNS, PAYMENT_AFFORDANCE_SELECTORS } from "./generic-lexicon";

export function cheapPreGate(page: PageProbe): boolean {
  // A matched platform adapter is already a stronger signal than the
  // generic path+probe check below, and match() is the same
  // O(small-constant) cost either way.
  if (selectAdapter(page)) return true;

  if (!GENERIC_CHECKOUT_PATH_PATTERNS.some((pattern) => page.path.includes(pattern))) return false;
  return PAYMENT_AFFORDANCE_SELECTORS.some((selector) => page.querySelectorAll(selector).length > 0);
}
