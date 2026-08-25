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
 * The precedence logic itself, parameterized over an adapter list so it is
 * independently testable against fake adapters (tie-break order, a
 * throwing match(), a lower-specificity adapter losing to a later, higher
 * one) without depending on real bundled config / real hosts to construct
 * those scenarios. `selectAdapter` below is the sanctioned entrypoint,
 * always called with the real ADAPTER_REGISTRY.
 */
export function selectAdapterFrom(
  adapters: readonly CheckoutAdapter[],
  page: PageProbe,
): CheckoutAdapter | null {
  let winner: CheckoutAdapter | null = null;
  let winningSpecificity = -1;
  for (const adapter of adapters) {
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

/**
 * Selects the single winning adapter for a page, or null when none match
 * (the engine then falls back to the generic detector).
 */
export function selectAdapter(page: PageProbe): CheckoutAdapter | null {
  return selectAdapterFrom(ADAPTER_REGISTRY, page);
}
