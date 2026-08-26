/**
 * @vitest-environment jsdom
 *
 * ManualEntrySheet's `orderTotalSuggestion` prop (C4): a one-shot,
 * order-total-ONLY read from a DEGRADED page, distinct from `prefill`
 * (a PartialCandidate). Does not touch the pinned
 * tests/unit/overlay/confirmation-sheet.test.ts file -- this is new
 * coverage for the new prop only.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderManualEntrySheet } from "../../../src/overlay/ConfirmationSheet";
import * as copy from "../../../src/overlay/copy";
import { assertCents } from "../../../src/shared/money";
import type { OrderTotalSuggestion } from "../../../src/shared/types";

beforeEach(() => {
  document.body.replaceChildren();
});

function container(): HTMLDivElement {
  const div = document.createElement("div");
  document.body.appendChild(div);
  return div;
}

function suggestion(overrides: Partial<OrderTotalSuggestion> = {}): OrderTotalSuggestion {
  return { cents: assertCents(4210, "total"), currency: "CAD", ...overrides };
}

describe("ManualEntrySheet — orderTotalSuggestion prefills ONLY the total field (C6)", () => {
  it("prefills the total field, marks it not-missing, and shows FIELD_HINT_PARSED", () => {
    const el = container();
    renderManualEntrySheet(el, { orderTotalSuggestion: suggestion(), onConfirm: vi.fn(), onCancel: vi.fn() });

    const totalInput = el.querySelector("#ppc-f-total") as HTMLInputElement;
    expect(totalInput.value).toBe("$42.10");
    const totalField = totalInput.closest(".field");
    expect(totalField?.className).not.toContain("field--missing");
    expect(totalField?.querySelector(".hint")?.textContent).toBe(copy.FIELD_HINT_PARSED);
  });

  it("leaves count, cadence and each fields missing -- a DEGRADED page has no honest source for them", () => {
    const el = container();
    renderManualEntrySheet(el, { orderTotalSuggestion: suggestion(), onConfirm: vi.fn(), onCancel: vi.fn() });

    for (const id of ["ppc-f-count", "ppc-f-cadence", "ppc-f-each"]) {
      const field = el.querySelector(`#${id}`)?.closest(".field");
      expect(field?.className, `${id} should be marked missing`).toContain("field--missing");
      expect(field?.querySelector(".hint")?.textContent).toBe(copy.FIELD_HINT_MISSING);
    }
    expect((el.querySelector("#ppc-f-count") as HTMLInputElement).value).toBe("");
    expect((el.querySelector("#ppc-f-cadence") as HTMLSelectElement).value).toBe("");
    expect((el.querySelector("#ppc-f-each") as HTMLInputElement).value).toBe("");
  });

  it("shows a distinct lead line, never FORM_PARTIAL_LEAD ('We read part of this plan' would be false here)", () => {
    const el = container();
    renderManualEntrySheet(el, { orderTotalSuggestion: suggestion(), onConfirm: vi.fn(), onCancel: vi.fn() });

    expect(el.querySelector(".form__lead")?.textContent).toBe(copy.FORM_ORDER_TOTAL_ONLY_LEAD);
    expect(el.querySelector(".form__lead")?.textContent).not.toBe(copy.FORM_PARTIAL_LEAD);
  });

  it("uses the empty-path title, never the 'numbers we read' framing (only one number was read); sub is suppressed because the lead line already carries the instruction", () => {
    const el = container();
    renderManualEntrySheet(el, { orderTotalSuggestion: suggestion(), onConfirm: vi.fn(), onCancel: vi.fn() });

    expect(el.querySelector("h3")?.textContent).toBe(copy.FORM_TITLE_EMPTY);
    // The layout spec's §5.3 suppression: whenever a lead line renders, the
    // sub does not (it would only repeat the lead's instruction). This form
    // always has a lead (FORM_ORDER_TOTAL_ONLY_LEAD), so `.form__sub` is
    // never present here.
    expect(el.querySelector(".form__sub")).toBeNull();
  });

  it("with no orderTotalSuggestion and no prefill, renders exactly as before (no lead line, total field missing)", () => {
    const el = container();
    renderManualEntrySheet(el, { onConfirm: vi.fn(), onCancel: vi.fn() });
    expect(el.querySelector(".form__lead")).toBeNull();
    const totalField = el.querySelector("#ppc-f-total")?.closest(".field");
    expect(totalField?.className).toContain("field--missing");
  });

  it("a PARTIAL prefill takes precedence over an orderTotalSuggestion if both are somehow passed", () => {
    const el = container();
    renderManualEntrySheet(el, {
      prefill: {
        orderTotalCents: assertCents(19600, "total"),
        confidence: { hardGatesPassed: false, softScore: 0, signals: [] },
      },
      orderTotalSuggestion: suggestion(),
      onConfirm: vi.fn(),
      onCancel: vi.fn(),
    });
    expect((el.querySelector("#ppc-f-total") as HTMLInputElement).value).toBe("$196.00");
    expect(el.querySelector(".form__lead")?.textContent).toBe(copy.FORM_PARTIAL_LEAD);
  });

  it("submitting after filling in the rest produces a source: manual record with the suggested total", () => {
    const el = container();
    const onConfirm = vi.fn();
    renderManualEntrySheet(el, { orderTotalSuggestion: suggestion(), onConfirm, onCancel: vi.fn() });

    (el.querySelector("#ppc-f-count") as HTMLInputElement).value = "4";
    (el.querySelector("#ppc-f-cadence") as HTMLSelectElement).value = "MONTHLY";
    (el.querySelector("#ppc-f-each") as HTMLInputElement).value = "$10.53";

    const form = el.querySelector("form") as HTMLFormElement;
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    const record = onConfirm.mock.calls[0]?.[0];
    expect(record.source).toBe("manual");
    expect(record.orderTotalCents).toBe(4210);
    expect(record.currency).toBe("CAD");
  });

  it("the total field remains fully editable/correctable, same as any other prefilled value", () => {
    const el = container();
    const onConfirm = vi.fn();
    renderManualEntrySheet(el, { orderTotalSuggestion: suggestion(), onConfirm, onCancel: vi.fn() });

    const totalInput = el.querySelector("#ppc-f-total") as HTMLInputElement;
    totalInput.value = "$1.00";
    totalInput.dispatchEvent(new Event("input", { bubbles: true }));
    (el.querySelector("#ppc-f-count") as HTMLInputElement).value = "2";
    (el.querySelector("#ppc-f-cadence") as HTMLSelectElement).value = "MONTHLY";
    (el.querySelector("#ppc-f-each") as HTMLInputElement).value = "$0.50";

    const form = el.querySelector("form") as HTMLFormElement;
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

    const record = onConfirm.mock.calls[0]?.[0];
    // RED if the gate silently used the suggested 4210 instead of the edit.
    expect(record.orderTotalCents).toBe(100);
  });
});
