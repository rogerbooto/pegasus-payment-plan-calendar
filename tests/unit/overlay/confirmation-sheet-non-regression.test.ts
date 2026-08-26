/**
 * @vitest-environment jsdom
 *
 * edit-plan-spec.md §9.4 — the guard that keeps the pinned suite honest.
 * renderForm gained three new, optional options (hintOverride, submitLabel,
 * initialFocus) so renderEditPlanSheet can share it wholesale. Each one
 * must default to today's exact behaviour when absent; these tests prove
 * the defaults did not drift, independently of
 * tests/unit/overlay/confirmation-sheet.test.ts (which is pinned
 * byte-identical and is NOT edited by this change).
 *
 * A NEW file, never an edit to confirmation-sheet.test.ts,
 * confirmation-sheet-layout.test.ts or confirmation-sheet-preview.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderConfirmationSheet, renderManualEntrySheet } from "../../../src/overlay/ConfirmationSheet";
import * as copy from "../../../src/overlay/copy";
import type { ScheduleCandidate } from "../../../src/shared/types";
import { assertCents } from "../../../src/shared/money";

beforeEach(() => {
  document.body.replaceChildren();
});

function container(): HTMLDivElement {
  const div = document.createElement("div");
  document.body.appendChild(div);
  return div;
}

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

describe("§9.4 item 22 — initial focus default did not drift", () => {
  it("renderConfirmationSheet still focuses #ppc-f-total", () => {
    const el = container();
    renderConfirmationSheet(el, { candidate: candidate(), onConfirm: vi.fn(), onCancel: vi.fn() });
    expect(document.activeElement).toBe(el.querySelector("#ppc-f-total"));
  });

  it("renderManualEntrySheet still focuses #ppc-f-total", () => {
    const el = container();
    renderManualEntrySheet(el, { onConfirm: vi.fn(), onCancel: vi.fn() });
    expect(document.activeElement).toBe(el.querySelector("#ppc-f-total"));
  });
});

describe("§9.4 item 23 — submit label default did not drift", () => {
  it("renderConfirmationSheet still renders FORM_SUBMIT (\"Add to my calendar\")", () => {
    const el = container();
    renderConfirmationSheet(el, { candidate: candidate(), onConfirm: vi.fn(), onCancel: vi.fn() });
    const submitBtn = el.querySelector('button[type="submit"]');
    expect(submitBtn?.textContent).toBe(copy.FORM_SUBMIT);
  });

  it("renderManualEntrySheet still renders FORM_SUBMIT (\"Add to my calendar\")", () => {
    const el = container();
    renderManualEntrySheet(el, { onConfirm: vi.fn(), onCancel: vi.fn() });
    const submitBtn = el.querySelector('button[type="submit"]');
    expect(submitBtn?.textContent).toBe(copy.FORM_SUBMIT);
  });
});

describe("§9.4 item 24 — hint override absence is inert", () => {
  it("renderConfirmationSheet still renders FIELD_HINT_PARSED on every field, never EDIT_FIELD_HINT", () => {
    const el = container();
    renderConfirmationSheet(el, { candidate: candidate(), onConfirm: vi.fn(), onCancel: vi.fn() });
    for (const id of ["ppc-f-total", "ppc-f-count", "ppc-f-cadence", "ppc-f-each"]) {
      expect(el.querySelector(`#${id}-hint`)?.textContent).toBe(copy.FIELD_HINT_PARSED);
    }
    expect(el.querySelector("#ppc-f-first-hint")?.textContent).toBe(copy.FIELD_HINT_FIRST_PAYMENT);
    expect(el.textContent).not.toContain(copy.EDIT_FIELD_HINT);
  });

  it("renderManualEntrySheet (no prefill) still renders FIELD_HINT_MISSING, never EDIT_FIELD_HINT", () => {
    const el = container();
    renderManualEntrySheet(el, { onConfirm: vi.fn(), onCancel: vi.fn() });
    for (const id of ["ppc-f-total", "ppc-f-count", "ppc-f-cadence", "ppc-f-each"]) {
      expect(el.querySelector(`#${id}-hint`)?.textContent).toBe(copy.FIELD_HINT_MISSING);
    }
    expect(el.querySelector("#ppc-f-first-hint")?.textContent).toBe(copy.FIELD_HINT_FIRST_PAYMENT);
    expect(el.textContent).not.toContain(copy.EDIT_FIELD_HINT);
  });
});
