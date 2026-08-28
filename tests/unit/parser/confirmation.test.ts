/**
 * src/parser/confirmation.ts — confirmPlan()'s own runtime validation.
 * Confirmation can edit a number; it can never launder an invalid one
 * through, regardless of what the (untrusted, out-of-scope) UI layer
 * already checked.
 */
import { describe, expect, it } from "vitest";
import { buildConfirmedPlanRecord, confirmPlan, type ConfirmedPlanValues } from "../../../src/parser/confirmation";
import { assertCents } from "../../../src/shared/money";
import { MoneyError } from "../../../src/shared/errors";
import { validatePlanRecord } from "../../../src/storage/ledger";

const validValues: ConfirmedPlanValues = {
  orderTotalCents: assertCents(8996, "total"),
  installmentCount: 4,
  cadence: "BIWEEKLY",
  perInstallmentCents: assertCents(2249, "per"),
  currency: "CAD",
};

describe("confirmPlan — the T01 gate's runtime validation", () => {
  it("accepts a valid confirmation", () => {
    const confirmed = confirmPlan({ confirmed: true, values: validValues });
    expect(confirmed.orderTotalCents).toBe(8996);
    expect(confirmed.currency).toBe("CAD");
  });

  it("rejects a zero or negative confirmed amount — confirmation cannot launder an invalid number", () => {
    expect(() =>
      confirmPlan({ confirmed: true, values: { ...validValues, orderTotalCents: assertCents(0, "x") } }),).toThrow(MoneyError);
  });

  it("rejects an out-of-bounds installment count", () => {
    expect(() => confirmPlan({ confirmed: true, values: { ...validValues, installmentCount: 1 } })).toThrow(
      MoneyError,);
    expect(() => confirmPlan({ confirmed: true, values: { ...validValues, installmentCount: 25 } })).toThrow(
      MoneyError,);
  });

  it("rejects a non-integer installment count", () => {
    expect(() => confirmPlan({ confirmed: true, values: { ...validValues, installmentCount: 4.5 } })).toThrow(
      MoneyError,);
  });

  it("rejects an unknown cadence or currency even if the type checker was bypassed", () => {
    const badCadence = { ...validValues, cadence: "DAILY" } as unknown as ConfirmedPlanValues;
    const badCurrency = { ...validValues, currency: "EUR" } as unknown as ConfirmedPlanValues;
    expect(() => confirmPlan({ confirmed: true, values: badCadence })).toThrow(MoneyError);
    expect(() => confirmPlan({ confirmed: true, values: badCurrency })).toThrow(MoneyError);
  });
});

describe("buildConfirmedPlanRecord — the only sanctioned checkout_confirmed record builder", () => {
  it("builds a record that the storage layer's own validator accepts", () => {
    const confirmed = confirmPlan({ confirmed: true, values: validValues });
    const record = buildConfirmedPlanRecord(confirmed, {
      id: "a1b2c3",
      createdAt: "2026-08-24",
      firstPaymentDate: "2026-09-01",
      customName: "",
    });
    expect(record.source).toBe("checkout_confirmed");
    expect(() => validatePlanRecord(record)).not.toThrow();
  });
});
