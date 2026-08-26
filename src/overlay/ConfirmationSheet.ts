/**
 * The mandatory confirmation step, as a real HTML <form> inside the
 * overlay's shadow root. No parsed value is stored, used in the impact
 * view, or counted as a plan until the user confirms it here; every field
 * is editable; there is no auto-confirm and no "skip confirmation"
 * setting.
 *
 * Structural framing: this is a
 * <form>, never role="dialog"/aria-modal, with no focus trap and no page
 * backdrop. It renders into the panel's own content-region container
 * (passed in as `container`, an element already inside the shadow root —
 * not the shadow root itself, so the panel's header/tabs/footer stay put
 * around it) — it therefore cannot occlude the checkout or the Buy control
 * at any viewport. It never auto-opens: callers invoke
 * renderConfirmationSheet/renderManualEntrySheet only from a user action.
 *
 * T01 wiring (load-bearing): the only way this module produces a storable
 * PaymentPlanRecord is via `confirmPlan()` (src/parser/confirmation.ts),
 * the single constructor of `ConfirmedPlanInput`. Nothing here fabricates
 * that branded type or bypasses the gate — every submit path below calls
 * confirmPlan() with the literal `confirmed: true` and the exact values
 * shown in the form (the user's own edits, never re-read from the page).
 *
 * Type gate: `ConfirmationSheetProps.candidate` accepts ONLY a complete,
 * hard-gated `ScheduleCandidate`. PARTIAL and DEGRADED states are
 * structurally incapable of reaching this function — they route to
 * `renderManualEntrySheet`, whose prefills are suggestions, never
 * presented as authoritative.
 */
import type {
  Cadence,
  Currency,
  DegradeReason,
  IsoDate,
  OrderTotalSuggestion,
  PartialCandidate,
  PaymentPlanRecord,
  ScheduleCandidate,
} from "../shared/types";
import { formatCents } from "../shared/format";
import { multiplyCents, type Cents } from "../shared/money";
import { arithmeticToleranceCents, INSTALLMENT_COUNT_MAX, INSTALLMENT_COUNT_MIN } from "../shared/constants";
import { confirmPlan, buildConfirmedPlanRecord, type ConfirmedPlanInput } from "../parser/confirmation";
import { paymentDates } from "../impact/engine";
import { el, clear, moveFocusToHeading, text } from "./dom";
import { formatMonthDay, parseMoneyInput, todayIsoDate } from "./format-helpers";
import * as copy from "./copy";

export interface ConfirmationSheetProps {
  /** Only a PARSED_CONFIRMABLE candidate typechecks here. */
  readonly candidate: ScheduleCandidate;
  /** May reject (e.g. a storage-write failure) — the sheet then shows SAVE_FAILED inline. */
  readonly onConfirm: (confirmed: PaymentPlanRecord) => void | Promise<void>;
  readonly onCancel: () => void;
}

export interface ManualEntrySheetProps {
  /** Hard-gated fields only, clearly labelled as suggestions; may be absent. */
  readonly prefill?: PartialCandidate;
  /** Present when arriving from the honest degraded state. */
  readonly degradeReason?: DegradeReason;
  /**
   * A one-shot, order-total-ONLY read from a DEGRADED page (see
   * src/shared/types.ts's OrderTotalSuggestion and
   * src/engine/order-total-suggestion.ts). Ignored whenever `prefill` is
   * also present -- the two are structurally mutually exclusive in
   * practice (a PARTIAL candidate never coexists with a DEGRADED
   * suggestion), and `prefill`, being the richer shape, takes precedence
   * if a caller ever passes both.
   */
  readonly orderTotalSuggestion?: OrderTotalSuggestion;
  readonly onConfirm: (confirmed: PaymentPlanRecord) => void | Promise<void>;
  readonly onCancel: () => void;
}

interface FieldSpec {
  readonly id: string;
  readonly label: string;
  readonly initial: string;
  readonly missing: boolean;
  readonly placeholder?: string;
}

const CADENCES: readonly Cadence[] = ["BIWEEKLY", "WEEKLY", "MONTHLY"];

