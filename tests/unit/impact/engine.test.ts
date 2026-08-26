/**
 * src/impact/engine.ts — date derivation and the impact view. Dates are
 * UTC-anchored (timezone-free calendar arithmetic); monthly cadence clamps
 * to the target month's last day instead of rolling into the next month.
 */
import { describe, expect, it } from "vitest";
import { computeImpact, paymentDates } from "../../../src/impact/engine";
import { confirmPlan } from "../../../src/parser/confirmation";
import { assertCents } from "../../../src/shared/money";
import type { PaymentPlanRecord } from "../../../src/shared/types";

function plan(overrides: Partial<PaymentPlanRecord> = {}): PaymentPlanRecord {
  return {
    id: "p1",
    createdAt: "2026-01-01",
    source: "manual",
    currency: "CAD",
    orderTotalCents: assertCents(8996, "total"),
    installmentCount: 4,
    cadence: "BIWEEKLY",
    perInstallmentCents: assertCents(2249, "per"),
    firstPaymentDate: "2026-06-03",
    ...overrides,
  };
}

describe("paymentDates — cadence stepping", () => {
  it("WEEKLY steps 7 days at a time", () => {
    expect(paymentDates(plan({ cadence: "WEEKLY", firstPaymentDate: "2026-06-03", installmentCount: 4 }))).toEqual([
      "2026-06-03",
      "2026-06-10",
      "2026-06-17",
      "2026-06-24",
    ]);
  });

  it("BIWEEKLY steps 14 days at a time (the mockup's own example dates)", () => {
    expect(
      paymentDates(plan({ cadence: "BIWEEKLY", firstPaymentDate: "2026-06-03", installmentCount: 4 })),).toEqual(["2026-06-03", "2026-06-17", "2026-07-01", "2026-07-15"]);
  });

  it("MONTHLY steps one calendar month, same day-of-month, when the day exists in every target month", () => {
    expect(
      paymentDates(plan({ cadence: "MONTHLY", firstPaymentDate: "2026-01-15", installmentCount: 3 })),).toEqual(["2026-01-15", "2026-02-15", "2026-03-15"]);
  });

  it("MONTHLY clamps to the target month's last day instead of rolling over (Jan 31 -> Feb 28, not Mar 2/3)", () => {
    expect(
      paymentDates(plan({ cadence: "MONTHLY", firstPaymentDate: "2026-01-31", installmentCount: 3 })),).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
  });

  it("MONTHLY clamping is computed fresh from the first date each time, so it does not drift onto an ever-earlier day", () => {
    // A naive "add one month to the previous clamped date" implementation
    // would compute Jan31 -> Feb28 -> Mar28 (drifted). Each date here is
    // independently derived from Jan 31, so March is correctly the 31st.
    const dates = paymentDates(plan({ cadence: "MONTHLY", firstPaymentDate: "2026-01-31", installmentCount: 4 }));
    expect(dates[2]).toBe("2026-03-31");
    expect(dates[3]).toBe("2026-04-30"); // April has 30 days: clamped, not rolled to May
  });

  it("MONTHLY handles a leap-year February correctly", () => {
    expect(paymentDates(plan({ cadence: "MONTHLY", firstPaymentDate: "2028-01-29", installmentCount: 2 }))).toEqual([
      "2028-01-29",
      "2028-02-29",
    ]);
  });
});

