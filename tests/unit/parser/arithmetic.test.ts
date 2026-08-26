// @vitest-environment jsdom
/**
 * T07 test_instalment_total_crosscheck_both_branches — both the
 * within-tolerance branch (must NOT flag) and the over-tolerance branch
 * (must flag) are tested, per the design spec gate 3's exact tolerance formula, so
 * a widened OR narrowed tolerance is independently visible in review.
 */
import { describe, expect, it } from "vitest";
import { arithmeticConsistent } from "../../../src/parser/money";
import { assertCents } from "../../../src/shared/money";
import { loadFixtureSidecar } from "../../support/dom-fixture";

interface TaxShippingSidecar {
  readonly installmentCount: number;
  readonly perInstallmentCents: number;
  readonly orderTotalCents: number;
  readonly expectedConsistent: boolean;
}

describe("T07 test_instalment_total_crosscheck_both_branches", () => {
  it("within-tolerance: first-installment-absorbs-rounding never flags", () => {
    const s = loadFixtureSidecar<TaxShippingSidecar>("tax-shipping-delta", "within-tolerance-rounding");
    expect(s.expectedConsistent).toBe(true);
    const result = arithmeticConsistent(
      s.installmentCount,
      assertCents(s.perInstallmentCents, "per"),
      assertCents(s.orderTotalCents, "total"),);
    expect(result).toBe(true);
  });

  it("over-tolerance: a tax/shipping delta beyond rounding is flagged, never silently reconciled", () => {
    const s = loadFixtureSidecar<TaxShippingSidecar>("tax-shipping-delta", "over-tolerance-tax-and-shipping");
    expect(s.expectedConsistent).toBe(false);
    const result = arithmeticConsistent(
      s.installmentCount,
      assertCents(s.perInstallmentCents, "per"),
      assertCents(s.orderTotalCents, "total"),);
    expect(result).toBe(false);
  });

  it("the tolerance is exactly `count` cents — one cent over the line flips the result", () => {
    // 4 x 3750 = 15000; tolerance for count=4 is 4 cents.
    const per = assertCents(3750, "per");
    expect(arithmeticConsistent(4, per, assertCents(15004, "total"))).toBe(true); // delta 4, at the edge
    expect(arithmeticConsistent(4, per, assertCents(15005, "total"))).toBe(false); // delta 5, over
  });

  it("D6's own worked example: 4 x $37.50 vs an order total of $163.94 is flagged", () => {
    const per = assertCents(3750, "per");
    const total = assertCents(16394, "total");
    expect(arithmeticConsistent(4, per, total)).toBe(false);
  });
});