function cadenceOptions(select: HTMLSelectElement, selected: Cadence | ""): void {
  const blank = el("option", { attrs: { value: "" }, text: copy.CADENCE_CHOOSE_ONE });
  if (selected === "") blank.selected = true;
  select.appendChild(blank);
  for (const c of CADENCES) {
    const opt = el("option", { attrs: { value: c }, text: copy.CADENCE_OPTION_LABELS[c] });
    if (c === selected) opt.selected = true;
    select.appendChild(opt);
  }
}

function fieldHead(spec: FieldSpec): HTMLDivElement {
  return el("div", {
    className: "field__head",
    children: [
      el("label", { attrs: { for: spec.id }, text: spec.label }),
      spec.missing
        ? el("span", { className: "field__flag", attrs: { "aria-hidden": "true" }, text: copy.FIELD_FLAG_MISSING })
        : null,
    ],
  });
}

function textField(
  spec: FieldSpec,
  inputAttrs: Record<string, string>,
  hintOverride?: string,
): {
  readonly wrap: HTMLDivElement;
  readonly input: HTMLInputElement;
} {
  const input = el("input", {
    attrs: {
      id: spec.id,
      value: spec.initial,
      "aria-describedby": `${spec.id}-hint`,
      ...inputAttrs,
      ...(spec.placeholder ? { placeholder: spec.placeholder } : {}),
    },
  });
  const hintText = hintOverride ?? (spec.missing ? copy.FIELD_HINT_MISSING : copy.FIELD_HINT_PARSED);
  const wrap = el("div", {
    className: spec.missing ? "field field--missing" : "field",
    children: [
      fieldHead(spec),
      input,
      el("p", { className: "hint sr-only", attrs: { id: `${spec.id}-hint` }, text: hintText }),
    ],
  });
  return { wrap, input };
}

interface BuildFormOptions {
  readonly container: HTMLElement;
  readonly leadLine: string | null;
  readonly title: string;
  readonly sub: string;
  readonly currency: Currency;
  readonly total: FieldSpec;
  readonly count: FieldSpec;
  readonly cadenceInitial: Cadence | "";
  readonly cadenceMissing: boolean;
  readonly each: FieldSpec;
  readonly firstDate: IsoDate;
  /**
   * When present, every field's hint text is this string instead of the
   * default FIELD_HINT_PARSED/FIELD_HINT_MISSING/FIELD_HINT_FIRST_PAYMENT
   * split -- those all claim a value came from a page, which the edit form
   * (opened from the toolbar popup, no page in play) must never say.
   * Absent, behaviour is byte-identical to before this option existed. It
   * never changes which hints are sr-only (four stay sr-only, the
   * first-payment hint stays visible) -- only their text.
   */
  readonly hintOverride?: string;
  /** Defaults to copy.FORM_SUBMIT when absent. */
  readonly submitLabel?: string;
  /**
   * Defaults to "total" (the order-total field, today's exact behaviour)
   * when absent. "heading" moves focus to the form's own <h3> instead --
   * used only by the edit form (edit-plan-spec §7.2), whose fields are all
   * equally pre-filled, so no one field is the natural place to land.
   */
  readonly initialFocus?: "total" | "heading";
  readonly buildRecord: (values: {
    orderTotalCents: Cents;
    installmentCount: number;
    cadence: Cadence;
    perInstallmentCents: Cents;
  }, firstPaymentDate: IsoDate) => PaymentPlanRecord;
  readonly onConfirm: (confirmed: PaymentPlanRecord) => void | Promise<void>;
  readonly onCancel: () => void;
}

const ECHO_DEBOUNCE_MS = 400;

