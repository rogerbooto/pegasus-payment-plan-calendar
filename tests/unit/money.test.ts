import { describe, expect, it } from "vitest";
import {
  addCents,
  assertCents,
  assertPositiveCents,
  centsFromDigitStrings,
  multiplyCents,
} from "../../src/shared/money";
import { formatCents } from "../../src/shared/format";
import { MoneyError } from "../../src/shared/errors";

describe("the cents boundary", () => {
  it("accepts exact integers", () => {
    expect(assertCents(3750, "amount")).toBe(3750);
    expect(assertCents(0, "amount")).toBe(0);
  });

  it("throws loudly on floats — never coerces, never rounds", () => {
    expect(() => assertCents(12.34, "amount")).toThrow(MoneyError);
    expect(() => assertCents(37.5, "amount")).toThrow(MoneyError);
  });

  it("throws on strings, NaN, Infinity, null, undefined", () => {
    for (const bad of ["1234", NaN, Infinity, -Infinity, null, undefined, {}, []]) {
      expect(() => assertCents(bad, "amount")).toThrow(MoneyError);
    }
  });

  it("requires positive amounts where positive amounts are required", () => {
    expect(assertPositiveCents(1, "amount")).toBe(1);
    expect(() => assertPositiveCents(0, "amount")).toThrow(MoneyError);
    expect(() => assertPositiveCents(-100, "amount")).toThrow(MoneyError);
  });
});

describe("centsFromDigitStrings — integer arithmetic on the digit string", () => {
  it("constructs cents from whole + two fraction digits", () => {
    expect(centsFromDigitStrings("37", "50", "amount")).toBe(3750);
    expect(centsFromDigitStrings("0", "05", "amount")).toBe(5);
    expect(centsFromDigitStrings("1234", "", "amount")).toBe(123400);
  });

  it("rejects anything that is not pure digits in the expected shape", () => {
    expect(() => centsFromDigitStrings("37.5", "0", "amount")).toThrow(MoneyError);
    expect(() => centsFromDigitStrings("37", "5", "amount")).toThrow(MoneyError);
    expect(() => centsFromDigitStrings("37", "500", "amount")).toThrow(MoneyError);
    expect(() => centsFromDigitStrings("", "50", "amount")).toThrow(MoneyError);
    expect(() => centsFromDigitStrings("-37", "50", "amount")).toThrow(MoneyError);
    expect(() => centsFromDigitStrings("3x", "50", "amount")).toThrow(MoneyError);
  });
});

describe("cents arithmetic stays in integers", () => {
  it("multiplies and adds without leaving integer cents", () => {
    const per = assertCents(2249, "per");
    expect(multiplyCents(per, 4)).toBe(8996);
    expect(addCents(per, assertCents(1, "one"))).toBe(2250);
  });

  it("rejects non-integer multipliers", () => {
    expect(() => multiplyCents(assertCents(100, "a"), 1.5)).toThrow(MoneyError);
  });
});

describe("formatCents — the single sanctioned render path", () => {
  it("formats cents with two fraction digits and grouping", () => {
    expect(formatCents(assertCents(3750, "a"), "CAD")).toBe("$37.50");
    expect(formatCents(assertCents(5, "a"), "USD")).toBe("$0.05");
    expect(formatCents(assertCents(123456789, "a"), "CAD")).toBe("$1,234,567.89");
  });
});