describe("computeImpact — impact view composition", () => {
  const today = "2026-06-01";

  function confirmedFor(p: PaymentPlanRecord) {
    return confirmPlan({
      confirmed: true,
      values: {
        orderTotalCents: p.orderTotalCents,
        installmentCount: p.installmentCount,
        cadence: p.cadence,
        perInstallmentCents: p.perInstallmentCents,
        currency: p.currency,
      },
    });
  }

  it("planPayments carries one dated row per installment, at the per-installment amount", () => {
    const p = plan();
    const view = computeImpact(p, confirmedFor(p), [], today);
    expect(view.planPayments).toHaveLength(4);
    expect(view.planPayments.every((row) => row.amountCents === 2249)).toBe(true);
    expect(view.planPayments[0]?.date).toBe("2026-06-03");
  });

  it("same-day clusters only include EXISTING plans' payments that land on one of the new plan's dates", () => {
    const p = plan({ firstPaymentDate: "2026-06-03" }); // dates: Jun3, Jun17, Jul1, Jul15
    const existing = plan({
      id: "e1",
      firstPaymentDate: "2026-06-03",
      installmentCount: 1,
      perInstallmentCents: assertCents(3751, "e1-per"),
    });
    const other = plan({
      id: "e2",
      firstPaymentDate: "2026-06-03",
      installmentCount: 1,
      perInstallmentCents: assertCents(3749, "e2-per"),
    });
    const view = computeImpact(p, confirmedFor(p), [existing, other], today);
    expect(view.sameDayClusters).toHaveLength(1);
    expect(view.sameDayClusters[0]?.date).toBe("2026-06-03");
    expect(view.sameDayClusters[0]?.existingCount).toBe(2);
    expect(view.sameDayClusters[0]?.existingTotalCents).toBe(3751 + 3749);
  });

  it("same-day clusters are empty when no existing payment falls on any of the new plan's dates", () => {
    const p = plan({ firstPaymentDate: "2026-06-03" });
    const existing = plan({ id: "e1", firstPaymentDate: "2026-06-04", installmentCount: 1 });
    const view = computeImpact(p, confirmedFor(p), [existing], today);
    expect(view.sameDayClusters).toEqual([]);
  });

  it("next30Days totals only saved (existing) plans — the plan under consideration never counts toward the total", () => {
    const p = plan({ firstPaymentDate: "2026-06-05", installmentCount: 2 });
    const existing = plan({
      id: "e1",
      firstPaymentDate: "2026-06-10",
      installmentCount: 1,
      perInstallmentCents: assertCents(5000, "e1-per"),
    });
    const view = computeImpact(p, confirmedFor(p), [existing], today);
    expect(view.next30Days.totalCents).toBe(5000);
    expect(view.next30Days.days).toHaveLength(1);
    expect(view.next30Days.days[0]?.date).toBe("2026-06-10");
  });

  it("the 30-day window is inclusive of today and the 29 days after it", () => {
    const insideWindow = plan({ id: "in", firstPaymentDate: "2026-06-30", installmentCount: 1 }); // today + 29
    const outsideWindow = plan({ id: "out", firstPaymentDate: "2026-07-01", installmentCount: 1 }); // today + 30
    const consideration = plan({ firstPaymentDate: "2027-01-01", installmentCount: 2 }); // irrelevant date
    const view = computeImpact(consideration, confirmedFor(consideration), [insideWindow, outsideWindow], today);
    const dates = view.next30Days.days.map((d) => d.date);
    expect(dates).toContain("2026-06-30");
    expect(dates).not.toContain("2026-07-01");
  });

  it("planPaymentBeyondWindow names the earliest of the new plan's own payments past the 30-day window", () => {
    const p = plan({ cadence: "MONTHLY", firstPaymentDate: "2026-06-01", installmentCount: 2 });
    const view = computeImpact(p, confirmedFor(p), [], today);
    // 2026-06-01 is within the window; 2026-07-01 is beyond it.
    expect(view.next30Days.planPaymentBeyondWindow).toBe("2026-07-01");
  });

  it("planPaymentBeyondWindow is null when every payment of the plan under consideration falls inside the window", () => {
    const p = plan({ firstPaymentDate: "2026-06-01", installmentCount: 2 });
    const view = computeImpact(p, confirmedFor(p), [], today);
    expect(view.next30Days.planPaymentBeyondWindow).toBeNull();
  });

  it("all arithmetic stays in integer cents: same-day totals and 30-day totals are exact sums, never rounded", () => {
    const p = plan({ firstPaymentDate: "2026-06-03", installmentCount: 2 });
    const a = plan({ id: "a", firstPaymentDate: "2026-06-03", installmentCount: 1, perInstallmentCents: assertCents(101, "a") });
    const b = plan({ id: "b", firstPaymentDate: "2026-06-03", installmentCount: 1, perInstallmentCents: assertCents(202, "b") });
    const c = plan({ id: "c", firstPaymentDate: "2026-06-03", installmentCount: 1, perInstallmentCents: assertCents(303, "c") });
    const view = computeImpact(p, confirmedFor(p), [a, b, c], today);
    expect(view.sameDayClusters[0]?.existingTotalCents).toBe(101 + 202 + 303);
    expect(view.next30Days.totalCents).toBe(101 + 202 + 303);
  });
});
