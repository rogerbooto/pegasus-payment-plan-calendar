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
import { markViewedNext30 } from "../popup/usage-tracking";
import { computeImpact, paymentDates, type ImpactView } from "../impact/engine";
import { confirmPlan, type ConfirmedPlanInput } from "../parser/confirmation";
import { createDomPageProbe } from "../engine/dom-page-probe";
import { extractionCore } from "../engine/extraction-core";
import { readOrderTotalSuggestion } from "../engine/order-total-suggestion";
import { renderConfirmationSheet, renderManualEntrySheet } from "./ConfirmationSheet";
import { el, clear, text, styleTag } from "./dom";
import { OVERLAY_CSS } from "./theme";
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

type Tab = "plan" | "next30";

type Screen =
  | { readonly kind: "impact" }
  | { readonly kind: "confirm" }
  | { readonly kind: "manual" }
  | { readonly kind: "not_recognized" }
  | { readonly kind: "saved"; readonly plan: PaymentPlanRecord }
  | { readonly kind: "removed"; readonly plan: PaymentPlanRecord };

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

  function ensureHost(): ShadowRoot {
    if (host && shadow) return shadow;
    host = doc.createElement(OVERLAY_HOST_TAG);
    shadow = host.attachShadow({ mode: "closed" });
    shadow.appendChild(styleTag(OVERLAY_CSS));
    shadow.addEventListener("keydown", keydownHandler as EventListener);
    const view = doc.defaultView;
    collapsed = Boolean(view && view.innerWidth < COLLAPSE_BREAKPOINT_PX);
    doc.body.appendChild(host);
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

  function cancelForm(): void {
    if (previousScreen) {
      screen = previousScreen;
      previousScreen = null;
      render();
    } else {
      dismiss();
    }
  }

  async function handleConfirm(record: PaymentPlanRecord): Promise<void> {
    await ledger.addPlan(record);
    screen = { kind: "saved", plan: record };
    render();
  }

  async function handleRemove(plan: PaymentPlanRecord): Promise<void> {
    await ledger.removePlan(plan.id);
    screen = { kind: "removed", plan };
    render();
  }

  async function handleReAdd(plan: PaymentPlanRecord): Promise<void> {
    await ledger.addPlan(plan);
    screen = { kind: "saved", plan };
    render();
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

  function tabs(root: HTMLElement, savedCount: number): boolean {
    if (savedCount < 1) return false;
    const list = el("div", { className: "tabs", attrs: { role: "tablist", "aria-label": "Views" } });
    const planTab = el("button", {
      className: "tab",
      attrs: {
        type: "button",
        role: "tab",
        id: "ppc-tab-plan",
        "aria-selected": String(tab === "plan"),
        "aria-controls": "ppc-panel-plan",
        tabindex: tab === "plan" ? "0" : "-1",
      },
      text: copy.VIEW_SWITCH_BACK,
      on: { click: () => switchTab("plan") },
    });
    const next30Tab = el("button", {
      className: "tab",
      attrs: {
        type: "button",
        role: "tab",
        id: "ppc-tab-next30",
        "aria-selected": String(tab === "next30"),
        "aria-controls": "ppc-panel-next30",
        tabindex: tab === "next30" ? "0" : "-1",
      },
      text: copy.VIEW_SWITCH,
      on: { click: () => switchTab("next30") },
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "ArrowLeft" || e.key === "Home" || e.key === "End") {
        e.preventDefault();
        switchTab(tab === "plan" ? "next30" : "plan");
      }
    };
    planTab.addEventListener("keydown", onKey);
    next30Tab.addEventListener("keydown", onKey);
    list.appendChild(planTab);
    list.appendChild(next30Tab);
    root.appendChild(list);
    return true;
  }

  function dateSpans(dates: readonly string[]): (Node | null)[] {
    const nodes: (Node | null)[] = [];
    dates.forEach((d, i) => {
      nodes.push(el("span", { className: "d", text: formatMonthDay(d) }));
      nodes.push(text(i < dates.length - 1 ? ", " : "."));
    });
    return nodes;
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

  async function renderImpactScreen(body: HTMLElement, state: Extract<EngineState, { kind: "PARSED_CONFIRMABLE" }>): Promise<void> {
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
    } else {
      renderNext30Body(body, impact, existing.length >= 1);
    }
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

  async function renderSaved(body: HTMLElement, plan: PaymentPlanRecord): Promise<void> {
    const status = el("p", {
      className: "status",
      attrs: { role: "status" },
      children: [
        text(copy.SAVED_STATUS),
        el("button", {
          className: "btn btn--link",
          attrs: { type: "button" },
          text: copy.SAVED_UNDO,
          on: { click: () => handleRemove(plan) },
        }),
      ],
    });
    body.appendChild(status);

    const all = await ledger.listPlans();
    const agg = aggregateNext30(all, today());
    const sumParts = copy.next30SummaryParts(formatCents(agg.totalCents, plan.currency), agg.count);
    body.appendChild(
      el("p", {
        className: "impact",
        attrs: { style: "margin-top:15px" },
        children: [text(`${sumParts.lead} `), el("b", { text: sumParts.sum }), text(` ${sumParts.mid} `), el("b", { text: sumParts.n }), text(` ${sumParts.tail}`)],
      }),);

    const clusterDay = agg.days.find((d) => d.date === plan.firstPaymentDate && d.count >= 2);
    if (clusterDay) {
      renderSameDay(body, clusterDay.count, clusterDay.date, clusterDay.totalCents, plan.currency, true);
    }

    const rows = el("ul", { className: "rows" });
    for (const day of agg.days) {
      rows.appendChild(
        el("li", {
          children: [
            el("span", { className: "date", text: formatMonthDay(day.date) }),
            el("span", { className: "dow", text: formatWeekday(day.date) }),
            el("span", { className: "amt", text: formatCents(day.totalCents, plan.currency) }),
          ],
        }),);
    }
    body.appendChild(rows);
  }

  function renderRemoved(body: HTMLElement, plan: PaymentPlanRecord): void {
    const status = el("p", {
      className: "status",
      attrs: { role: "status" },
      children: [
        text(copy.REMOVED_STATUS),
        el("button", {
          className: "btn btn--link",
          attrs: { type: "button" },
          text: copy.REMOVED_UNDO,
          on: { click: () => handleReAdd(plan) },
        }),
      ],
    });
    body.appendChild(status);
  }

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

  async function populateBody(panel: HTMLElement): Promise<void> {
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
    if (screen.kind === "saved") {
      const existing = await ledger.listPlans();
      const showTabs = tabs(panel, existing.length);
      const body = el("div", {
        className: "panel__body",
        attrs: showTabs ? { role: "tabpanel", id: "ppc-panel-plan", "aria-labelledby": "ppc-tab-plan" } : {},
      });
      await renderSaved(body, screen.plan);
      panel.appendChild(body);
      footer(panel);
      return;
    }
    if (screen.kind === "removed") {
      const body = el("div", { className: "panel__body" });
      renderRemoved(body, screen.plan);
      panel.appendChild(body);
      footer(panel);
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
      const showTabs = tabs(panel, existing.length);
      const body = el("div", {
        className: "panel__body",
        attrs: showTabs
          ? { role: "tabpanel", id: tab === "plan" ? "ppc-panel-plan" : "ppc-panel-next30", "aria-labelledby": tab === "plan" ? "ppc-tab-plan" : "ppc-tab-next30" }
          : {},
      });
      await renderImpactScreen(body, state);
      panel.appendChild(body);
      footer(panel);
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
