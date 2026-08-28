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

/**
 * The optional, user-typed plan name ("What it was" — "Laptop",
 * "Headphones"), on the add, confirm and edit forms alike. The label asks
 * for the thing, not a generic "label"/"nickname", per the founder's own
 * framing. The hint makes the one claim that defines this field: only
 * what the user types is saved — the page is never where it comes from.
 */
export const FIELD_LABEL_NAME = "What it was";
export const FIELD_HINT_NAME = "Optional. Only what you type here is saved — it is never read from the page.";
export const FIELD_PLACEHOLDER_NAME = "Laptop";

export const CADENCE_OPTION_LABELS: Readonly<Record<"WEEKLY" | "BIWEEKLY" | "MONTHLY", string>> = {
  BIWEEKLY: "Every 2 weeks",
  WEEKLY: "Every week",
  MONTHLY: "Monthly",
};
export const CADENCE_CHOOSE_ONE = "Choose one";

/**
 * The zero-height visible marker for a field the page did not yield,
 * shown on the label's own line. FIELD_HINT_MISSING remains the full
 * accessible description on the same field (visually hidden); this is its
 * short visual echo, so the marker is aria-hidden and never doubles up in
 * the accessible description.
 */
export const FIELD_FLAG_MISSING = "Not found";

/** Edit form (edit-plan-spec §4.2/§8) -- a third title/sub/submit family,
 * deliberately parallel to FORM_TITLE/FORM_SUB/FORM_SUBMIT rather than a
 * reuse of them: an edit's prefills are the exact opposite of the add
 * form's ("suggestions, never presented as authoritative") -- they ARE
 * what is stored, so the copy has to say that instead. */
export const FORM_TITLE_EDIT = "Change these numbers";
export const FORM_SUB_EDIT = "These are the numbers you saved. Change what's wrong, then save it.";
export const FORM_SUBMIT_EDIT = "Save changes";
/** Replaces FIELD_HINT_PARSED/FIELD_HINT_MISSING/FIELD_HINT_FIRST_PAYMENT on
 * the edit form ONLY (via renderForm's `hintOverride` option) -- those three
 * strings all claim something was read from a page, which is false on a
 * form opened from the toolbar popup with no page in play at all. */
export const EDIT_FIELD_HINT = "This is what you saved. Change it if it's wrong.";

/** The popup plan list (edit-plan-spec §3): one row per saved plan, with a
 * per-row Edit control and (founder-decided, §11.1 revisited) a per-row
 * Remove control alongside it. */
export const EDIT_ACTION_SHORT = "Edit";
/**
 * Per-row Remove (the founder's own call: a list you can correct but never
 * delete from invites "why can I change this but not delete it?"). Not
 * part of the original spec's pre-cleared string list -- follows the exact
 * same disambiguation pattern the spec designed for Edit (§3.4):
 * REMOVE_ACTION_SHORT is the visible label, and the row's own
 * planRowLabelSuffix() supplies the shared visually-hidden suffix, so
 * "Remove, Remove, Remove" never reaches a screen-reader user any more
 * than "Edit, Edit, Edit" would.
 */
export const REMOVE_ACTION_SHORT = "Remove";
export const PLANS_LIST_HEADING = "Plans you've entered";

/** The generalized hero notice (edit-plan-spec §5.3/§5.4) -- replaces the
 * add-only SAVED_STATUS-or-nothing branch with four honest outcomes, plus
 * a fifth (REMOVED_STATUS/REMOVED_UNDO, reused verbatim below) for the
 * founder-added per-row Remove. */
export const EDIT_SAVED_DATES = "Saved. These dates are on your calendar now:";
export const EDIT_SAVED_NO_DATE_CHANGE = "Saved. The dates on your calendar didn't change.";
export const EDIT_NO_CHANGE = "Nothing changed.";
export const EDIT_TARGET_GONE = "That plan isn't there any more. Nothing was changed.";

/**
 * The visually-hidden suffix inside a plan row's Edit or Remove button
 * (edit-plan-spec §3.4): the visible word ("Edit"/"Remove") stays the
 * START of the accessible name (SC 2.5.3 Label in Name), and this suffix
 * disambiguates two plans sharing a first-payment date by naming the
 * per-payment amount too -- the founder's own two-plans-on-one-day
 * screenshot is exactly the case this exists for. Shared by both row
 * controls rather than duplicated: the suffix content itself never
 * mentions which action it is attached to. Named for the row, not either
 * button ("Edit"/"Remove" repeated N times is the same SC 4.1.2 failure
 * either way) — formerly `editRowLabelSuffix`, renamed once Remove
 * started using it too.
 */
export function planRowLabelSuffix(dateText: string, eachText: string, customName = ""): string {
  // The user-typed plan name, when there is one, leads the suffix -- it is
  // the strongest disambiguator two same-day plans can have (the reason
  // the field exists), and the visible word ("Edit"/"Remove") still starts
  // the accessible name, so SC 2.5.3 holds either way.
  const namePart = customName === "" ? "" : ` ${customName} —`;
  return `${namePart} the plan starting ${dateText}, ${eachText} each`;
}

/** A plan row's second line. cadenceLabel is CADENCE_OPTION_LABELS[cadence], verbatim. */
export function planRowSummary(count: number, cadenceLabel: string, totalText: string): string {
  return `First of ${count} payments. ${cadenceLabel}. ${totalText} in total.`;
}

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