function renderForm(opts: BuildFormOptions): void {
  const { container } = opts;
  clear(container);

  const formHeadingId = "ppc-form-h";
  const form = el("form", { attrs: { "aria-labelledby": formHeadingId } });

  // Everything visible while typing lives in this scrolling region; the
  // preview/note and the actions row are appended to `form` directly,
  // below, outside it (see §2.1/§2.5 of the layout spec).
  const fields = el("div", { className: "form__fields" });

  if (opts.leadLine) {
    fields.appendChild(el("p", { className: "form__lead", text: opts.leadLine }));
  }
  fields.appendChild(el("h3", { className: "form__h", attrs: { id: formHeadingId }, text: opts.title }));
  // The lead line already carries the instruction the sub would otherwise
  // repeat -- render at most one of them.
  if (!opts.leadLine) {
    fields.appendChild(el("p", { className: "form__sub", text: opts.sub }));
  }

  const totalField = textField(
    opts.total,
    { type: "text", inputmode: "decimal", required: "" },
    opts.hintOverride,);

  const countField = textField(
    opts.count,
    { type: "number", min: String(INSTALLMENT_COUNT_MIN), max: String(INSTALLMENT_COUNT_MAX), required: "" },
    opts.hintOverride,);

  const cadenceSelect = el("select", {
    attrs: { id: "ppc-f-cadence", "aria-describedby": "ppc-f-cadence-hint", required: "" },
  });
  cadenceOptions(cadenceSelect, opts.cadenceInitial);
  const cadenceSpec: FieldSpec = {
    id: "ppc-f-cadence",
    label: copy.FIELD_LABEL_CADENCE,
    initial: opts.cadenceInitial,
    missing: opts.cadenceMissing,
  };
  const cadenceWrap = el("div", {
    className: opts.cadenceMissing ? "field field--missing" : "field",
    children: [
      fieldHead(cadenceSpec),
      cadenceSelect,
      el("p", {
        className: "hint sr-only",
        attrs: { id: "ppc-f-cadence-hint" },
        text: opts.hintOverride ?? (opts.cadenceMissing ? copy.FIELD_HINT_MISSING : copy.FIELD_HINT_PARSED),
      }),
    ],
  });

  const eachField = textField(
    opts.each,
    { type: "text", inputmode: "decimal", required: "" },
    opts.hintOverride,);

  // Rows regrouped for footprint only -- DOM/tab order is unchanged:
  // total, count, cadence, each, first (§2.3 of the layout spec).
  const gridA = el("div", { className: "grid2", children: [totalField.wrap, countField.wrap] });
  const gridB = el("div", { className: "grid2", children: [cadenceWrap, eachField.wrap] });
  fields.appendChild(gridA);
  fields.appendChild(gridB);

  const firstInput = el("input", {
    attrs: { id: "ppc-f-first", type: "date", value: opts.firstDate, "aria-describedby": "ppc-f-first-hint", required: "" },
  });
  const firstSpec: FieldSpec = {
    id: "ppc-f-first",
    label: copy.FIELD_LABEL_FIRST,
    initial: opts.firstDate,
    missing: false,
  };
  fields.appendChild(
    el("div", {
      className: "field",
      children: [
        fieldHead(firstSpec),
        firstInput,
        el("p", {
          className: "hint",
          attrs: { id: "ppc-f-first-hint" },
          text: opts.hintOverride ?? copy.FIELD_HINT_FIRST_PAYMENT,
        }),
      ],
    }),);

  form.appendChild(fields);

  // §5 R5 (first-run UX spec): the preview line and the arithmetic note
  // are siblings in ONE container, always in this order -- inserted or
  // removed only within it, so their combined appearance is one reflow
  // (never two) and the note can never render above the preview depending
  // on which recompute ran last. Moved out of the scroll region entirely
  // (§2.5 of the layout spec): it is what you read before committing, so
  // it sits directly above the row that commits.
  const derived = el("div", { className: "form__derived" });
  const echo = el("p", {
    className: "echo echo--empty",
    attrs: { role: "status", "aria-live": "polite", "aria-atomic": "true" },
  });
  derived.appendChild(echo);
  form.appendChild(derived);

  let arithmeticNote: HTMLParagraphElement | null = null;
  let errorNote: HTMLParagraphElement | null = null;

  const actions = el("div", { className: "actions form__actions" });
  const submitBtn = el("button", {
    className: "btn btn--primary",
    attrs: { type: "submit" },
    text: opts.submitLabel ?? copy.FORM_SUBMIT,
  });
  const cancelBtn = el("button", {
    className: "btn btn--ghost",
    attrs: { type: "button" },
    text: copy.FORM_CANCEL,
    on: { click: () => opts.onCancel() },
  });
  actions.appendChild(submitBtn);
  actions.appendChild(cancelBtn);
  form.appendChild(actions);

  let echoTimer: ReturnType<typeof setTimeout> | undefined;

  function currentCadence(): Cadence | null {
    const v = cadenceSelect.value;
    return (CADENCES as readonly string[]).includes(v) ? (v as Cadence) : null;
  }

  function recompute(): void {
    if (echoTimer) clearTimeout(echoTimer);
    echoTimer = setTimeout(() => {
      updateEchoAndNote();
    }, ECHO_DEBOUNCE_MS);
  }

  function updateEchoAndNote(): void {
    clear(echo);
    if (arithmeticNote) {
      arithmeticNote.remove();
      arithmeticNote = null;
    }

    const totalCents = parseMoneyInput(totalField.input.value, "orderTotalCents");
    const eachCents = parseMoneyInput(eachField.input.value, "perInstallmentCents");
    const count = parseInt(countField.input.value, 10);
    const cadence = currentCadence();
    const first = firstInput.value;
    const validCount =
      Number.isSafeInteger(count) && count >= INSTALLMENT_COUNT_MIN && count <= INSTALLMENT_COUNT_MAX;

    if (totalCents === null || eachCents === null || !validCount || !cadence || !/^\d{4}-\d{2}-\d{2}$/.test(first)) {
      // §5 R1/R3: nothing to preview. The node stays in the DOM (R2 --
      // role="status" regions must exist before content is added to
      // announce reliably) but reserves zero space: no reserved bar, no
      // placeholder, no skeleton. `.echo--empty` is an explicit class this
      // same function sets/clears, never a `:empty` selector (R3).
      echo.classList.add("echo--empty");
      return;
    }
    echo.classList.remove("echo--empty");

    const dates = paymentDates({
      id: "preview",
      createdAt: first,
      source: "manual",
      currency: opts.currency,
      orderTotalCents: totalCents,
      installmentCount: count,
      cadence,
      perInstallmentCents: eachCents,
      firstPaymentDate: first,
    });
    const lead = copy.formEcho(dates.map((d) => formatMonthDay(d)));
    echo.appendChild(text(`${lead.lead} `));
    lead.dates.forEach((d, i) => {
      echo.appendChild(el("span", { className: "d", text: d }));
      echo.appendChild(text(i < lead.dates.length - 1 ? ", " : "."));
    });

    const product = multiplyCents(eachCents, count);
    const diff = Math.abs(product - totalCents);
    if (diff > arithmeticToleranceCents(count)) {
      const parts = copy.formArithmetic(
        count,
        formatCents(eachCents, opts.currency),
        formatCents(product, opts.currency),
        formatCents(totalCents, opts.currency),);
      arithmeticNote = el("p", {
        className: "note",
        children: [
          text(`${parts.n} × `),
          el("b", { text: parts.amount }),
          text(" is "),
          el("b", { text: parts.product }),
          text(". The order total we read is "),
          el("b", { text: parts.total }),
          text("."),
        ],
      });
      // §5 R5: appended into the SAME container as the preview line
      // (never `form.insertBefore(arithmeticNote, actions)`, which used
      // to give the note a separate insertion path of its own), always
      // after it -- one shared home, one fixed order.
      derived.appendChild(arithmeticNote);
    }
  }

  for (const input of [totalField.input, countField.input, eachField.input, firstInput]) {
    input.addEventListener("input", recompute);
  }
  cadenceSelect.addEventListener("change", recompute);
  updateEchoAndNote();

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    // F2: a write for this form is already in flight -- a second Enter/
    // click before it resolves must be a no-op, not a second addPlan/
    // updatePlan call. See the `submitBtn.disabled = true` below, which is
    // the only thing that can make this branch true.
    if (submitBtn.disabled) return;

    const totalCents = parseMoneyInput(totalField.input.value, "orderTotalCents");
    const eachCents = parseMoneyInput(eachField.input.value, "perInstallmentCents");
    const count = parseInt(countField.input.value, 10);
    const cadence = currentCadence();
    const first = firstInput.value;
    // F7: firstPaymentDate used to reach buildRecord/validatePlanRecord on
    // nothing but native <input type="date"> constraint validation. If
    // that assumption ever breaks, an empty/partial date surfaced as
    // SAVE_FAILED's generic "your browser storage may be full" line --
    // the wrong diagnosis for a date problem. Same test updateEchoAndNote
    // already applies to the preview, applied here to the write path too.
    if (
      totalCents === null ||
      eachCents === null ||
      !cadence ||
      !Number.isSafeInteger(count) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(first)
    ) {
      return;
    }

    let record: PaymentPlanRecord;
    try {
      record = opts.buildRecord(
        { orderTotalCents: totalCents, installmentCount: count, cadence, perInstallmentCents: eachCents },
        first,);
    } catch {
      return;
    }

    // F2 (edit-plan-spec §10): double-pressing this button used to be able
    // to add a plan twice (two overlapping addPlan calls, each its own
    // read-then-write-whole-array) or lose one (the second read landing
    // before the first write). Disabling the one control that starts a
    // write closes the window; it is re-enabled only on a rejection, so a
    // real retry after a failed save is still possible. The edit path
    // does not need this for correctness (updatePlan splices the same id
    // in place, so a duplicate call is idempotent by construction) but is
    // not exempted from it either -- it is harmless there too.
    submitBtn.disabled = true;
    const result = opts.onConfirm(record);
    if (result && typeof (result as Promise<void>).then === "function") {
      (result as Promise<void>).catch(() => {
        submitBtn.disabled = false;
        if (errorNote) errorNote.remove();
        errorNote = el("p", { className: "note", attrs: { role: "alert" }, text: copy.SAVE_FAILED });
        form.insertBefore(errorNote, actions);
      });
    } else {
      // A synchronous (non-Promise) onConfirm has no pending write to
      // guard and no rejection path to re-enable from -- leave it enabled.
      submitBtn.disabled = false;
    }
  });

  container.appendChild(form);
  if (opts.initialFocus === "heading") {
    moveFocusToHeading(container, `#${formHeadingId}`);
  } else {
    totalField.input.focus();
  }
}

