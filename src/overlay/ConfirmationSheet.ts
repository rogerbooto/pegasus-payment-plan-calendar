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
  PartialCandidate,
  PaymentPlanRecord,
  ScheduleCandidate,
} from "../shared/types";
import { formatCents } from "../shared/format";
import { multiplyCents, type Cents } from "../shared/money";
import { arithmeticToleranceCents, INSTALLMENT_COUNT_MAX, INSTALLMENT_COUNT_MIN } from "../shared/constants";
import { confirmPlan, buildConfirmedPlanRecord, type ConfirmedPlanInput } from "../parser/confirmation";
import { paymentDates } from "../impact/engine";
import { el, clear, text } from "./dom";
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

function textField(spec: FieldSpec, inputAttrs: Record<string, string>): {
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
  const hintText = spec.missing ? copy.FIELD_HINT_MISSING : copy.FIELD_HINT_PARSED;
  const wrap = el("div", {
    className: spec.missing ? "field field--missing" : "field",
    children: [
      el("label", { attrs: { for: spec.id }, text: spec.label }),
      input,
      el("p", { className: "hint", attrs: { id: `${spec.id}-hint` }, text: hintText }),
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

  if (opts.leadLine) {
    form.appendChild(el("p", { className: "form__lead", text: opts.leadLine }));
  }
  form.appendChild(el("h3", { className: "form__h", attrs: { id: formHeadingId }, text: opts.title }));
  form.appendChild(el("p", { className: "form__sub", text: opts.sub }));

  const totalField = textField(opts.total, {
    type: "text",
    inputmode: "decimal",
    required: "",
  });
  form.appendChild(totalField.wrap);

  const grid = el("div", { className: "grid2" });
  const countField = textField(opts.count, {
    type: "number",
    min: String(INSTALLMENT_COUNT_MIN),
    max: String(INSTALLMENT_COUNT_MAX),
    required: "",
  });
  grid.appendChild(countField.wrap);

  const cadenceSelect = el("select", {
    attrs: { id: "ppc-f-cadence", "aria-describedby": "ppc-f-cadence-hint", required: "" },
  });
  cadenceOptions(cadenceSelect, opts.cadenceInitial);
  const cadenceWrap = el("div", {
    className: opts.cadenceMissing ? "field field--missing" : "field",
    children: [
      el("label", { attrs: { for: "ppc-f-cadence" }, text: copy.FIELD_LABEL_CADENCE }),
      cadenceSelect,
      el("p", {
        className: "hint",
        attrs: { id: "ppc-f-cadence-hint" },
        text: opts.cadenceMissing ? copy.FIELD_HINT_MISSING : copy.FIELD_HINT_PARSED,
      }),
    ],
  });
  grid.appendChild(cadenceWrap);
  form.appendChild(grid);

  const eachField = textField(opts.each, {
    type: "text",
    inputmode: "decimal",
    required: "",
  });
  form.appendChild(eachField.wrap);

  const firstInput = el("input", {
    attrs: { id: "ppc-f-first", type: "date", value: opts.firstDate, "aria-describedby": "ppc-f-first-hint", required: "" },
  });
  form.appendChild(
    el("div", {
      className: "field",
      children: [
        el("label", { attrs: { for: "ppc-f-first" }, text: copy.FIELD_LABEL_FIRST }),
        firstInput,
        el("p", { className: "hint", attrs: { id: "ppc-f-first-hint" }, text: copy.FIELD_HINT_FIRST_PAYMENT }),
      ],
    }),);

  // §5 R5 (first-run UX spec): the preview line and the arithmetic note
  // are siblings in ONE container, always in this order -- inserted or
  // removed only within it, so their combined appearance is one reflow
  // (never two) and the note can never render above the preview depending
  // on which recompute ran last.
  const derived = el("div", { className: "form__derived" });
  const echo = el("p", {
    className: "echo echo--empty",
    attrs: { role: "status", "aria-live": "polite", "aria-atomic": "true" },
  });
  derived.appendChild(echo);
  form.appendChild(derived);

  let arithmeticNote: HTMLParagraphElement | null = null;
  let errorNote: HTMLParagraphElement | null = null;

  // §5 R4 / X6: was an inline `style="margin-top:2px"` attribute; the
  // layout value (plus the sticky-to-the-scroll-container behaviour) now
  // lives entirely in OVERLAY_CSS's `.form__actions` rule.
  const actions = el("div", { className: "actions form__actions" });
  const submitBtn = el("button", { className: "btn btn--primary", attrs: { type: "submit" }, text: copy.FORM_SUBMIT });
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
    const totalCents = parseMoneyInput(totalField.input.value, "orderTotalCents");
    const eachCents = parseMoneyInput(eachField.input.value, "perInstallmentCents");
    const count = parseInt(countField.input.value, 10);
    const cadence = currentCadence();
    const first = firstInput.value;
    if (totalCents === null || eachCents === null || !cadence || !Number.isSafeInteger(count)) return;

    let record: PaymentPlanRecord;
    try {
      record = opts.buildRecord(
        { orderTotalCents: totalCents, installmentCount: count, cadence, perInstallmentCents: eachCents },
        first,);
    } catch {
      return;
    }

    const result = opts.onConfirm(record);
    if (result && typeof (result as Promise<void>).then === "function") {
      (result as Promise<void>).catch(() => {
        if (errorNote) errorNote.remove();
        errorNote = el("p", { className: "note", attrs: { role: "alert" }, text: copy.SAVE_FAILED });
        form.insertBefore(errorNote, actions);
      });
    }
  });

  container.appendChild(form);
  totalField.input.focus();
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
  const { prefill } = props;
  const today = todayIsoDate();
  const isPartial = Boolean(prefill);

  const currency = prefill?.currency ?? "CAD";

  renderForm({
    container,
    leadLine: isPartial ? copy.FORM_PARTIAL_LEAD : null,
    title: isPartial ? copy.FORM_TITLE : copy.FORM_TITLE_EMPTY,
    sub: isPartial ? copy.FORM_SUB : copy.FORM_SUB_EMPTY,
    currency,
    total: {
      id: "ppc-f-total",
      label: copy.FIELD_LABEL_TOTAL,
      initial: prefill?.orderTotalCents !== undefined ? candidateFieldValue(prefill.orderTotalCents, currency) : "",
      missing: prefill?.orderTotalCents === undefined,
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
