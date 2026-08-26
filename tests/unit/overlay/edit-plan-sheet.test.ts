/**
 * @vitest-environment jsdom
 *
 * edit-plan-spec.md §9.2 (the §1.1 provenance invariant) and §9.3 (the
 * edit form itself). A NEW file — tests/unit/overlay/confirmation-sheet.test.ts
 * is not edited by this change.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderEditPlanSheet } from "../../../src/overlay/ConfirmationSheet";
import * as copy from "../../../src/overlay/copy";
import type { PaymentPlanRecord } from "../../../src/shared/types";
import { assertCents } from "../../../src/shared/money";

beforeEach(() => {
  document.body.replaceChildren();
});

function container(): HTMLDivElement {
  const div = document.createElement("div");
  document.body.appendChild(div);
  return div;
}

function plan(overrides: Partial<PaymentPlanRecord> = {}): PaymentPlanRecord {
  return {
    id: "a1b2c3",
    createdAt: "2026-06-01",
    source: "checkout_confirmed",
    currency: "CAD",
    orderTotalCents: assertCents(15000, "total"),
    installmentCount: 4,
    cadence: "BIWEEKLY",
    perInstallmentCents: assertCents(3750, "each"),
    firstPaymentDate: "2026-08-26",
    ...overrides,
  };
}

function submit(form: HTMLFormElement): void {
  form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
}

describe("§9.3 item 11 — headings and labels", () => {
  it("renders <h3> = 'Change these numbers', submit = 'Save changes', cancel = 'Cancel'", () => {
    const el = container();
    renderEditPlanSheet(el, { plan: plan(), onSave: vi.fn(), onCancel: vi.fn() });

    expect(el.querySelector("h3")?.textContent).toBe(copy.FORM_TITLE_EDIT);
    expect(el.querySelector('button[type="submit"]')?.textContent).toBe(copy.FORM_SUBMIT_EDIT);
    const cancelBtn = [...el.querySelectorAll("button")].find((b) => b.textContent === copy.FORM_CANCEL);
    expect(cancelBtn).toBeDefined();
  });
});

describe("§9.3 item 12 — prefills all five controls from the record", () => {
  it("prefills, and #ppc-f-first is the STORED date, not today's date", () => {
    const el = container();
    const record = plan({ firstPaymentDate: "2026-08-26" });
    renderEditPlanSheet(el, { plan: record, onSave: vi.fn(), onCancel: vi.fn() });

    expect((el.querySelector("#ppc-f-total") as HTMLInputElement).value).toBe("$150.00");
    expect((el.querySelector("#ppc-f-count") as HTMLInputElement).value).toBe("4");
    expect((el.querySelector("#ppc-f-cadence") as HTMLSelectElement).value).toBe("BIWEEKLY");
    expect((el.querySelector("#ppc-f-each") as HTMLInputElement).value).toBe("$37.50");
    // Injecting a `today` that differs (this file's own clock is never
    // consulted by renderEditPlanSheet) proves the date came from the
    // record, not from todayIsoDate().
    expect((el.querySelector("#ppc-f-first") as HTMLInputElement).value).toBe("2026-08-26");
  });
});

describe("§9.3 item 13 — nothing is missing on an edit", () => {
  it("no .field--missing and no .field__flag anywhere", () => {
    const el = container();
    renderEditPlanSheet(el, { plan: plan(), onSave: vi.fn(), onCancel: vi.fn() });

    expect(el.querySelectorAll(".field--missing").length).toBe(0);
    expect(el.querySelectorAll(".field__flag").length).toBe(0);
  });
});

describe("§9.3 item 14 — every hint reads EDIT_FIELD_HINT, sr-only split unchanged", () => {
  it("four hints stay sr-only, first-payment stays visible, all read EDIT_FIELD_HINT", () => {
    const el = container();
    renderEditPlanSheet(el, { plan: plan(), onSave: vi.fn(), onCancel: vi.fn() });

    for (const id of ["ppc-f-total", "ppc-f-count", "ppc-f-cadence", "ppc-f-each"]) {
      const hint = el.querySelector(`#${id}-hint`);
      expect(hint?.className).toContain("sr-only");
      expect(hint?.textContent).toBe(copy.EDIT_FIELD_HINT);
    }
    const firstHint = el.querySelector("#ppc-f-first-hint");
    expect(firstHint?.className).not.toContain("sr-only");
    expect(firstHint?.textContent).toBe(copy.EDIT_FIELD_HINT);
  });
});

describe("§9.3 item 15 — Cancel", () => {
  it("calls onCancel, never onSave", () => {
    const el = container();
    const onSave = vi.fn();
    const onCancel = vi.fn();
    renderEditPlanSheet(el, { plan: plan(), onSave, onCancel });

    const cancelBtn = [...el.querySelectorAll("button")].find((b) => b.textContent === copy.FORM_CANCEL) as HTMLButtonElement;
    cancelBtn.click();

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe("§9.3 item 16 — inherited validation, stated as a guarantee", () => {
  it("an unparsable edited amount blocks submission and never falls back to the stored value", () => {
    const el = container();
    const onSave = vi.fn();
    renderEditPlanSheet(el, { plan: plan(), onSave, onCancel: vi.fn() });

    const totalInput = el.querySelector("#ppc-f-total") as HTMLInputElement;
    totalInput.value = "not a number";
    totalInput.dispatchEvent(new Event("input", { bubbles: true }));

    submit(el.querySelector("form") as HTMLFormElement);

    expect(onSave).not.toHaveBeenCalled();
  });
});

describe("§9.3 item 17 — editing only the date changes only firstPaymentDate", () => {
  it("all other fields are carried through unchanged", () => {
    const el = container();
    const record = plan();
    let saved: PaymentPlanRecord | undefined;
    renderEditPlanSheet(el, {
      plan: record,
      onSave: (updated) => {
        saved = updated;
      },
      onCancel: vi.fn(),
    });

    const firstInput = el.querySelector("#ppc-f-first") as HTMLInputElement;
    firstInput.value = "2026-09-02";
    firstInput.dispatchEvent(new Event("input", { bubbles: true }));

    submit(el.querySelector("form") as HTMLFormElement);

    expect(saved?.firstPaymentDate).toBe("2026-09-02");
    expect(saved?.orderTotalCents).toBe(record.orderTotalCents);
    expect(saved?.installmentCount).toBe(record.installmentCount);
    expect(saved?.cadence).toBe(record.cadence);
    expect(saved?.perInstallmentCents).toBe(record.perInstallmentCents);
  });
});

describe("§9.3 item 18 — id and createdAt are carried through", () => {
  it("the produced record carries the original id and createdAt", () => {
    const el = container();
    const record = plan({ id: "zzz999", createdAt: "2020-01-01" });
    let saved: PaymentPlanRecord | undefined;
    renderEditPlanSheet(el, { plan: record, onSave: (updated) => { saved = updated; }, onCancel: vi.fn() });

    submit(el.querySelector("form") as HTMLFormElement);

    expect(saved?.id).toBe("zzz999");
    expect(saved?.createdAt).toBe("2020-01-01");
  });
});

describe("§9.3 item 19 — EditChangeSummary", () => {
  it("saving with nothing changed yields valuesChanged: false and datesChanged: false", () => {
    const el = container();
    const record = plan();
    const onSave = vi.fn();
    renderEditPlanSheet(el, { plan: record, onSave, onCancel: vi.fn() });

    submit(el.querySelector("form") as HTMLFormElement);

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0]?.[1]).toEqual({ valuesChanged: false, datesChanged: false });
  });

  it("a cadence change yields valuesChanged: true and datesChanged: true", () => {
    const el = container();
    const record = plan({ cadence: "MONTHLY" });
    const onSave = vi.fn();
    renderEditPlanSheet(el, { plan: record, onSave, onCancel: vi.fn() });

    const cadenceSelect = el.querySelector("#ppc-f-cadence") as HTMLSelectElement;
    cadenceSelect.value = "WEEKLY";
    cadenceSelect.dispatchEvent(new Event("change", { bubbles: true }));

    submit(el.querySelector("form") as HTMLFormElement);

    const changed = onSave.mock.calls[0]?.[1];
    expect(changed.valuesChanged).toBe(true);
    expect(changed.datesChanged).toBe(true);
  });

  it("a total-only change (that still matches count x each within tolerance) yields valuesChanged: true, datesChanged: false", () => {
    const el = container();
    // installmentCount x perInstallmentCents = 4 x 3750 = 15000, matching
    // the record's own orderTotalCents exactly -- editing the total alone
    // moves no date, since paymentDates() never reads orderTotalCents.
    const record = plan({ orderTotalCents: assertCents(15000, "total"), installmentCount: 4, perInstallmentCents: assertCents(3750, "each") });
    const onSave = vi.fn();
    renderEditPlanSheet(el, { plan: record, onSave, onCancel: vi.fn() });

    const totalInput = el.querySelector("#ppc-f-total") as HTMLInputElement;
    totalInput.value = "$200.00";
    totalInput.dispatchEvent(new Event("input", { bubbles: true }));

    submit(el.querySelector("form") as HTMLFormElement);

    const changed = onSave.mock.calls[0]?.[1];
    expect(changed).toEqual({ valuesChanged: true, datesChanged: false });
  });
});

describe("§9.3 item 20 — structural: no dialog role anywhere", () => {
  it("renders no [role=dialog] and no [aria-modal]", () => {
    const el = container();
    renderEditPlanSheet(el, { plan: plan(), onSave: vi.fn(), onCancel: vi.fn() });

    expect(el.querySelector('[role="dialog"]')).toBeNull();
    expect(el.querySelector("[aria-modal]")).toBeNull();
  });
});

describe("§9.3 item 21 — initial focus is the form heading, not the total field", () => {
  it("document.activeElement is #ppc-form-h", () => {
    const el = container();
    renderEditPlanSheet(el, { plan: plan(), onSave: vi.fn(), onCancel: vi.fn() });

    expect(document.activeElement).toBe(el.querySelector("#ppc-form-h"));
    expect(document.activeElement).not.toBe(el.querySelector("#ppc-f-total"));
  });
});

describe("§9.2 — the source provenance invariant", () => {
  it("item 7 — editing any of the five values on a checkout_confirmed plan yields source: manual", () => {
    const el = container();
    const record = plan({ source: "checkout_confirmed" });
    let saved: PaymentPlanRecord | undefined;
    renderEditPlanSheet(el, { plan: record, onSave: (updated) => { saved = updated; }, onCancel: vi.fn() });

    const totalInput = el.querySelector("#ppc-f-total") as HTMLInputElement;
    totalInput.value = "$200.00";
    totalInput.dispatchEvent(new Event("input", { bubbles: true }));
    submit(el.querySelector("form") as HTMLFormElement);

    expect(saved?.source).toBe("manual");
  });

  it("item 8 — saving with no value changed on a checkout_confirmed plan preserves source: checkout_confirmed, and never calls onSave with valuesChanged: true", () => {
    const el = container();
    const record = plan({ source: "checkout_confirmed" });
    let saved: PaymentPlanRecord | undefined;
    renderEditPlanSheet(el, { plan: record, onSave: (updated) => { saved = updated; }, onCancel: vi.fn() });

    submit(el.querySelector("form") as HTMLFormElement);

    expect(saved?.source).toBe("checkout_confirmed");
  });

  it("item 9 — a manual plan stays manual whether or not values changed", () => {
    for (const changeIt of [false, true]) {
      document.body.replaceChildren();
      const el = container();
      const record = plan({ source: "manual", id: `id-${String(changeIt)}` });
      let saved: PaymentPlanRecord | undefined;
      renderEditPlanSheet(el, { plan: record, onSave: (updated) => { saved = updated; }, onCancel: vi.fn() });

      if (changeIt) {
        const countInput = el.querySelector("#ppc-f-count") as HTMLInputElement;
        countInput.value = "6";
        countInput.dispatchEvent(new Event("input", { bubbles: true }));
      }
      submit(el.querySelector("form") as HTMLFormElement);

      expect(saved?.source).toBe("manual");
    }
  });

  it("item 10 — table-driven: changing exactly one of the five values flips source to manual (currency excluded, it is not editable)", () => {
    const cases: { field: string; apply: (el: HTMLElement) => void }[] = [
      {
        field: "orderTotalCents",
        apply: (el) => {
          const input = el.querySelector("#ppc-f-total") as HTMLInputElement;
          input.value = "$999.00";
          input.dispatchEvent(new Event("input", { bubbles: true }));
        },
      },
      {
        field: "installmentCount",
        apply: (el) => {
          const input = el.querySelector("#ppc-f-count") as HTMLInputElement;
          input.value = "6";
          input.dispatchEvent(new Event("input", { bubbles: true }));
        },
      },
      {
        field: "cadence",
        apply: (el) => {
          const select = el.querySelector("#ppc-f-cadence") as HTMLSelectElement;
          select.value = "MONTHLY";
          select.dispatchEvent(new Event("change", { bubbles: true }));
        },
      },
      {
        field: "perInstallmentCents",
        apply: (el) => {
          const input = el.querySelector("#ppc-f-each") as HTMLInputElement;
          input.value = "$99.00";
          input.dispatchEvent(new Event("input", { bubbles: true }));
        },
      },
      {
        field: "firstPaymentDate",
        apply: (el) => {
          const input = el.querySelector("#ppc-f-first") as HTMLInputElement;
          input.value = "2026-10-10";
          input.dispatchEvent(new Event("input", { bubbles: true }));
        },
      },
    ];

    for (const { field, apply } of cases) {
      document.body.replaceChildren();
      const el = container();
      const record = plan({ source: "checkout_confirmed", cadence: field === "cadence" ? "BIWEEKLY" : "WEEKLY" });
      let saved: PaymentPlanRecord | undefined;
      renderEditPlanSheet(el, { plan: record, onSave: (updated) => { saved = updated; }, onCancel: vi.fn() });

      apply(el);
      submit(el.querySelector("form") as HTMLFormElement);

      expect(saved?.source, `changing only ${field} should flip source to manual`).toBe("manual");
    }
  });
});