function candidateFieldValue(cents: Cents, currency: Currency): string {
  return formatCents(cents, currency).replace(/^-/, "");
}

export function renderConfirmationSheet(container: HTMLElement, props: ConfirmationSheetProps): void {
  const { candidate } = props;
  const today = todayIsoDate();

  renderForm({
    container,
    leadLine: null,
    title: copy.FORM_TITLE,
    sub: copy.FORM_SUB,
    currency: candidate.currency,
    total: {
      id: "ppc-f-total",
      label: copy.FIELD_LABEL_TOTAL,
      initial: candidateFieldValue(candidate.orderTotalCents, candidate.currency),
      missing: false,
    },
    count: {
      id: "ppc-f-count",
      label: copy.FIELD_LABEL_COUNT,
      initial: String(candidate.installmentCount),
      missing: false,
    },
    cadenceInitial: candidate.cadence,
    cadenceMissing: false,
    each: {
      id: "ppc-f-each",
      label: copy.FIELD_LABEL_EACH,
      initial: candidateFieldValue(candidate.perInstallmentCents, candidate.currency),
      missing: false,
    },
    firstDate: today,
    buildRecord: (values, firstPaymentDate) => {
      const confirmed: ConfirmedPlanInput = confirmPlan({
        confirmed: true,
        values: { ...values, currency: candidate.currency },
      });
      return buildConfirmedPlanRecord(confirmed, {
        id: crypto.randomUUID(),
        createdAt: today,
        firstPaymentDate,
      });
    },
    onConfirm: props.onConfirm,
    onCancel: props.onCancel,
  });
}

