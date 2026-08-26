/**
 * @vitest-environment jsdom
 *
 * The mandatory confirmation form (T01) and its manual-entry sibling.
 * Structural framing: a real <form>, no dialog role, no
 * aria-modal, no focus trap. T01 wiring: the resulting record always
 * carries the values shown in the form at submit time — including the
 * user's own edits — never the original candidate untouched.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderConfirmationSheet, renderManualEntrySheet } from "../../../src/overlay/ConfirmationSheet";
import type { ScheduleCandidate } from "../../../src/shared/types";
import { assertCents } from "../../../src/shared/money";

// jsdom's ID-selector fast path can misresolve `el.querySelector("#id")`
// when the same id string exists elsewhere in the document (each test
// below renders its own form using the same static field ids, e.g.
// "ppc-f-total" — safe in production, where only one instance is ever
// mounted per shadow root at a time). Clearing the body between tests
// keeps every id unique for the duration of each test.
beforeEach(() => {
  document.body.replaceChildren();
});

function candidate(overrides: Partial<ScheduleCandidate> = {}): ScheduleCandidate {
  return {
    orderTotalCents: assertCents(15000, "total"),
    installmentCount: 4,
    cadence: "BIWEEKLY",
    perInstallmentCents: assertCents(3750, "each"),
    currency: "CAD",
    confidence: { hardGatesPassed: true, softScore: 6, signals: [] },
    ...overrides,
  };
}

function container(): HTMLDivElement {
  const div = document.createElement("div");
  document.body.appendChild(div);
  return div;
}

describe("ConfirmationSheet — structural framing", () => {
  it("renders a real <form>, never a dialog: no role=dialog, no aria-modal, anywhere", () => {
    const el = container();
    renderConfirmationSheet(el, { candidate: candidate(), onConfirm: vi.fn(), onCancel: vi.fn() });

    const form = el.querySelector("form");
    expect(form).not.toBeNull();
    // The exact guard: RED if a dialog role or aria-modal is ever added.
    expect(el.querySelector('[role="dialog"]')).toBeNull();
    expect(el.querySelector("[aria-modal]")).toBeNull();
    expect(el.querySelector("h3")?.textContent).toBe("The numbers we read from this page");
  });

  it("Cancel calls onCancel and never onConfirm", () => {
    const el = container();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    renderConfirmationSheet(el, { candidate: candidate(), onConfirm, onCancel });

    const cancelBtn = [...el.querySelectorAll("button")].find((b) => b.textContent === "Cancel") as HTMLButtonElement;
    cancelBtn.click();

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

describe("ConfirmationSheet — T01: the record reflects what the user actually saw/edited", () => {
  it("submitting unmodified fields produces a record equal to the candidate's own values", () => {
    const el = container();
    const onConfirm = vi.fn();
    renderConfirmationSheet(el, { candidate: candidate(), onConfirm, onCancel: vi.fn() });

    const form = el.querySelector("form") as HTMLFormElement;
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    const record = onConfirm.mock.calls[0]?.[0];
    expect(record.orderTotalCents).toBe(15000);
    expect(record.perInstallmentCents).toBe(3750);
    expect(record.installmentCount).toBe(4);
    expect(record.cadence).toBe("BIWEEKLY");
    expect(record.source).toBe("checkout_confirmed");
  });

  it("editing a field before submit changes the stored record — RED if the gate silently used the original candidate instead of the shown/edited value", () => {
    const el = container();
    const onConfirm = vi.fn();
    renderConfirmationSheet(el, { candidate: candidate(), onConfirm, onCancel: vi.fn() });

    const totalInput = el.querySelector("#ppc-f-total") as HTMLInputElement;
    totalInput.value = "$163.94";
    totalInput.dispatchEvent(new Event("input", { bubbles: true }));

    const form = el.querySelector("form") as HTMLFormElement;
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    const record = onConfirm.mock.calls[0]?.[0];
    // The exact guard: the edited value reaches the record, not the
    // original 15000 the candidate carried.
    expect(record.orderTotalCents).toBe(16394);
  });

  it("an unparsable edited amount blocks submission — never silently falls back to the original candidate value", () => {
    const el = container();
    const onConfirm = vi.fn();
    renderConfirmationSheet(el, { candidate: candidate(), onConfirm, onCancel: vi.fn() });

    const totalInput = el.querySelector("#ppc-f-total") as HTMLInputElement;
    totalInput.value = "not a number";
    totalInput.dispatchEvent(new Event("input", { bubbles: true }));

    const form = el.querySelector("form") as HTMLFormElement;
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

    // RED if an unparsable field is silently coerced/ignored and onConfirm
    // still fires with a fabricated or stale value.
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("shows the arithmetic note (no verdict, no blocking) when the edited total no longer matches count x each", async () => {
    vi.useFakeTimers();
    const el = container();
    renderConfirmationSheet(el, { candidate: candidate(), onConfirm: vi.fn(), onCancel: vi.fn() });

    const totalInput = el.querySelector("#ppc-f-total") as HTMLInputElement;
    totalInput.value = "$163.94";
    totalInput.dispatchEvent(new Event("input", { bubbles: true }));
    vi.advanceTimersByTime(500);
    vi.useRealTimers();

    const note = el.querySelector(".note");
    expect(note?.textContent).toBe("4 × $37.50 is $150.00. The order total we read is $163.94.");

    // Never blocking: the submit button is still present and enabled.
    const submitBtn = el.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(false);
  });
});

describe("ManualEntrySheet — provenance and missing-field labelling", () => {
  it("produces a record with source: manual, requiring the same confirmPlan gate", () => {
    const el = container();
    const onConfirm = vi.fn();
    renderManualEntrySheet(el, { onConfirm, onCancel: vi.fn() });

    (el.querySelector("#ppc-f-total") as HTMLInputElement).value = "$60.00";
    (el.querySelector("#ppc-f-count") as HTMLInputElement).value = "4";
    (el.querySelector("#ppc-f-cadence") as HTMLSelectElement).value = "MONTHLY";
    (el.querySelector("#ppc-f-each") as HTMLInputElement).value = "$15.00";

    const form = el.querySelector("form") as HTMLFormElement;
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    const record = onConfirm.mock.calls[0]?.[0];
    expect(record.source).toBe("manual");
    expect(record.orderTotalCents).toBe(6000);
  });

  it("marks only the missing fields from a PARTIAL prefill, and shows FORM_TITLE (not FORM_TITLE_EMPTY)", () => {
    const el = container();
    renderManualEntrySheet(el, {
      prefill: {
        orderTotalCents: assertCents(19600, "total"),
        installmentCount: 4,
        confidence: { hardGatesPassed: false, softScore: 0, signals: [] },
      },
      onConfirm: vi.fn(),
      onCancel: vi.fn(),
    });

    expect(el.querySelector("h3")?.textContent).toBe("The numbers we read from this page");
    expect(el.querySelector(".form__lead")?.textContent).toBe(
      "We read part of this plan. Fill in the rest and check what's here.",);
    const totalField = el.querySelector("#ppc-f-total")?.closest(".field");
    const cadenceField = el.querySelector("#ppc-f-cadence")?.closest(".field");
    expect(totalField?.className).not.toContain("field--missing");
    expect(cadenceField?.className).toContain("field--missing");
    expect(cadenceField?.querySelector(".hint")?.textContent).toBe("Not found on this page.");
  });

  it("with no prefill at all, shows the empty-path title/sub and no missing-field styling assumptions beyond that", () => {
    const el = container();
    renderManualEntrySheet(el, { onConfirm: vi.fn(), onCancel: vi.fn() });
    expect(el.querySelector("h3")?.textContent).toBe("Add a plan");
    expect(el.querySelector(".form__sub")?.textContent).toBe("Fill in what the checkout is offering you.");
  });
});

describe("ConfirmationSheet/ManualEntrySheet — T14: no credential input anywhere", () => {
  it("contains no password/email/credential-shaped input in either sheet", () => {
    const el1 = container();
    renderConfirmationSheet(el1, { candidate: candidate(), onConfirm: vi.fn(), onCancel: vi.fn() });
    const el2 = container();
    renderManualEntrySheet(el2, { onConfirm: vi.fn(), onCancel: vi.fn() });

    for (const el of [el1, el2]) {
      expect(el.querySelector('input[type="password"]')).toBeNull();
      expect(el.querySelector('input[type="email"]')).toBeNull();
      const inputTypes = [...el.querySelectorAll("input")].map((i) => i.type);
      expect(inputTypes.every((t) => t === "text" || t === "number" || t === "date")).toBe(true);
    }
  });
});
