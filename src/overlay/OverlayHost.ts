/**
 * The overlay host: a custom element mounted as a direct child of
 * document.body (never inside a payment form or lender iframe), with a
 * closed shadow root and an `all: initial` style reset at the boundary.
 * The extension never modifies checkout DOM — no attribute, class or node
 * of ours appears in page DOM outside this single host element (T10).
 *
 * The host renders from the engine's parsed integer-cent values only; it
 * never live-mirrors page nodes, so a post-parse DOM mutation cannot alter
 * what the user is confirming (T05 — enforced upstream by
 * src/parser/confirmation.ts, which takes no DOM/Element type at all).
 *
 * T11/T13 anchoring: `mount()` always appends the host to `doc.body`
 * directly (`doc.body.appendChild(host)`), never to a payment `<form>` or
 * an `<iframe>`'s document, and `attachShadow({ mode: "closed" })` is the
 * only place a shadow root is ever created here — from page context,
 * `host.shadowRoot` reads back `null` (closed mode), while this module
 * keeps the real ShadowRoot reference in its own closure for rendering.
 */
import type { EngineState, IsoDate, OrderTotalSuggestion, PaymentPlanRecord } from "../shared/types";
import { formatCents } from "../shared/format";
import { addCents, type Cents, ZERO_CENTS } from "../shared/money";
import { OVERLAY_HOST_TAG } from "../shared/constants";
import { PlanLedger } from "../storage/ledger";
import { chromeLocalStore, type KeyValueStore } from "../storage/store";
import { PlanNotFoundError } from "../shared/errors";
import { markViewedNext30 } from "../popup/usage-tracking";
import { computeImpact, paymentDates, type ImpactView } from "../impact/engine";
import { confirmPlan, type ConfirmedPlanInput } from "../parser/confirmation";
import { createDomPageProbe } from "../engine/dom-page-probe";
import { extractionCore } from "../engine/extraction-core";
import { readOrderTotalSuggestion } from "../engine/order-total-suggestion";
import { renderConfirmationSheet, renderManualEntrySheet, renderEditPlanSheet, type EditChangeSummary } from "./ConfirmationSheet";
import { buildPlanListNotice, buildPlanRows, type PlanListNotice } from "./PlanList";
import { el, clear, moveFocusToHeading, text, styleTag, tokenList } from "./dom";
import { applyThemeAttribute, OVERLAY_CSS, resolvePersistedTheme } from "./theme";
import { formatMonthDay, formatWeekday, todayIsoDate } from "./format-helpers";
import * as copy from "./copy";

export { OVERLAY_HOST_TAG } from "../shared/constants";

export interface OverlayController {
  /** Mounts (or updates) the overlay for a terminal engine state. */
  mount(state: EngineState): void;
  /** Full teardown: removes the host, cancels timers, drops references. */
  unmount(): void;
}

/** Injectable for tests only; production callers rely on the defaults. */
export interface OverlayHostDeps {
  readonly ledger?: PlanLedger;
  readonly today?: () => IsoDate;
  readonly store?: KeyValueStore;
}

const COLLAPSE_BREAKPOINT_PX = 600;
const NEXT30_WINDOW_DAYS = 29; // 30 calendar days inclusive of today

type Tab = "plan" | "next30" | "plans";

/**
 * `"saved"`/`"removed"` used to be their own Screen kinds, each hijacking
 * the whole panel body regardless of which tab was selected — the exact
 * root cause of the tab strip's F3 defect (a tab that looks right and
 * switches nothing). Both retire into `"plans"` here: a screen that
 * participates in the SAME tab dispatch as `"impact"` rather than
 * outranking it, paired with `planNotice` (below) for the one-shot
 * "Added."/"Removed."/etc. announcement. `"edit"` is new — editing an
 * existing plan gets its own full-screen form, exactly like `"confirm"`/
 * `"manual"`, with the tab strip hidden (a tab strip behind an open form
 * would either do nothing while typing — a second F3 — or silently
 * discard unsaved input, and neither is acceptable).
 */
type Screen =
  | { readonly kind: "impact" }
  | { readonly kind: "confirm" }
  | { readonly kind: "manual" }
  | { readonly kind: "edit" }
  | { readonly kind: "not_recognized" }
  | { readonly kind: "plans" };

function candidateToRecordPreview(state: Extract<EngineState, { kind: "PARSED_CONFIRMABLE" }>, today: IsoDate): {
  readonly preview: PaymentPlanRecord;
  readonly confirmed: ConfirmedPlanInput;
} {
  const { candidate } = state;
  const confirmed = confirmPlan({
    confirmed: true,
    values: {
      orderTotalCents: candidate.orderTotalCents,
      installmentCount: candidate.installmentCount,
      cadence: candidate.cadence,
      perInstallmentCents: candidate.perInstallmentCents,
      currency: candidate.currency,
    },
  });
  const preview: PaymentPlanRecord = {
    id: "preview",
    createdAt: today,
    source: "checkout_confirmed",
    currency: confirmed.currency,
    orderTotalCents: confirmed.orderTotalCents,
    installmentCount: confirmed.installmentCount,
    cadence: confirmed.cadence,
    perInstallmentCents: confirmed.perInstallmentCents,
    firstPaymentDate: today,
    customName: "",
  };
  return { preview, confirmed };
}