/**
 * The only sanctioned builder of a `source: "manual"` record. Like
 * buildConfirmedPlanRecord, it requires a `ConfirmedPlanInput` — obtainable
 * only via confirmPlan() — so a manual entry passes the identical numeric
 * validation as a checkout-confirmed one; only the provenance tag differs.
 */
function buildManualPlanRecord(
  confirmed: ConfirmedPlanInput,
  meta: { readonly id: string; readonly createdAt: IsoDate; readonly firstPaymentDate: IsoDate },): PaymentPlanRecord {
  return {
    id: meta.id,
    createdAt: meta.createdAt,
    source: "manual",
    currency: confirmed.currency,
    orderTotalCents: confirmed.orderTotalCents,
    installmentCount: confirmed.installmentCount,
    cadence: confirmed.cadence,
    perInstallmentCents: confirmed.perInstallmentCents,
    firstPaymentDate: meta.firstPaymentDate,
  };
}

export function renderManualEntrySheet(container: HTMLElement, props: ManualEntrySheetProps): void {
  const { prefill, orderTotalSuggestion } = props;
  const today = todayIsoDate();
  const isPartial = Boolean(prefill);
  // See ManualEntrySheetProps.orderTotalSuggestion: ignored whenever a
  // richer PARTIAL prefill is also present.
  const suggestedTotalCents = !isPartial ? orderTotalSuggestion?.cents : undefined;

  const currency = prefill?.currency ?? orderTotalSuggestion?.currency ?? "CAD";
  const totalCents = prefill?.orderTotalCents ?? suggestedTotalCents;

  renderForm({
    container,
    leadLine: isPartial
      ? copy.FORM_PARTIAL_LEAD
      : suggestedTotalCents !== undefined
        ? copy.FORM_ORDER_TOTAL_ONLY_LEAD
        : null,
    title: isPartial ? copy.FORM_TITLE : copy.FORM_TITLE_EMPTY,
    sub: isPartial ? copy.FORM_SUB : copy.FORM_SUB_EMPTY,
    currency,
    total: {
      id: "ppc-f-total",
      label: copy.FIELD_LABEL_TOTAL,
      initial: totalCents !== undefined ? candidateFieldValue(totalCents, currency) : "",
      missing: totalCents === undefined,
      placeholder: "$0.00",
    },
    count: {
      id: "ppc-f-count",
      label: copy.FIELD_LABEL_COUNT,
      initial: prefill?.installmentCount !== undefined ? String(prefill.installmentCount) : "",
      missing: prefill?.installmentCount === undefined,
      placeholder: "4",
    },
    cadenceInitial: prefill?.cadence ?? "",
    cadenceMissing: prefill?.cadence === undefined,
    each: {
      id: "ppc-f-each",
      label: copy.FIELD_LABEL_EACH,
      initial: prefill?.perInstallmentCents !== undefined ? candidateFieldValue(prefill.perInstallmentCents, currency) : "",
      missing: prefill?.perInstallmentCents === undefined,
      placeholder: "$0.00",
    },
    firstDate: today,
    buildRecord: (values, firstPaymentDate) => {
      const confirmed = confirmPlan({
        confirmed: true,
        values: { ...values, currency },
      });
      return buildManualPlanRecord(confirmed, {
        id: crypto.randomUUID(),
        createdAt: today,
        firstPaymentDate,
      });
    },
    onConfirm: props.onConfirm,
    onCancel: props.onCancel,
  });
}

