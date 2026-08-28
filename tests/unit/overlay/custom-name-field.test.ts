/**
 * @vitest-environment jsdom
 *
 * The "What it was" name field on all three sheets (add-from-candidate,
 * manual add, edit) and the provenance rule it must never disturb. A NEW
 * file — tests/unit/overlay/confirmation-sheet.test.ts is not edited by
 * this change.
 *
 * Vacuity check, stated for review: every behavioural test here drives the
 * REAL rendered form (type into #ppc-f-name, dispatch submit) and asserts
 * on the record handed to onConfirm/onSave — never on a constant or a
 * re-implementation of the trimming/summary logic. Each was verified RED
 * by reverting the matching src change (see the change's own sabotage
 * notes) before being trusted.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  renderConfirmationSheet,
  renderEditPlanSheet,
  renderManualEntrySheet,
} from "../../../src/overlay/ConfirmationSheet";
import * as copy from "../../../src/overlay/copy";
import { PLAN_CUSTOM_NAME_MAX_LENGTH } from "../../../src/shared/constants";
import { validatePlanRecord } from "../../../src/storage/ledger";
import type { PaymentPlanRecord, ScheduleCandidate } from "../../../src/shared/types";
import { assertCents } from "../../../src/shared/money";

beforeEach(() => {
  document.body.replaceChildren();
});

function container(): HTMLDivElement {
  const div = document.createElement("div");
  document.body.appendChild(div);
  return div;
}

function candidate(): ScheduleCandidate {
  return {
    orderTotalCents: assertCents(15000, "total"),
    installmentCount: 4,
    cadence: "BIWEEKLY",
    perInstallmentCents: assertCents(3750, "each"),
    currency: "CAD",
    confidence: { hardGatesPassed: true, softScore: 6, signals: [] },
  };
}

function storedPlan(overrides: Partial<PaymentPlanRecord> = {}): PaymentPlanRecord {
  return {
    id: "a1b2c3",
    createdAt: "2026-06-01",
    source: "checkout_confirmed",
    currency: "CAD",
    orderTotalCents: assertCents(15000, "total"),
    installmentCount: 4,
    cadence: "BIWEEKLY",
    perInstallmentCents: assertCents(3750, "each"),
    firstPaymentDate: "2026-08-27",
    customName: "",
    ...overrides,
  };
}

function nameInput(el: HTMLElement): HTMLInputElement {
  return el.querySelector("#ppc-f-name") as HTMLInputElement;
}

function submit(el: HTMLElement): void {
  (el.querySelector("form") as HTMLFormElement).dispatchEvent(
    new Event("submit", { bubbles: true, cancelable: true }),);
}

function fillManualNumbers(el: HTMLElement): void {
  (el.querySelector("#ppc-f-total") as HTMLInputElement).value = "$60.00";
  (el.querySelector("#ppc-f-count") as HTMLInputElement).value = "4";
  (el.querySelector("#ppc-f-cadence") as HTMLSelectElement).value = "MONTHLY";
  (el.querySelector("#ppc-f-each") as HTMLInputElement).value = "$15.00";
}

describe("the name field's own anatomy — identical on all three sheets", () => {
  it("exists on every sheet: optional (no required attr), length-capped, labelled FIELD_LABEL_NAME, hinted FIELD_HINT_NAME even under the edit form's hintOverride", () => {
    const sheets: readonly [string, (el: HTMLElement) => void][] = [
      ["confirmation", (el) => renderConfirmationSheet(el, { candidate: candidate(), onConfirm: vi.fn(), onCancel: vi.fn() })],
      ["manual", (el) => renderManualEntrySheet(el, { onConfirm: vi.fn(), onCancel: vi.fn() })],
      ["edit", (el) => renderEditPlanSheet(el, { plan: storedPlan(), onSave: vi.fn(), onCancel: vi.fn() })],
    ];
    for (const [label, render] of sheets) {
      document.body.replaceChildren();
      const el = container();
      render(el);
      const input = nameInput(el);
      expect(input, `${label}: #ppc-f-name should exist`).not.toBeNull();
      expect(input.hasAttribute("required"), `${label}: never required`).toBe(false);
      expect(input.getAttribute("maxlength")).toBe(String(PLAN_CUSTOM_NAME_MAX_LENGTH));
      const field = input.closest(".field");
      expect(field?.querySelector("label")?.textContent).toBe(copy.FIELD_LABEL_NAME);
      // Never the page-claiming hints, and never the edit form's
      // "this is what you saved" override: always its own hint.
      expect(el.querySelector("#ppc-f-name-hint")?.textContent).toBe(copy.FIELD_HINT_NAME);
      expect(field?.classList.contains("field--missing"), `${label}: never marked missing`).toBe(false);
    }
  });

  it("starts blank on both ADD sheets even when the surrounding page is full of product-looking text", () => {
    // The page is deliberately loaded with the two things a future
    // "helpful suggested name" would reach for first: the document title
    // and visible product text. Without this setup the assertions below
    // pass vacuously -- jsdom's title is "" and its body is bare, so a
    // `nameInitial: doc.title` regression would go undetected. The
    // founder has twice asked for a page-derived name (the merchant, then
    // the product), so this is the most plausible future violation of the
    // one property that makes this field acceptable at all.
    function plantPageText(): void {
      document.title = "Gateway Chromebook Laptop 14 inch -- Birchwood Supply Co.";
      const productHeading = document.createElement("h1");
      productHeading.textContent = "Gateway Chromebook Laptop 14 inch";
      document.body.appendChild(productHeading);
    }

    plantPageText();
    const el1 = container();
    renderConfirmationSheet(el1, { candidate: candidate(), onConfirm: vi.fn(), onCancel: vi.fn() });
    expect(nameInput(el1).value).toBe("");

    // Fresh body between renders: jsdom's ID-selector fast path can
    // resolve a scoped #id query against a same-id element in an EARLIER
    // root still attached to document.body (the exact quirk
    // copy-compliance.test.ts and confirmation-sheet.test.ts document).
    document.body.replaceChildren();
    plantPageText();
    const el2 = container();
    renderManualEntrySheet(el2, {
      prefill: { orderTotalCents: assertCents(19600, "t"), installmentCount: 4, confidence: { hardGatesPassed: false, softScore: 0, signals: [] } },
      onConfirm: vi.fn(),
      onCancel: vi.fn(),
    });
    expect(nameInput(el2).value).toBe("");

    // Liveness: the planted text really is reachable from the render
    // context, so the two assertions above are refusals rather than the
    // absence of anything to find.
    expect(document.title).not.toBe("");
    expect(document.body.textContent).toContain("Gateway Chromebook Laptop");
  });

  it("prefills the STORED name on the edit sheet", () => {
    const el = container();
    renderEditPlanSheet(el, { plan: storedPlan({ customName: "Laptop" }), onSave: vi.fn(), onCancel: vi.fn() });
    expect(nameInput(el).value).toBe("Laptop");
  });
});

describe("the typed name reaches the record — and only the typed name", () => {
  it("confirmation sheet: a typed name lands on the checkout_confirmed record, trimmed, and the record passes the storage validator", () => {
    const el = container();
    const onConfirm = vi.fn();
    renderConfirmationSheet(el, { candidate: candidate(), onConfirm, onCancel: vi.fn() });
    nameInput(el).value = "  Laptop  ";
    submit(el);

    const record = onConfirm.mock.calls[0]?.[0] as PaymentPlanRecord;
    expect(record.customName).toBe("Laptop");
    expect(record.source).toBe("checkout_confirmed");
    expect(() => validatePlanRecord(record)).not.toThrow();
  });

  it("confirmation sheet: left blank, the record carries '' and still validates — the field is genuinely optional", () => {
    const el = container();
    const onConfirm = vi.fn();
    renderConfirmationSheet(el, { candidate: candidate(), onConfirm, onCancel: vi.fn() });
    submit(el);

    const record = onConfirm.mock.calls[0]?.[0] as PaymentPlanRecord;
    expect(record.customName).toBe("");
    expect(() => validatePlanRecord(record)).not.toThrow();
  });

  it("manual sheet: a typed name lands on the manual record", () => {
    const el = container();
    const onConfirm = vi.fn();
    renderManualEntrySheet(el, { onConfirm, onCancel: vi.fn() });
    fillManualNumbers(el);
    nameInput(el).value = "Headphones";
    submit(el);

    const record = onConfirm.mock.calls[0]?.[0] as PaymentPlanRecord;
    expect(record.customName).toBe("Headphones");
    expect(record.source).toBe("manual");
    expect(() => validatePlanRecord(record)).not.toThrow();
  });

  it("submit normalizes what maxlength cannot: control characters become spaces and an over-long paste is capped, so the storage validator never rejects a plausible typed name", () => {
    const el = container();
    const onConfirm = vi.fn();
    renderManualEntrySheet(el, { onConfirm, onCancel: vi.fn() });
    fillManualNumbers(el);
    // jsdom does not enforce maxlength, which stands in for browsers that
    // fill values programmatically.
    nameInput(el).value = `  ${"x".repeat(PLAN_CUSTOM_NAME_MAX_LENGTH + 20)}\n`;
    submit(el);

    const record = onConfirm.mock.calls[0]?.[0] as PaymentPlanRecord;
    expect(record.customName).toBe("x".repeat(PLAN_CUSTOM_NAME_MAX_LENGTH));
    expect(() => validatePlanRecord(record)).not.toThrow();
  });
});

describe("provenance — renaming is a real change, but never a NUMBERS change", () => {
  it("a rename-only edit reports nameChanged: true with valuesChanged/datesChanged false, and the record KEEPS source: checkout_confirmed", () => {
    const el = container();
    const onSave = vi.fn();
    renderEditPlanSheet(el, { plan: storedPlan({ customName: "" }), onSave, onCancel: vi.fn() });
    nameInput(el).value = "Laptop";
    submit(el);

    const [updated, changed] = onSave.mock.calls[0] as [PaymentPlanRecord, Record<string, boolean>];
    expect(changed).toEqual({ valuesChanged: false, datesChanged: false, nameChanged: true });
    expect(updated.customName).toBe("Laptop");
    // The pin this whole feature's provenance ruling rests on: the name
    // never came from a checkout, so typing one says nothing about whether
    // the NUMBERS still match what the checkout showed.
    expect(updated.source).toBe("checkout_confirmed");
  });

  it("clearing a name is also nameChanged: true (a rename to ''), source still preserved", () => {
    const el = container();
    const onSave = vi.fn();
    renderEditPlanSheet(el, { plan: storedPlan({ customName: "Laptop" }), onSave, onCancel: vi.fn() });
    nameInput(el).value = "";
    submit(el);

    const [updated, changed] = onSave.mock.calls[0] as [PaymentPlanRecord, Record<string, boolean>];
    expect(changed).toEqual({ valuesChanged: false, datesChanged: false, nameChanged: true });
    expect(updated.customName).toBe("");
    expect(updated.source).toBe("checkout_confirmed");
  });

  it("a numbers change WITH a rename still flips source to manual — the name neither causes nor suppresses the §1.1 flip", () => {
    const el = container();
    const onSave = vi.fn();
    renderEditPlanSheet(el, { plan: storedPlan({ customName: "Laptop" }), onSave, onCancel: vi.fn() });
    const totalInput = el.querySelector("#ppc-f-total") as HTMLInputElement;
    totalInput.value = "$999.00";
    nameInput(el).value = "Gaming laptop";
    submit(el);

    const [updated, changed] = onSave.mock.calls[0] as [PaymentPlanRecord, Record<string, boolean>];
    expect(changed.valuesChanged).toBe(true);
    expect(changed.nameChanged).toBe(true);
    expect(updated.source).toBe("manual");
    expect(updated.customName).toBe("Gaming laptop");
  });

  it("an untouched edit form still reports all-false — the field's presence alone changes nothing", () => {
    const el = container();
    const onSave = vi.fn();
    renderEditPlanSheet(el, { plan: storedPlan({ customName: "Laptop" }), onSave, onCancel: vi.fn() });
    submit(el);

    expect(onSave.mock.calls[0]?.[1]).toEqual({ valuesChanged: false, datesChanged: false, nameChanged: false });
  });
});