interface Next30Aggregate {
  readonly days: readonly { readonly date: IsoDate; readonly count: number; readonly totalCents: Cents }[];
  readonly totalCents: Cents;
  readonly count: number;
}

function aggregateNext30(plans: readonly PaymentPlanRecord[], today: IsoDate): Next30Aggregate {
  const windowEnd = addDaysIso(today, NEXT30_WINDOW_DAYS);
  const byDate = new Map<IsoDate, Cents[]>();
  for (const plan of plans) {
    for (const date of paymentDates(plan)) {
      if (date < today || date > windowEnd) continue;
      const list = byDate.get(date) ?? [];
      list.push(plan.perInstallmentCents);
      byDate.set(date, list);
    }
  }
  const days = [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, amounts]) => ({
      date,
      count: amounts.length,
      totalCents: amounts.reduce((sum, c) => addCents(sum, c), ZERO_CENTS),
    }));
  const totalCents = days.reduce((sum, d) => addCents(sum, d.totalCents), ZERO_CENTS);
  const count = days.reduce((sum, d) => sum + d.count, 0);
  return { days, totalCents, count };
}

function addDaysIso(date: IsoDate, days: number): IsoDate {
  const [y, m, d] = date.split("-").map((s) => parseInt(s, 10));
  const dt = new Date(Date.UTC(y as number, (m as number) - 1, d as number));
  dt.setUTCDate(dt.getUTCDate() + days);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

/**
 * Builds the two aria-hidden calendar month grids (§6.1-6.3): the month
 * containing `today`, rendered in full, followed by the next calendar
 * month truncated to `windowEnd`. The grid carries no information the
 * dated list below it doesn't already state in text — it is decorative.
 */
function buildCalendar(
  today: IsoDate,
  windowEnd: IsoDate,
  daysByDate: ReadonlyMap<string, { count: number; totalCents: Cents }>,
  pendingDates: ReadonlySet<string>,): HTMLDivElement {
  const wrap = el("div", { className: "calwrap", attrs: { "aria-hidden": "true" } });
  const [ty, tm] = today.split("-").map((s) => parseInt(s, 10));
  const months: [number, number][] = [
    [ty as number, tm as number],
    [tm === 12 ? (ty as number) + 1 : (ty as number), tm === 12 ? 1 : (tm as number) + 1],
  ];
  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  for (const [y, m] of months) {
    const monthEl = el("div", { className: "calmonth" });
    monthEl.appendChild(el("div", { className: "calmonth__h", text: `${monthNames[m - 1]} ${y}` }));
    const grid = el("div", { className: "cal" });
    for (const letter of ["S", "M", "T", "W", "T", "F", "S"]) {
      grid.appendChild(el("div", { className: "dow", text: letter }));
    }
    const firstOfMonth = new Date(Date.UTC(y, m - 1, 1));
    const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
    for (let i = 0; i < firstOfMonth.getUTCDay(); i++) {
      grid.appendChild(el("div", { className: "day" }));
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      if (iso > windowEnd) break;
      const entry = daysByDate.get(iso);
      const isOut = iso < today || iso > windowEnd;
      const isPending = pendingDates.has(iso);
      const classes = ["day"];
      if (isOut) classes.push("day--out");
      if (entry) classes.push("day--pay");
      if (entry && entry.count >= 2) classes.push("day--cluster");
      if (isPending) classes.push("day--pending");
      const cell = el("div", { className: classes.join(" ") });
      cell.appendChild(el("span", { className: "n", text: String(d) }));
      if (entry) {
        cell.appendChild(el("span", { className: "a", text: formatCents(entry.totalCents, "CAD") }));
        if (entry.count >= 2) cell.appendChild(el("span", { className: "c", text: `×${entry.count}` }));
      }
      grid.appendChild(cell);
    }
    monthEl.appendChild(grid);
    wrap.appendChild(monthEl);
  }
  return wrap;
}

export function createOverlayHost(doc: Document, deps: OverlayHostDeps = {}): OverlayController {
  const store = deps.store ?? chromeLocalStore;
  const ledger = deps.ledger ?? new PlanLedger(store);
  const today = deps.today ?? (() => todayIsoDate());

  let host: HTMLElement | null = null;
  let shadow: ShadowRoot | null = null;
  let dismissed = false;
  let collapsed = false;
  let tab: Tab = "plan";
  let screen: Screen = { kind: "impact" };
  let previousScreen: Screen | null = null;
  let currentState: EngineState | null = null;
  // undefined = not yet attempted for the current mounted state; null =
  // attempted once and came back blank. Read exactly once per mount()
  // (never re-read on a later "Add a plan" click for the same state) --
  // see readOrderTotalSuggestionOnce below.
  let orderTotalSuggestion: OrderTotalSuggestion | null | undefined;
  /** Set only alongside `screen = {kind:"edit"}` (via openEdit below);
   * read only by the "edit" branch of populateBody. Mirrors the popup's
   * own `editingPlan` (src/popup/PopupApp.ts). */
  let editingPlan: PaymentPlanRecord | null = null;
  /**
   * The plans-tab's own transient notice (mirrors the popup's
   * `heroNotice`): consumed exactly once, by the very next render of the
   * "plans" tab content, then cleared — see renderPlansTabBody. Never
   * touches storage, so it cannot resurrect after a later mount().
   */
  let planNotice: PlanListNotice | null = null;
  /**
   * Set by cancelForm() before restoring `previousScreen`: render() does
   * `clear(root)` on every call, which drops focus with nothing to catch
   * it. Consumed exactly once, from inside populateBody, once the
   * restored screen's content has actually finished rendering (several
   * branches read the ledger first) — see populateBody's own wrapper.
   */
  let focusTitleOnNextRender = false;

  function ensureHost(): ShadowRoot {
    if (host && shadow) return shadow;
    host = doc.createElement(OVERLAY_HOST_TAG);
    shadow = host.attachShadow({ mode: "closed" });
    shadow.appendChild(styleTag(OVERLAY_CSS));
    shadow.addEventListener("keydown", keydownHandler as EventListener);
    const view = doc.defaultView;
    collapsed = Boolean(view && view.innerWidth < COLLAPSE_BREAKPOINT_PX);
    doc.body.appendChild(host);
    // §4.6 (first-run UX spec) -- the manual appearance override applies
    // to this panel too: it floats over a merchant's own page, and a
    // checkout panel that ignored an override the toolbar popup honoured
    // would be an inconsistency with no way to explain it to the user.
    // `mountedHost` is captured so a read that is still in flight when the
    // panel is dismissed (dismiss() -> host = null) cannot apply a stale
    // attribute to a host that is no longer live, or to whatever host a
    // later mount() creates.
    const mountedHost = host;
    void resolvePersistedTheme(ledger).then((theme) => {
      if (host === mountedHost) applyThemeAttribute(mountedHost, theme);
    });
    return shadow;
  }

  function dismiss(): void {
    dismissed = true;
    if (host?.parentNode) host.parentNode.removeChild(host);
    host = null;
    shadow = null;
  }

  function toggleCollapse(): void {
    collapsed = !collapsed;
    render();
  }

  function switchTab(next: Tab): void {
    tab = next;
    if (next === "next30") void markViewedNext30(store);
    render();
  }

  function openConfirm(): void {
    previousScreen = screen;
    screen = { kind: "confirm" };
    render();
  }

  /**
   * The ONE-SHOT read (src/engine/order-total-suggestion.ts): performed at
   * most once per mounted DEGRADED state, and only from this user action
   * (never from mount() itself, and never on a mutation tick) -- see the
   * Principles Guardian ruling on the order-total-suggestion feature.
   * Attaches no observer; `doc` is read via the same PageProbe seam every
   * other extraction path uses (src/engine/dom-page-probe.ts).
   */
  function readOrderTotalSuggestionOnce(): void {
    if (orderTotalSuggestion !== undefined) return; // already attempted for this mounted state
    if (currentState?.kind !== "DEGRADED") return;
    const page = createDomPageProbe(doc);
    orderTotalSuggestion = readOrderTotalSuggestion(page, extractionCore);
  }

  function openManual(): void {
    previousScreen = screen;
    readOrderTotalSuggestionOnce();
    screen = { kind: "manual" };
    render();
  }

  /**
   * §7 -- Cancel/Escape from any open form returns to whatever screen was
   * active before it opened. `render()` always does `clear(root)`, which
   * drops focus with nothing to catch it (there was no focus management
   * on this transition at all before); `focusTitleOnNextRender` hands the
   * panel's own heading to the restored screen once its content is
   * actually in the DOM -- see populateBody's wrapper.
   */
  function cancelForm(): void {
    editingPlan = null;
    if (previousScreen) {
      screen = previousScreen;
      previousScreen = null;
      focusTitleOnNextRender = true;
      render();
    } else {
      dismiss();
    }
  }

  /** Lands on the plans tab after any add/edit/remove/undo, with `notice`
   * as the one-shot announcement `renderPlansTabBody` shows and then
   * clears. The single funnel every one of those five actions uses --
   * see the type comment on `Screen` for why this replaced two Screen
   * kinds that used to bypass the tab dispatch entirely (F3). */
  function landOnPlansTab(notice: PlanListNotice): void {
    editingPlan = null;
    previousScreen = null;
    planNotice = notice;
    tab = "plans";
    screen = { kind: "plans" };
    render();
  }

  async function handleConfirm(record: PaymentPlanRecord): Promise<void> {
    await ledger.addPlan(record);
    landOnPlansTab({ kind: "added" });
  }

  function openEdit(plan: PaymentPlanRecord): void {
    previousScreen = screen;
    editingPlan = plan;
    screen = { kind: "edit" };
    render();
  }

  /** §5.3 -- the four spec'd outcomes for an edit, mirroring the popup's
   * own "edit" screen (src/popup/PopupApp.ts) move for move: a no-op save
   * writes nothing (and keeps `source` for free), a vanished target
   * writes nothing either, and only an actual value change ever calls
   * `updatePlan`. */
  async function handlePlanEditSave(updated: PaymentPlanRecord, changed: EditChangeSummary): Promise<void> {
    // A rename alone IS a change that must be written -- it just never
    // flips `source` (see EditChangeSummary.nameChanged) and never moves
    // a date, so it lands on the "dates didn't change" notice below.
    if (!changed.valuesChanged && !changed.nameChanged) {
      landOnPlansTab({ kind: "unchanged" });
      return;
    }
    let saved: PaymentPlanRecord;
    try {
      saved = await ledger.updatePlan(updated);
    } catch (err) {
      if (err instanceof PlanNotFoundError) {
        landOnPlansTab({ kind: "gone" });
        return;
      }
      throw err;
    }
    landOnPlansTab({ kind: "edited", dates: changed.datesChanged ? paymentDates(saved) : null });
  }

  /** Per-row Remove (founder-decided, §11.1 revisited): stays on the
   * plans tab and drops just this row, rather than the old top-level
   * "removed" screen's single-line dead end (no footer nav, no way back
   * except its own undo) -- removing one plan out of five must not blow
   * away the other four. Disabling the pressed button is defensive, not
   * load-bearing: removePlan's filter-by-id is naturally idempotent. */
  async function handlePlanRemove(plan: PaymentPlanRecord, button: HTMLButtonElement): Promise<void> {
    button.disabled = true;
    await ledger.removePlan(plan.id);
    landOnPlansTab({ kind: "removed", plan });
  }

  /** "Add it back" -- reuses addPlan with the SAME record (same id),
   * exactly like the pre-existing REMOVED_UNDO flow this generalizes. */
  async function handlePlanUndoRemove(plan: PaymentPlanRecord, button: HTMLButtonElement): Promise<void> {
    button.disabled = true;
    await ledger.addPlan(plan);
    landOnPlansTab({ kind: "added" });
  }

  function header(root: HTMLElement, title: string, opts: { back?: boolean } = {}): void {
    const head = el("div", { className: "panel__head" });
    head.appendChild(el("h2", { className: "panel__title", attrs: { id: "ppc-title" }, text: title }));
    head.appendChild(
      el("button", {
        className: "iconbtn",
        attrs: { type: "button", "aria-label": copy.DISMISS_LABEL },
        text: "×",
        on: { click: () => dismiss() },
      }),);
    if (!opts.back) {
      head.appendChild(
        el("button", {
          className: "iconbtn",
          attrs: { type: "button", "aria-label": collapsed ? copy.EXPAND_LABEL : copy.COLLAPSE_LABEL },
          text: collapsed ? "▾" : "▴",
          on: { click: () => toggleCollapse() },
        }),);
    }
    root.appendChild(head);
  }

  function footer(root: HTMLElement): void {
    root.appendChild(
      el("div", {
        className: "panel__foot",
        children: [
          el("span", { text: copy.QUALIFIER_SOURCE }),
          el("span", { text: copy.QUALIFIER_LOCAL }),
        ],
      }),);
  }

  /**
   * The single source of truth mapping each `Tab` to its DOM ids
   * (edit-plan-spec / F3 fix): every place that used to independently
   * decide "which panel id goes with which tab" -- the tab strip itself,
   * and each of the two populateBody branches that render a tabpanel --
   * now reads the SAME table, via `activeTabMeta()` below. That is what
   * makes the old bug (one call site's ternary agreeing with `tab`, the
   * other one hardcoded and not) structurally impossible to reintroduce:
   * there is only one place left that could get it wrong.
   */
  const TAB_META: readonly { readonly id: Tab; readonly buttonId: string; readonly panelId: string; readonly label: string }[] = [
    { id: "plan", buttonId: "ppc-tab-plan", panelId: "ppc-panel-plan", label: copy.VIEW_SWITCH_BACK },
    { id: "next30", buttonId: "ppc-tab-next30", panelId: "ppc-panel-next30", label: copy.VIEW_SWITCH },
    { id: "plans", buttonId: "ppc-tab-plans", panelId: "ppc-panel-plans", label: copy.PLANS_LIST_HEADING },
  ];

  function activeTabMeta(): { readonly panelId: string; readonly buttonId: string } {
    return TAB_META.find((t) => t.id === tab) ?? (TAB_META[1] as (typeof TAB_META)[number]);
  }

  /**
   * Renders the tab strip. `includePlanTab` is false on the `"plans"`
   * screen (post add/edit/remove/undo): "This plan" previews a candidate
   * not yet on the ledger, and once you've just added, edited or removed
   * a plan there is no such candidate to preview any more -- for a
   * manually-entered plan there never was one at all. Roving tabindex:
   * exactly one button is ever `tabindex="0"` (the selected one), and
   * arrow/Home/End move both the roving tabindex and the selection
   * together, per the tabs pattern.
   */
  function tabs(root: HTMLElement, savedCount: number, opts: { includePlanTab: boolean }): boolean {
    if (savedCount < 1) return false;
    const active = TAB_META.filter((t) => opts.includePlanTab || t.id !== "plan");
    const list = el("div", { className: "tabs", attrs: { role: "tablist", "aria-label": "Views" } });
    const buttons: HTMLButtonElement[] = [];
    for (const meta of active) {
      const btn = el("button", {
        className: "tab",
        attrs: {
          type: "button",
          role: "tab",
          id: meta.buttonId,
          "aria-selected": String(tab === meta.id),
          "aria-controls": meta.panelId,
          tabindex: tab === meta.id ? "0" : "-1",
        },
        text: meta.label,
        on: { click: () => switchTab(meta.id) },
      });
      buttons.push(btn);
      list.appendChild(btn);
    }
    const onKey = (e: KeyboardEvent) => {
      const idx = active.findIndex((t) => t.id === tab);
      if (idx < 0) return;
      let nextIdx: number | null = null;
      if (e.key === "ArrowRight") nextIdx = (idx + 1) % active.length;
      else if (e.key === "ArrowLeft") nextIdx = (idx - 1 + active.length) % active.length;
      else if (e.key === "Home") nextIdx = 0;
      else if (e.key === "End") nextIdx = active.length - 1;
      if (nextIdx === null) return;
      e.preventDefault();
      switchTab((active[nextIdx] as (typeof active)[number]).id);
    };
    for (const btn of buttons) btn.addEventListener("keydown", onKey);
    root.appendChild(list);
    return true;
  }

  function dateSpans(dates: readonly string[]): Node[] {
    return tokenList(dates.map((d) => formatMonthDay(d)));
  }

  function renderImpactHero(body: HTMLElement, count: number, amountText: string, dates: readonly string[]): void {
    body.appendChild(
      el("p", {
        className: "impact",
        children: [
          text("This plan adds "),
          el("b", { text: `${count} payments of ${amountText}` }),
          text(" on "),
          ...dateSpans(dates),
        ],
      }),);
  }

  function renderSameDay(body: HTMLElement, count: number, dateIso: string, sumCents: Cents, currency: "CAD" | "USD", added: boolean): void {
    const line = copy.sameDayLine(count, formatMonthDay(dateIso), formatCents(sumCents, currency), added);
    body.appendChild(
      el("p", {
        className: "sameday",
        children: [text(`${line.lead} ${line.date} — `), el("b", { text: line.sum }), text(" that day.")],
      }),);
  }

  function renderRows(body: HTMLElement, payments: readonly { date: string; amountCents: Cents }[], currency: "CAD" | "USD", tagged: boolean): void {
    const rows = el("ul", { className: "rows" });
    for (const p of payments) {
      const li = el("li", {
        children: [
          el("span", { className: "date", text: formatMonthDay(p.date) }),
          el("span", { className: "dow", text: formatWeekday(p.date) }),
          el("span", { className: "amt", text: formatCents(p.amountCents, currency) }),
          tagged ? el("span", { className: "tag", text: copy.NOT_ADDED_TAG }) : null,
        ],
      });
      rows.appendChild(li);
    }
    body.appendChild(rows);
  }

  /**
   * Returns the plans-tab notice element, if the plans tab happens to be
   * active AND a notice is pending -- bubbled up so the caller (which
   * appends `body` into the still-disconnected `panel`) can focus it only
   * once it is actually connected. In practice this tab is only reachable
   * here while merely browsing (never with a pending notice, since every
   * add/edit/remove/undo lands on the dedicated "plans" screen instead —
   * see `landOnPlansTab`), but the plumbing stays correct either way.
   */
  async function renderImpactScreen(body: HTMLElement, state: Extract<EngineState, { kind: "PARSED_CONFIRMABLE" }>): Promise<HTMLElement | null> {
    const existing = await ledger.listPlans();
    const { preview, confirmed } = candidateToRecordPreview(state, today());
    const impact: ImpactView = computeImpact(preview, confirmed, existing, today());

    if (tab === "plan" || existing.length < 1) {
      renderImpactHero(
        body,
        state.candidate.installmentCount,
        formatCents(state.candidate.perInstallmentCents, state.candidate.currency),
        impact.planPayments.map((p) => p.date),);
      if (impact.sameDayClusters.length > 0) {
        const cluster = impact.sameDayClusters[0] as (typeof impact.sameDayClusters)[number];
        renderSameDay(body, cluster.existingCount, cluster.date, cluster.existingTotalCents, state.candidate.currency, false);
      } else if (existing.length < 1) {
        body.appendChild(el("p", { className: "sameday", text: copy.EMPTY_LEDGER }));
      }
      renderRows(body, impact.planPayments, state.candidate.currency, true);
      const actions = el("div", { className: "actions" });
      actions.appendChild(
        el("button", {
          className: "btn btn--primary",
          attrs: { type: "button" },
          text: copy.ACTION_CHECK,
          on: { click: () => openConfirm() },
        }),);
      if (existing.length < 1) actions.appendChild(el("span", { className: "tag", text: copy.NOT_ADDED_TAG }));
      body.appendChild(actions);
      return null;
    }
    if (tab === "next30") {
      renderNext30Body(body, impact, existing.length >= 1);
      return null;
    }
    return renderPlansTabBody(body, existing);
  }

  /**
   * The "Plans you've entered" tab body (edit-plan-spec §3, generalized to
   * the overlay per the founder's own ruling that a per-row menu inside
   * the toolbar popup was not discoverable): the one-shot outcome notice,
   * if any, followed by the shared row list. Used by BOTH the "impact"
   * screen's plans tab (a live candidate is still being decided) and the
   * "plans" screen (just landed here after an add/edit/remove/undo) --
   * the list itself never depends on which one it was reached from.
   *
   * Returns the notice element when one was shown, so the caller can move
   * focus onto it AFTER `body` is actually connected (appended into
   * `panel`, itself already live in the shadow root) -- focusing it here,
   * before that append happens, would be a no-op: an element cannot
   * receive focus while disconnected from the document.
   */
  function renderPlansTabBody(body: HTMLElement, plans: readonly PaymentPlanRecord[]): HTMLElement | null {
    let noticeEl: HTMLElement | null = null;
    if (planNotice) {
      const notice = planNotice;
      planNotice = null;
      noticeEl = buildPlanListNotice(notice, (plan, button) => void handlePlanUndoRemove(plan, button));
      body.appendChild(noticeEl);
    }
    if (plans.length < 1) {
      body.appendChild(el("p", { className: "plain", text: copy.POPUP_EMPTY_LEDGER }));
      return noticeEl;
    }
    body.appendChild(buildPlanRows(plans, { onEdit: openEdit, onRemove: (plan, button) => void handlePlanRemove(plan, button) }));
    return noticeEl;
  }

  /**
   * The "plans" screen's own "Next 30 days" tab: the same day-grouped
   * aggregate the old "saved" screen always showed (regardless of which
   * tab was selected -- the F3 bug), now correctly gated behind this tab
   * instead. No calendar grid and no "Check the numbers" action here,
   * matching the old screen's own content exactly -- those belong to
   * reviewing a not-yet-added candidate, and there is no candidate once
   * you're just looking at what you've already committed to.
   */
  function renderNext30OnlyBody(body: HTMLElement, plans: readonly PaymentPlanRecord[]): void {
    const agg = aggregateNext30(plans, today());
    const currency = plans[0]?.currency ?? "CAD";
    const sumParts = copy.next30SummaryParts(formatCents(agg.totalCents, currency), agg.count);
    body.appendChild(
      el("p", {
        className: "summary",
        children: [text(`${sumParts.lead} `), el("b", { text: sumParts.sum }), text(` ${sumParts.mid} `), el("b", { text: sumParts.n }), text(` ${sumParts.tail}`)],
      }),);
    const rows = el("ul", { className: "rows" });
    for (const day of agg.days) {
      rows.appendChild(
        el("li", {
          children: [
            el("span", { className: "date", text: formatMonthDay(day.date) }),
            el("span", { className: "dow", text: formatWeekday(day.date) }),
            el("span", { className: "amt", text: formatCents(day.totalCents, currency) }),
          ],
        }),);
    }
    body.appendChild(rows);
  }

  function renderNext30Body(body: HTMLElement, impact: ImpactView, _hasExisting: boolean): void {
    const sumParts = copy.next30SummaryParts(formatCents(impact.next30Days.totalCents, "CAD"), impact.next30Days.days.reduce((s, d) => s + d.payments.length, 0));
    body.appendChild(
      el("p", {
        className: "summary",
        children: [text(`${sumParts.lead} `), el("b", { text: sumParts.sum }), text(` ${sumParts.mid} `), el("b", { text: sumParts.n }), text(` ${sumParts.tail}`)],
      }),);

    const daysByDate = new Map<string, { count: number; totalCents: Cents }>();
    for (const d of impact.next30Days.days) daysByDate.set(d.date, { count: d.payments.length, totalCents: d.dayTotalCents });
    const pendingDates = new Set(impact.planPayments.map((p) => p.date));
    const windowEnd = addDaysIso(today(), NEXT30_WINDOW_DAYS);
    body.appendChild(buildCalendar(today(), windowEnd, daysByDate, pendingDates));
    body.appendChild(
      el("p", {
        className: "callegend",
        text: "Dashed outline: a day this plan would add a payment to. Dates beyond the window are outside these 30 days.",
      }),);

    const rows = el("ul", { className: "rows" });
    for (const day of impact.next30Days.days) {
      const pending = pendingDates.has(day.date);
      const sub = pending
        ? `${day.payments.length} payment${day.payments.length === 1 ? "" : "s"} you entered`
        : `${day.payments.length} payment${day.payments.length === 1 ? "" : "s"} you entered`;
      const li = el("li", {
        children: [
          el("span", { className: "date", text: formatMonthDay(day.date) }),
          el("span", { className: "dow", text: formatWeekday(day.date) }),
          el("span", { className: "amt", text: formatCents(day.dayTotalCents, "CAD") }),
          el("span", { className: "sub", text: pending ? sub : sub }),
          pending ? el("span", { className: "tag", text: copy.NOT_ADDED_TAG }) : null,
        ],
      });
      rows.appendChild(li);
    }
    body.appendChild(rows);

    if (impact.next30Days.planPaymentBeyondWindow) {
      body.appendChild(el("p", { className: "beyond", text: copy.next30Beyond(formatMonthDay(impact.next30Days.planPaymentBeyondWindow)) }));
    }

    const actions = el("div", { className: "actions" });
    actions.appendChild(
      el("button", {
        className: "btn btn--primary",
        attrs: { type: "button" },
        text: copy.ACTION_CHECK,
        on: { click: () => openConfirm() },
      }),);
    body.appendChild(actions);
  }

  function renderConfirm(body: HTMLElement, state: Extract<EngineState, { kind: "PARSED_CONFIRMABLE" }>): void {
    renderConfirmationSheet(body, {
      candidate: state.candidate,
      onConfirm: (record) => handleConfirm(record),
      onCancel: () => cancelForm(),
    });
  }

  function renderManual(body: HTMLElement, state: EngineState): void {
    if (state.kind === "PARTIAL") {
      renderManualEntrySheet(body, {
        prefill: state.candidate,
        onConfirm: (record) => handleConfirm(record),
        onCancel: () => cancelForm(),
      });
    } else {
      // Only DEGRADED reaches this branch (see mount()/openManual() above):
      // orderTotalSuggestion is undefined until openManual() has attempted
      // its one-shot read at least once, at which point it is either a
      // real suggestion or null (attempted, blank) -- either way, exactly
      // what renderManualEntrySheet expects.
      renderManualEntrySheet(body, {
        orderTotalSuggestion: orderTotalSuggestion ?? undefined,
        onConfirm: (record) => handleConfirm(record),
        onCancel: () => cancelForm(),
      });
    }
  }

  /**
   * Editing an existing, already-saved plan (edit-plan-spec §4.2), reached
   * only from a per-row Edit on the plans tab. A full-screen form, tab
   * strip hidden, exactly like renderConfirm/renderManual above -- see
   * the Screen type's own comment for why the tab strip cannot stay
   * visible behind an open form. renderEditPlanSheet moves focus to its
   * own heading itself (initialFocus: "heading"); nothing here needs to.
   */
  function renderEdit(body: HTMLElement, plan: PaymentPlanRecord): void {
    renderEditPlanSheet(body, {
      plan,
      onSave: (updated, changed) => handlePlanEditSave(updated, changed),
      onCancel: () => cancelForm(),
    });
  }

  function renderNotRecognized(body: HTMLElement, state: EngineState): void {
    // "unconfirmed" (the pre-gate's structural-signal-only degrade) never
    // asserts the page IS a checkout -- some pages that reach it are not.
    // Every other DEGRADED reason arrives after the full detector actually
    // ran against real page content, so NOT_RECOGNIZED's "this checkout"
    // framing is accurate there.
    const message =
      state.kind === "DEGRADED" && state.reason === "unconfirmed" ? copy.NOT_CONFIRMED : copy.NOT_RECOGNIZED;
    body.appendChild(el("p", { className: "plain", text: message }));
    const actions = el("div", { className: "actions" });
    actions.appendChild(
      el("button", {
        className: "btn btn--primary",
        attrs: { type: "button" },
        text: copy.ACTION_ADD,
        on: { click: () => openManual() },
      }),);
    body.appendChild(actions);
  }

  // renderSaved/renderRemoved used to live here, each its own Screen kind
  // that hijacked the panel body regardless of the active tab (the F3
  // defect). Both retired into renderPlansTabBody + landOnPlansTab above,
  // which participate in the ordinary tab dispatch instead of bypassing
  // it -- see the Screen type's own comment for the full reasoning.

  /**
   * Builds the panel and attaches it to the shadow root immediately, then
   * fills in tabs/body/footer in strict DOM order — every branch below
   * finishes by calling `footer(panel)` exactly once, so a still-pending
   * ledger read can never leave the footer (or a later-appended body)
   * ahead of where it belongs, regardless of whether a given branch is
   * synchronous or needs an async storage read first.
   */
  function render(): void {
    if (dismissed || !currentState) return;
    const root = ensureHost();
    clear(root);
    root.appendChild(styleTag(OVERLAY_CSS));

    const panel = el("section", {
      className: collapsed ? "panel panel--collapsed" : "panel",
      attrs: { "aria-labelledby": "ppc-title", lang: "en" },
    });
    header(panel, copy.PANEL_TITLE);
    root.appendChild(panel);

    if (collapsed) return;
    void populateBody(panel);
  }

  /**
   * Thin wrapper around the actual branch dispatch below: every branch of
   * `populateBodyContent` finishes by appending its body and calling
   * `footer(panel)`, whether or not it needed an async ledger read first,
   * so this is the one place that can safely act once the restored
   * screen's content genuinely exists in the DOM -- see
   * `focusTitleOnNextRender`'s own comment.
   */
  async function populateBody(panel: HTMLElement): Promise<void> {
    await populateBodyContent(panel);
    if (focusTitleOnNextRender) {
      focusTitleOnNextRender = false;
      moveFocusToHeading(panel, "#ppc-title");
    }
  }

  async function populateBodyContent(panel: HTMLElement): Promise<void> {
    const state = currentState;
    if (!state) return;

    if (screen.kind === "confirm" && state.kind === "PARSED_CONFIRMABLE") {
      const body = el("div", { className: "panel__body" });
      renderConfirm(body, state);
      panel.appendChild(body);
      footer(panel);
      return;
    }
    if (screen.kind === "manual") {
      const body = el("div", { className: "panel__body" });
      renderManual(body, state);
      panel.appendChild(body);
      footer(panel);
      return;
    }
    if (screen.kind === "edit" && editingPlan) {
      const body = el("div", { className: "panel__body" });
      renderEdit(body, editingPlan);
      panel.appendChild(body);
      footer(panel);
      return;
    }
    if (screen.kind === "plans") {
      const existing = await ledger.listPlans();
      const showTabs = tabs(panel, existing.length, { includePlanTab: false });
      const body = el("div", {
        className: "panel__body",
        attrs: showTabs ? { role: "tabpanel", id: activeTabMeta().panelId, "aria-labelledby": activeTabMeta().buttonId } : {},
      });
      let plansNoticeEl: HTMLElement | null = null;
      if (tab === "next30") {
        renderNext30OnlyBody(body, existing);
      } else {
        plansNoticeEl = renderPlansTabBody(body, existing);
      }
      panel.appendChild(body);
      footer(panel);
      // Only now is `body` connected (panel is already live in the shadow
      // root) -- focusing any earlier would be a no-op. Same reasoning as
      // the popup's own post-action hero (src/popup/PopupApp.ts): a
      // role="status" region alone cannot be relied on to announce text
      // inserted during the render that creates it.
      plansNoticeEl?.focus();
      return;
    }
    if (screen.kind === "not_recognized" || state.kind === "DEGRADED") {
      const body = el("div", { className: "panel__body" });
      renderNotRecognized(body, state);
      panel.appendChild(body);
      footer(panel);
      return;
    }
    if (state.kind === "PARSED_CONFIRMABLE") {
      const existing = await ledger.listPlans();
      const showTabs = tabs(panel, existing.length, { includePlanTab: true });
      const body = el("div", {
        className: "panel__body",
        attrs: showTabs ? { role: "tabpanel", id: activeTabMeta().panelId, "aria-labelledby": activeTabMeta().buttonId } : {},
      });
      const noticeEl = await renderImpactScreen(body, state);
      panel.appendChild(body);
      footer(panel);
      noticeEl?.focus();
      return;
    }
    // PARTIAL, not yet routed to the manual form (mounts directly into it, §4.7).
    const body = el("div", { className: "panel__body" });
    renderManual(body, state);
    panel.appendChild(body);
    footer(panel);
  }

  /**
   * Esc is contextual, matching §7's two rows: identical to Cancel while
   * focus is inside an open form (goes back one view), and identical to
   * Dismiss anywhere else in the panel (unmounts). The listener is bound
   * to the shadow root, not `document` — it only ever sees events whose
   * target is inside this panel, so it can never react to a keypress on
   * the host page itself.
   */
  function keydownHandler(e: KeyboardEvent): void {
    if (e.key !== "Escape") return;
    const active = shadow?.activeElement as Element | null;
    if (active?.closest("form")) {
      cancelForm();
    } else {
      dismiss();
    }
  }

  function mount(state: EngineState): void {
    if (dismissed) return;
    currentState = state;
    // A fresh terminal state (a new tick, or a genuinely new session) means
    // any earlier one-shot read no longer describes "this" state -- reset
    // so the next "Add a plan" click, if any, reads again rather than
    // reusing a suggestion read from a prior DOM snapshot.
    orderTotalSuggestion = undefined;
    previousScreen = null;
    editingPlan = null;
    planNotice = null;
    focusTitleOnNextRender = false;
    tab = "plan";
    screen =
      state.kind === "PARSED_CONFIRMABLE"
        ? { kind: "impact" }
        : state.kind === "PARTIAL"
          ? { kind: "manual" }
          : { kind: "not_recognized" };
    ensureHost();
    render();
  }

  return {
    mount,
    unmount(): void {
      dismiss();
      currentState = null;
    },
  };
}