export interface EditChangeSummary {
  /** True when any of the five user-editable values differs from the stored plan. */
  readonly valuesChanged: boolean;
  /** True when the computed payment dates differ from the stored plan's.
   *  Always false when valuesChanged is false. */
  readonly datesChanged: boolean;
}

export interface EditPlanSheetProps {
  /** The stored record being corrected. Prefills are authoritative, not suggestions. */
  readonly plan: PaymentPlanRecord;
  /** May reject — the sheet then shows SAVE_FAILED inline, exactly as the other two do. */
  readonly onSave: (updated: PaymentPlanRecord, changed: EditChangeSummary) => void | Promise<void>;
  readonly onCancel: () => void;
}

/**
 * Builds the corrected record for `PlanLedger.updatePlan` (edit-plan-spec
 * §4.3). Requires a `ConfirmedPlanInput` for the same reason
 * buildManualPlanRecord/buildConfirmedPlanRecord do: an edited plan passes
 * the identical numeric gate as a new one. Only the provenance tag and the
 * carried-through id/createdAt differ.
 *
 * All nine fields are listed literally, matching its two siblings, so the
 * closed allowlist (assertClosedFieldSet, src/storage/ledger.ts) is
 * satisfied by construction — a tenth field would be a compile error in
 * all three builders at once rather than a runtime "plan record is missing
 * required field" in only one of them.
 */
