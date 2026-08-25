/**
 * The bundled, ordered adapter registry, compiled into the extension. There
 * is no dynamic registration, no remote adapter list, no plugin mechanism.
 *
 * Precedence: highest static specificity wins; ties break by registry order
 * (deterministic, test-pinned). A platform adapter always outranks the
 * generic detector. Exactly one adapter extracts per checkout session —
 * scalars are never merged across adapters. Fallback is one-directional and
 * single-step: adapter -> generic detector -> DEGRADED, never a retry loop.
 * A thrown adapter is equivalent to no match and degrades, never crashes.
 */
import type { CheckoutAdapter, PageProbe } from "./types";
import { shopifyCheckoutAdapter } from "./adapters/shopify-checkout";
import { stripeHostedAdapter } from "./adapters/stripe-hosted";
import { whopAdapter } from "./adapters/whop";

export const ADAPTER_REGISTRY: readonly CheckoutAdapter[] = [
  shopifyCheckoutAdapter,
  stripeHostedAdapter,
  whopAdapter,
];

/**
 * Selects the single winning adapter for a page, or null when none match
 * (the engine then falls back to the generic detector).
 */
export function selectAdapter(page: PageProbe): CheckoutAdapter | null {
  let winner: CheckoutAdapter | null = null;
  let winningSpecificity = -1;
  for (const adapter of ADAPTER_REGISTRY) {
    let result;
    try {
      result = adapter.match(page);
    } catch {
      continue; // a thrown adapter is equivalent to "no match"
    }
    if (result.matched && result.specificity > winningSpecificity) {
      winner = adapter;
      winningSpecificity = result.specificity;
    }
  }
  return winner;
}
