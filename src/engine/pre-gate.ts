/**
 * The cheap, once-run pre-gate: URL path pattern + one structural
 * probe. No checkout fingerprint => the caller (src/engine/lifecycle.ts)
 * goes dormant -- no observer, no timers. Deliberately cheaper than the
 * full detectCheckout/detectInstallmentOffer pair in generic-detector.ts:
 * it only decides "is it worth attaching an observer at all", not
 * production of a scalar.
 *
 * `cheapPreGate` gates the expensive path (a persistent MutationObserver)
 * and stays strict on purpose -- several GENERIC_CHECKOUT_PATH_PATTERNS
 * entries are loose substrings (`/checkout`, `/pay/`) that also match
 * paths on the same host that are not checkouts at all, and a large site
 * cannot be allowed to pay for continuous DOM observation on every one of
 * them. `looksLikeCheckoutPath` below exposes the weaker, cheaper half of
 * that decision on its own -- "is this worth SAYING something about", as
 * opposed to "is this worth WATCHING" -- so the caller can still surface an
 * honest, one-shot degraded state when the path/adapter signal fired but
 * the probe didn't, without ever attaching the observer for it. See
 * lifecycle.ts's evaluatePreGate for where that split is used, and the
 * design note it links to for why: staying silent here is the exact defect
 * this pair of functions exists to make structurally impossible.
 */
import type { PageProbe } from "./types";
import { selectAdapter } from "./registry";
import { GENERIC_CHECKOUT_PATH_PATTERNS, PAYMENT_AFFORDANCE_SELECTORS } from "./generic-lexicon";

/**
 * Path shape alone, with no affordance confirmation and deliberately no
 * adapter check. True here does NOT mean the page is a checkout -- only
 * that it is worth telling the user something rather than nothing (see
 * DegradeReason's "unconfirmed").
 *
 * There is no `selectAdapter` branch here on purpose, and adding one back
 * would be doubly wrong. First, an adapter match is not an unconfirmed
 * signal at all: `matchAdapterConfig` (adapter-common.ts) only returns
 * `matched` when a CSS probe actually hits, so "adapter matched" already
 * means the page was confirmed, which is the opposite of what this
 * predicate is for. Second, it would be unreachable from the only caller:
 * `evaluatePreGate` (lifecycle.ts) reaches this function solely after
 * `cheapPreGate` returned false, and `cheapPreGate`'s first line already
 * returns true for any adapter match on the same probe in the same tick.
 * It would also re-run every adapter's CSS probes a second time on every
 * page that reaches the dormant path, for a branch that can never fire.
 */
export function looksLikeCheckoutPath(page: PageProbe): boolean {
  return GENERIC_CHECKOUT_PATH_PATTERNS.some((pattern) => page.path.includes(pattern));
}

export function cheapPreGate(page: PageProbe): boolean {
  // A matched platform adapter is already a stronger signal than the
  // generic path+probe check below, and match() is the same
  // O(small-constant) cost either way.
  if (selectAdapter(page)) return true;

  if (!GENERIC_CHECKOUT_PATH_PATTERNS.some((pattern) => page.path.includes(pattern))) return false;
  return PAYMENT_AFFORDANCE_SELECTORS.some((selector) => page.querySelectorAll(selector).length > 0);
}