function buildEditedPlanRecord(
  confirmed: ConfirmedPlanInput,
  original: PaymentPlanRecord,
  firstPaymentDate: IsoDate,): PaymentPlanRecord {
  const valuesChanged =
    confirmed.orderTotalCents !== original.orderTotalCents ||
    confirmed.installmentCount !== original.installmentCount ||
    confirmed.cadence !== original.cadence ||
    confirmed.perInstallmentCents !== original.perInstallmentCents ||
    firstPaymentDate !== original.firstPaymentDate;
  return {
    id: original.id, // §1.2 — never regenerated
    createdAt: original.createdAt, // §1.2 — never rewritten
    source: valuesChanged ? "manual" : original.source, // §1.1
    currency: confirmed.currency,
    orderTotalCents: confirmed.orderTotalCents,
    installmentCount: confirmed.installmentCount,
    cadence: confirmed.cadence,
    perInstallmentCents: confirmed.perInstallmentCents,
    firstPaymentDate,
  };
}

/**
 * The §1.1 invariant, computed once here and handed to onSave — the only
 * place this comparison exists; a caller never re-derives it. `datesChanged`
 * is short-circuited to false whenever `valuesChanged` is false (test #19's
 * "valuesChanged: false implies datesChanged: false"), which also means a
 * no-op save never bothers computing paymentDates() twice for nothing.
 */
function computeEditChangeSummary(original: PaymentPlanRecord, next: PaymentPlanRecord): EditChangeSummary {
  const valuesChanged =
    next.orderTotalCents !== original.orderTotalCents ||
    next.installmentCount !== original.installmentCount ||
    next.cadence !== original.cadence ||
    next.perInstallmentCents !== original.perInstallmentCents ||
    next.firstPaymentDate !== original.firstPaymentDate;
  const datesChanged = valuesChanged && !datesEqual(paymentDates(original), paymentDates(next));
  return { valuesChanged, datesChanged };
}

function datesEqual(a: readonly IsoDate[], b: readonly IsoDate[]): boolean {
  return a.length === b.length && a.every((d, i) => d === b[i]);
}

/**
 * A third export sharing renderForm wholesale (edit-plan-spec §4.1),
 * deliberately NOT an optional `editing?: PaymentPlanRecord` widening
 * ManualEntrySheetProps: that sheet's documented contract is "prefills are
 * suggestions, never presented as authoritative" — an edit's prefills are
 * the exact opposite, and overloading one function with two contradictory
 * prefill semantics is how a hint string ends up lying.
 */
export function renderEditPlanSheet(container: HTMLElement, props: EditPlanSheetProps): void {
  const { plan } = props;

  renderForm({
    container,
    leadLine: null,
    title: copy.FORM_TITLE_EDIT,
    // §4.2 — the sub slot, not the lead slot: .form__sub costs 15px less
    // than .form__lead's quote-bar treatment, and an edit form reads
    // nothing off any page, so the lead's "here is something we read"
    // framing would be wrong here regardless of cost.
    sub: copy.FORM_SUB_EDIT,
    currency: plan.currency,
    total: {
      id: "ppc-f-total",
      label: copy.FIELD_LABEL_TOTAL,
      initial: candidateFieldValue(plan.orderTotalCents, plan.currency),
      // §4.2 — always false: nothing is missing on an edit.
      missing: false,
    },
    count: {
      id: "ppc-f-count",
      label: copy.FIELD_LABEL_COUNT,
      initial: String(plan.installmentCount),
      missing: false,
    },
    cadenceInitial: plan.cadence,
    cadenceMissing: false,
    each: {
      id: "ppc-f-each",
      label: copy.FIELD_LABEL_EACH,
      initial: candidateFieldValue(plan.perInstallmentCents, plan.currency),
      missing: false,
    },
    // §4.2 — the stored date, never today: an edit form must never suggest
    // "today" is where this plan starts.
    firstDate: plan.firstPaymentDate,
    hintOverride: copy.EDIT_FIELD_HINT,
    submitLabel: copy.FORM_SUBMIT_EDIT,
    initialFocus: "heading",
    buildRecord: (values, firstPaymentDate) => {
      const confirmed = confirmPlan({ confirmed: true, values: { ...values, currency: plan.currency } });
      return buildEditedPlanRecord(confirmed, plan, firstPaymentDate);
    },
    onConfirm: (updated) => props.onSave(updated, computeEditChangeSummary(plan, updated)),
    onCancel: props.onCancel,
  });
}
