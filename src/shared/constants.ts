/**
 * Centralized defaults and thresholds. Changing any value here is a reviewed
 * diff, not a tuning knob buried in a component.
 */

/** Installment count sanity bounds (inclusive). */
export const INSTALLMENT_COUNT_MIN = 2;
export const INSTALLMENT_COUNT_MAX = 24;

/** Order totals above this are treated as parse noise and rejected ($100,000.00). */
export const MAX_ORDER_TOTAL_CENTS = 10_000_000;

/**
 * Arithmetic-consistency tolerance, in cents, for a candidate schedule:
 * |count x perInstallment - orderTotal| <= count
 * (the standard pay-in-four remainder tolerance; the first installment
 * absorbs rounding).
 */
export function arithmeticToleranceCents(installmentCount: number): number {
  return installmentCount;
}

/** Soft-signal score floor for a candidate to be presented as confirmable. */
export const SOFT_SCORE_CONFIRMABLE_FLOOR = 4;
export const SOFT_SIGNAL_MAX = 6;

/** DOM observation timing. */
export const MUTATION_DEBOUNCE_MS = 300;
export const VALUE_STABILITY_TICK_MS = 500;

/** Versions the bundled config and stored data are validated against. */
export const CONFIG_SCHEMA_VERSION = 1;
export const STORAGE_SCHEMA_VERSION = 1;

/** The overlay host custom-element tag (a direct child of document.body). */
export const OVERLAY_HOST_TAG = "pegasus-payment-plan-host";
