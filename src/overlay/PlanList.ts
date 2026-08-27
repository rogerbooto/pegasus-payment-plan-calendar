/**
 * The saved-plan list: one row per plan with a per-row Edit and Remove
 * control, plus the transient outcome notice shown above it whenever an
 * add, edit, remove or undo just happened (edit-plan-spec §3-§5).
 *
 * Shared verbatim by the toolbar popup's hero screen
 * (src/popup/PopupApp.ts) and the in-page overlay's "Plans you've
 * entered" tab (src/overlay/OverlayHost.ts) — the founder's own ruling
 * was that the overlay needed this list as a tab, not a second menu
 * duplicating the popup, and building it as a second hand-maintained copy
 * of the row/notice markup would only let the two surfaces drift apart.
 * Each surface still owns its own heading, empty-state copy and
 * navigation (a plain function call vs. a screen transition) — only the
 * row anatomy and the notice shapes are centralized here.
 */
import type { IsoDate, PaymentPlanRecord } from "../shared/types";
import { formatCents } from "../shared/format";
import { el, text, tokenList } from "./dom";
import { formatMonthDay, formatWeekday } from "./format-helpers";
import * as copy from "./copy";

export interface PlanRowHandlers {
  readonly onEdit: (plan: PaymentPlanRecord) => void;
  readonly onRemove: (plan: PaymentPlanRecord, button: HTMLButtonElement) => void;
}

/** §3.3 — date-ordered, ties keep storage order (Array#sort is stable). */
export function sortedPlans(plans: readonly PaymentPlanRecord[]): readonly PaymentPlanRecord[] {
  return [...plans].sort((a, b) =>
    a.firstPaymentDate < b.firstPaymentDate ? -1 : a.firstPaymentDate > b.firstPaymentDate ? 1 : 0,);
}

/**
 * §3.2 row anatomy, plus the founder-added Remove control (§3.4's
 * disambiguation pattern extended to it: the row's own
 * planRowLabelSuffix() suffix is shared by both buttons, since it never
 * names which action it is attached to). Edit precedes Remove in both DOM
 * order and tab order — non-destructive first.
 */
export function buildPlanRow(plan: PaymentPlanRecord, handlers: PlanRowHandlers): HTMLLIElement {
  const dateText = formatMonthDay(plan.firstPaymentDate);
  const eachText = formatCents(plan.perInstallmentCents, plan.currency);
  const totalText = formatCents(plan.orderTotalCents, plan.currency);
  const suffix = copy.planRowLabelSuffix(dateText, eachText);

  const editBtn = el("button", {
    className: "btn btn--link",
    attrs: { type: "button" },
    children: [text(copy.EDIT_ACTION_SHORT), el("span", { className: "sr-only", text: suffix })],
  });
  editBtn.addEventListener("click", () => handlers.onEdit(plan));

  const removeBtn = el("button", {
    className: "btn btn--link",
    attrs: { type: "button" },
    children: [text(copy.REMOVE_ACTION_SHORT), el("span", { className: "sr-only", text: suffix })],
  });
  removeBtn.addEventListener("click", () => handlers.onRemove(plan, removeBtn));

  return el("li", {
    children: [
      el("span", { className: "date", text: dateText }),
      el("span", { className: "dow", text: formatWeekday(plan.firstPaymentDate) }),
      el("span", { className: "amt", text: eachText }),
      editBtn,
      removeBtn,
      el("span", {
        className: "sub",
        text: copy.planRowSummary(plan.installmentCount, copy.CADENCE_OPTION_LABELS[plan.cadence], totalText),
      }),
    ],
  });
}

/**
 * The full `<ul class="rows">` of plan rows, date-ordered (§3.3). Callers
 * append the returned node wherever their own surface's layout wants it —
 * this function owns row anatomy only, never page chrome.
 */
export function buildPlanRows(plans: readonly PaymentPlanRecord[], handlers: PlanRowHandlers): HTMLUListElement {
  const rows = el("ul", { className: "rows" });
  for (const plan of sortedPlans(plans)) rows.appendChild(buildPlanRow(plan, handlers));
  return rows;
}

/**
 * The transient outcome notice shown above the list (edit-plan-spec
 * §5.3/§5.4): one variant per honest outcome, plus the founder-added
 * "removed" — the one outcome that gets an undo, since the row itself is
 * gone from the list and cannot be corrected in place the way an edit's
 * still-there-either-way property allows.
 */
export type PlanListNotice =
  | { readonly kind: "added" }
  | { readonly kind: "edited"; readonly dates: readonly IsoDate[] | null }
  | { readonly kind: "unchanged" }
  | { readonly kind: "gone" }
  | { readonly kind: "removed"; readonly plan: PaymentPlanRecord };

/**
 * §5.3/§5.4 — the four spec'd outcomes plus the founder-added "removed"
 * one. `.status--text` opts the text-only outcomes out of `.status`'s own
 * flex/gap layout, which exists for the text-plus-link shape "added" and
 * "removed" still use. Every variant carries `tabindex="-1"` so a caller
 * can move focus onto it directly after a destructive or state-changing
 * action, without it joining the normal tab order.
 */
export function buildPlanListNotice(
  notice: PlanListNotice,
  onUndoRemove: (plan: PaymentPlanRecord, button: HTMLButtonElement) => void,
): HTMLElement {
  if (notice.kind === "added") {
    return el("p", { className: "status", attrs: { role: "status", tabindex: "-1" }, text: copy.SAVED_STATUS });
  }
  if (notice.kind === "edited") {
    if (notice.dates) {
      return el("p", {
        className: "status status--text",
        attrs: { role: "status", tabindex: "-1" },
        children: [text(`${copy.EDIT_SAVED_DATES} `), ...tokenList(notice.dates.map((d) => formatMonthDay(d)))],
      });
    }
    return el("p", {
      className: "status status--text",
      attrs: { role: "status", tabindex: "-1" },
      text: copy.EDIT_SAVED_NO_DATE_CHANGE,
    });
  }
  if (notice.kind === "unchanged") {
    return el("p", { className: "status status--text", attrs: { role: "status", tabindex: "-1" }, text: copy.EDIT_NO_CHANGE });
  }
  if (notice.kind === "gone") {
    return el("p", { className: "status status--text", attrs: { role: "status", tabindex: "-1" }, text: copy.EDIT_TARGET_GONE });
  }
  // notice.kind === "removed" -- the one outcome that gets an undo
  // (§11.1 revisited, and §5.2's own reasoning for why edit does not):
  // the numbers are gone from the screen, so a mis-click cannot be
  // corrected in place the way an edit's list-still-shows-everything
  // property allows.
  const undoBtn = el("button", { className: "btn btn--link", attrs: { type: "button" }, text: copy.REMOVED_UNDO });
  undoBtn.addEventListener("click", () => onUndoRemove(notice.plan, undoBtn));
  return el("p", {
    className: "status",
    attrs: { role: "status", tabindex: "-1" },
    children: [text(copy.REMOVED_STATUS), undoBtn],
  });
}
