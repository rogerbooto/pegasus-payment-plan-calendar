/**
 * @vitest-environment jsdom
 *
 * overlay-form-layout-spec.md
 * (docs/design/bnpl-watcher/overlay-form-layout-spec.md) §7.4 items 7-10 --
 * the DOM-level structural guarantees the layout rework depends on: field
 * anatomy (§2.2/5.1), the three-row regrouping with tab order unchanged
 * (§2.3/5.2), the lead/sub suppression (§5.3), and the missing-field flag
 * staying inside the copy-compliance scan surface (§5.4).
 *
 * A NEW file, never an edit to the pinned
 * tests/unit/overlay/confirmation-sheet.test.ts (§7.1 requires that file to
 * stay unmodified) or to tests/static/copy-compliance.test.ts (§11 step 6
 * requires it to pass unmodified).
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

const CONTROL_IDS = ["ppc-f-total", "ppc-f-count", "ppc-f-cadence", "ppc-f-each", "ppc-f-first", "ppc-f-name"] as const;

describe("§7.4.7 — field anatomy", () => {
  it("every .field contains exactly one .field__head, whose first element child is the <label>", () => {
    const el = container();
    renderConfirmationSheet(el, { candidate: candidate(), onConfirm: vi.fn(), onCancel: vi.fn() });

    const fields = [...el.querySelectorAll(".field")];
    expect(fields.length).toBeGreaterThan(0);
    for (const field of fields) {
      const heads = field.querySelectorAll(":scope > .field__head");
      expect(heads.length, `${field.querySelector("label")?.textContent} should have exactly one .field__head`).toBe(1);
      const head = heads[0] as HTMLElement;
      expect(head.firstElementChild?.tagName).toBe("LABEL");
    }
  });

  it("on a PARTIAL prefill, each .field--missing carries a .field__flag reading 'Not found', aria-hidden, and non-missing fields carry none", () => {
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

    const missingFields = [...el.querySelectorAll(".field--missing")];
    expect(missingFields.length).toBeGreaterThan(0);
    for (const field of missingFields) {
      const flag = field.querySelector(".field__flag");
      expect(flag).not.toBeNull();
      expect(flag?.textContent).toBe(copy.FIELD_FLAG_MISSING);
      expect(flag?.getAttribute("aria-hidden")).toBe("true");
    }

    const nonMissingFields = [...el.querySelectorAll(".field")].filter((f) => !f.className.includes("field--missing"));
    expect(nonMissingFields.length).toBeGreaterThan(0);
    for (const field of nonMissingFields) {
      expect(field.querySelector(".field__flag")).toBeNull();
    }
  });

  it(".field__flag is a sibling of <label>, never a descendant (accessible-name guard)", () => {
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

    const flags = [...el.querySelectorAll(".field__flag")];
    expect(flags.length).toBeGreaterThan(0);
    for (const flag of flags) {
      expect(flag.closest("label")).toBeNull();
      const label = flag.parentElement?.querySelector("label");
      expect(label).not.toBeNull();
      expect(label?.contains(flag)).toBe(false);
    }
  });

  it("every input/select's aria-describedby resolves to an element that exists and has non-empty text", () => {
    const el = container();
    renderConfirmationSheet(el, { candidate: candidate(), onConfirm: vi.fn(), onCancel: vi.fn() });

    const controls = [...el.querySelectorAll("input[aria-describedby], select[aria-describedby]")];
    expect(controls.length).toBe(6);
    for (const control of controls) {
      const describedBy = control.getAttribute("aria-describedby")!;
      const hint = el.querySelector(`#${describedBy}`);
      expect(hint, `#${describedBy} should exist`).not.toBeNull();
      expect(hint?.textContent?.length).toBeGreaterThan(0);
    }
  });

  it("the order total / count / cadence / each hints carry sr-only; the first-payment hint does not", () => {
    const el = container();
    renderConfirmationSheet(el, { candidate: candidate(), onConfirm: vi.fn(), onCancel: vi.fn() });

    for (const id of ["ppc-f-total", "ppc-f-count", "ppc-f-cadence", "ppc-f-each"]) {
      const hint = el.querySelector(`#${id}-hint`);
      expect(hint?.className, `${id}-hint should be sr-only`).toContain("sr-only");
    }
    const firstHint = el.querySelector("#ppc-f-first-hint");
    expect(firstHint?.className).not.toContain("sr-only");
    expect(firstHint?.textContent).toBe(copy.FIELD_HINT_FIRST_PAYMENT);
  });
});

describe("§7.4.8 — three rows, original order (the tab-order guard)", () => {
  it("the form contains exactly two .grid2 elements and two full-width .field elements outside them (first payment + the name field)", () => {
    const el = container();
    renderConfirmationSheet(el, { candidate: candidate(), onConfirm: vi.fn(), onCancel: vi.fn() });

    const form = el.querySelector("form") as HTMLFormElement;
    const grids = form.querySelectorAll(":scope > .form__fields > .grid2");
    expect(grids.length).toBe(2);

    const fieldsRegion = form.querySelector(".form__fields") as HTMLElement;
    const topLevelFields = [...fieldsRegion.children].filter((c) => c.classList.contains("field"));
    expect(topLevelFields.length).toBe(2);
  });

  it("the id's of the six controls appear in document order exactly total, count, cadence, each, first, name", () => {
    const el = container();
    renderConfirmationSheet(el, { candidate: candidate(), onConfirm: vi.fn(), onCancel: vi.fn() });

    const controls = [...el.querySelectorAll("input[id^='ppc-f-'], select[id^='ppc-f-']")];
    const ids = controls.map((c) => c.id);
    expect(ids).toEqual([...CONTROL_IDS]);
  });
});

describe("§7.4.9 — the sub is suppressed only when a lead is present", () => {
  it("with a PARTIAL prefill: .form__lead exists and .form__sub is absent", () => {
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

    expect(el.querySelector(".form__lead")).not.toBeNull();
    expect(el.querySelector(".form__sub")).toBeNull();
  });

  it("with no prefill: .form__sub exists and .form__lead is absent", () => {
    const el = container();
    renderManualEntrySheet(el, { onConfirm: vi.fn(), onCancel: vi.fn() });

    expect(el.querySelector(".form__sub")).not.toBeNull();
    expect(el.querySelector(".form__lead")).toBeNull();
  });
});

describe("§7.4.10 — FIELD_FLAG_MISSING is a real text node, reachable by a text-node scan", () => {
  it("a rendered missing field's .field__flag textContent is exactly FIELD_FLAG_MISSING, so a plain TreeWalker text-node collection (as the copy-compliance corpus performs) captures it regardless of aria-hidden", () => {
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

    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const texts: string[] = [];
    let node: Node | null = walker.nextNode();
    while (node) {
      const value = node.textContent ?? "";
      if (value.trim().length > 0) texts.push(value);
      node = walker.nextNode();
    }
    expect(texts).toContain(copy.FIELD_FLAG_MISSING);
  });
});
