/**
 * Every user-facing string on the overlay and popup surfaces, centralized
 * per the design spec These strings were checked against the
 * full BLOCKED_COPY_PATTERNS list and are final: this module renders them
 * verbatim and never rewords, improves, or appends to them. Template
 * functions only substitute the named placeholders the spec defines; they
 * never add adjectives, verdicts, or extra clauses.
 */

export const PANEL_TITLE = "Payment plan dates";
export const NOT_ADDED_TAG = "Not added yet";
export const QUALIFIER_SOURCE = "Based only on plans you entered.";
export const QUALIFIER_LOCAL = "Everything stays on this device.";
export const ACTION_CHECK = "Check the numbers";
export const ACTION_ADD = "Add a plan";
export const VIEW_SWITCH = "Next 30 days";
export const VIEW_SWITCH_BACK = "This plan";
export const FORM_TITLE = "The numbers we read from this page";
export const FORM_SUB = "Change anything that doesn't match, then add it.";
export const FORM_TITLE_EMPTY = "Add a plan";
export const FORM_SUB_EMPTY = "Fill in what the checkout is offering you.";
export const FORM_PARTIAL_LEAD = "We read part of this plan. Fill in the rest and check what's here.";
/**
 * Shown on the manual "Add a plan" form only when the page reached a
 * DEGRADED state (the engine could not confirm it as a checkout at all)
 * AND a single order-total suggestion was still read from it
 * (src/engine/order-total-suggestion.ts). Deliberately distinct from
 * FORM_PARTIAL_LEAD: "We read part of this plan" would be false here --
 * no plan, partial or otherwise, was ever detected, only one labelled
 * number on the page. This line makes exactly two claims: an order total
 * was read, and no installment plan was found — both true at once.
 */
export const FORM_ORDER_TOTAL_ONLY_LEAD =
  "We read the order total shown on this page. We didn't find an installment plan here — fill in the rest.";
export const FIELD_HINT_PARSED = "Read from this page — change it if it's wrong.";
export const FIELD_HINT_MISSING = "Not found on this page.";
export const FIELD_HINT_FIRST_PAYMENT = "Today, unless the plan starts later.";
export const FORM_SUBMIT = "Add to my calendar";
export const FORM_CANCEL = "Cancel";
export const SAVED_STATUS = "Added. These dates are on your calendar now.";
export const SAVED_UNDO = "Remove this plan";
export const REMOVED_STATUS = "Removed.";
export const REMOVED_UNDO = "Add it back";
export const NOT_RECOGNIZED = "We don't recognize this checkout yet. You can add the plan manually.";
/**
 * Distinct from NOT_RECOGNIZED: shown when the pre-gate's structural signal
 * (a URL pattern or platform match) fired but nothing on the page confirmed
 * it, so the engine never actually looked at this page's checkout content.
 * Unlike NOT_RECOGNIZED, this string never asserts the page IS a checkout --
 * some pages that reach this state (e.g. a path that merely contains the
 * word "checkout") are not.
 */
export const NOT_CONFIRMED = "We can't tell if this page is a checkout. You can add the plan manually.";
export const EMPTY_LEDGER = "No other plans entered yet. Anything you add shows up on this calendar.";
export const SAVE_FAILED =
  "That didn't save. Your browser storage may be full. Try again, or check the extension's settings.";
export const DISMISS_LABEL = "Dismiss this panel";
export const COLLAPSE_LABEL = "Collapse — Payment plan dates";
export const EXPAND_LABEL = "Expand — Payment plan dates";

/** Field labels — the confirmation/manual-entry form (§4.4, mockups). */
export const FIELD_LABEL_TOTAL = "Order total";
export const FIELD_LABEL_COUNT = "Number of payments";
export const FIELD_LABEL_CADENCE = "How often";
export const FIELD_LABEL_EACH = "Amount per payment";
export const FIELD_LABEL_FIRST = "First payment";

export const CADENCE_OPTION_LABELS: Readonly<Record<"WEEKLY" | "BIWEEKLY" | "MONTHLY", string>> = {
  BIWEEKLY: "Every 2 weeks",
  WEEKLY: "Every week",
  MONTHLY: "Monthly",
};
export const CADENCE_CHOOSE_ONE = "Choose one";

/**
 * The popup's own empty-ledger line, verbatim from
 * the approved design's "Before there are any plans"
 * case — distinct from EMPTY_LEDGER (§4.9), which renders inside an active
 * impact view. This string stands alone, so it is used where no candidate
 * is under consideration: the toolbar popup with zero saved plans.
 */
export const POPUP_EMPTY_LEDGER = "No plans yet. Add one manually, or confirm one at a supported checkout.";

const WORD_NUMBERS = [
  "Zero",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
  "Twenty",
] as const;

/** Sentence-leading count word, per the mockups' "Two payments...", "Three payments...". */
export function countWord(n: number): string {
  const word = WORD_NUMBERS[n];
  return word ?? String(n);
}

export interface ImpactHeroParts {
  readonly countAndAmount: string; // "4 payments of $37.50"
  readonly dates: readonly string[];
}

/**
 * IMPACT_HERO — "This plan adds {n} payments of {amount} on {d1}, {d2}, ...".
 * Returns the parts needed to build one <p> with internal emphasis spans
 * (§5.1) — callers never split this into sibling nodes.
 */
export function impactHeroParts(installmentCount: number, amountText: string, dates: readonly string[]): ImpactHeroParts {
  return {
    countAndAmount: `${installmentCount} payments of ${amountText}`,
    dates,
  };
}

/** IMPACT_SAME_DAY (before adding) / IMPACT_SAME_DAY_AFTER (after adding). */
export function sameDayLine(count: number, date: string, sum: string, added: boolean): {
  readonly lead: string;
  readonly date: string;
  readonly tail: string;
  readonly sum: string;
} {
  const verb = added ? "fall on" : "also fall on";
  return {
    lead: `${countWord(count)} payments you recorded ${verb}`,
    date,
    tail: "—",
    sum,
  };
}

export function next30SummaryParts(sum: string, n: number): { readonly lead: string; readonly sum: string; readonly mid: string; readonly n: string; readonly tail: string } {
  return { lead: "Your next 30 days:", sum, mid: "across", n: String(n), tail: "payments you've entered." };
}

export function next30Beyond(date: string): string {
  return `One more payment from this plan falls on ${date}, beyond these 30 days.`;
}

export function formEcho(dates: readonly string[]): { readonly lead: string; readonly dates: readonly string[] } {
  return { lead: "These dates:", dates };
}

export function formArithmetic(n: number, amount: string, product: string, total: string): {
  readonly n: number;
  readonly amount: string;
  readonly product: string;
  readonly total: string;
} {
  return { n, amount, product, total };
}
