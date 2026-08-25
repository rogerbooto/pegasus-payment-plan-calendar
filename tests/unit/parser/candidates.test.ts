// @vitest-environment jsdom
/**
 * M11-T06 — hidden/offscreen/aria-hidden/struck-through decoy nodes never
 * win; two visible, unequal candidates degrade rather than pick one. Both
 * branches (agreeing decoy: harmless; disagreeing decoy: must resolve to
 * the visible node only) are tested, plus an explicit inversion check that
 * the parser has no first/largest-wins bias.
 */
import { describe, expect, it } from "vitest";
import { isVisibleCandidate, selectSingleCandidate } from "../../../src/parser/candidates";
import { parseMoneyToCents } from "../../../src/parser/money";
import { mountFixture } from "../../support/dom-fixture";

function allDivsOrDels(doc: Document): Element[] {
  return [...doc.querySelectorAll("div, del, span")];
}

describe("M11-T06 test_decoy_and_disagreeing_totals_degrade", () => {
  it("a hidden (aria-hidden) decoy never wins over the real, visible total", () => {
    const doc = mountFixture("hidden-decoy", "visible-price-with-hidden-lower-decoy");
    const decoy = doc.getElementById("decoy");
    const real = doc.getElementById("real");
    if (!decoy || !real) throw new Error("fixture drift: expected #decoy and #real nodes");

    expect(isVisibleCandidate(decoy)).toBe(false);
    expect(isVisibleCandidate(real)).toBe(true);

    const selected = selectSingleCandidate([decoy, real]);
    expect(selected).toBe(real);
    expect(selected?.textContent?.trim()).toBe("CAD 37.50");
  });

  it("a display:none decoy is filtered before selection", () => {
    const doc = mountFixture("hidden-decoy", "display-none-decoy");
    const decoy = doc.getElementById("decoy");
    const real = doc.getElementById("real");
    if (!decoy || !real) throw new Error("fixture drift");
    const selected = selectSingleCandidate([decoy, real]);
    expect(selected).toBe(real);
  });

  it("an offscreen-positioned decoy is filtered before selection", () => {
    const doc = mountFixture("hidden-decoy", "offscreen-decoy");
    const decoy = doc.getElementById("decoy");
    const real = doc.getElementById("real");
    if (!decoy || !real) throw new Error("fixture drift");
    expect(isVisibleCandidate(decoy)).toBe(false);
    const selected = selectSingleCandidate([decoy, real]);
    expect(selected).toBe(real);
  });

  it("two VISIBLE, unequal candidates degrade — ambiguity is refused, never resolved by picking one", () => {
    const doc = mountFixture("hidden-decoy", "two-visible-disagreeing-totals");
    const els = allDivsOrDels(doc);
    expect(els).toHaveLength(2);
    expect(selectSingleCandidate(els)).toBeNull();
  });

  it("two visible, EQUAL candidates collapse to one — an agreeing duplicate is harmless", () => {
    const doc = mountFixture("hidden-decoy", "two-visible-agreeing-totals");
    const els = allDivsOrDels(doc);
    expect(els).toHaveLength(2);
    const selected = selectSingleCandidate(els);
    expect(selected).not.toBeNull();
    expect(selected?.textContent?.trim()).toBe("CAD 37.50");
  });

  it("inversion check: the parser has no first-in-DOM-wins or numerically-larger-wins bias", () => {
    const doc = mountFixture("hidden-decoy", "two-visible-disagreeing-totals");
    const [first, second] = allDivsOrDels(doc);
    if (!first || !second) throw new Error("fixture drift");
    // Reversing DOM order must not change the outcome: still null either way.
    expect(selectSingleCandidate([first, second])).toBeNull();
    expect(selectSingleCandidate([second, first])).toBeNull();
  });

  it("an empty candidate list (nothing survives) also resolves to null, never a default", () => {
    expect(selectSingleCandidate([])).toBeNull();
  });
});

describe("M11-T06 strikethrough-sale sub-case", () => {
  it("a <del>-wrapped original price is filtered; the sale price wins", () => {
    const doc = mountFixture("strikethrough-sale", "struck-original-vs-sale-price");
    const was = doc.getElementById("was");
    const now = doc.getElementById("now");
    if (!was || !now) throw new Error("fixture drift");
    expect(isVisibleCandidate(was)).toBe(false);
    expect(isVisibleCandidate(now)).toBe(true);
    expect(selectSingleCandidate([was, now])).toBe(now);
  });

  it("a CSS text-decoration-line: line-through (no <del>) is filtered the same way", () => {
    const doc = mountFixture("strikethrough-sale", "text-decoration-line-through");
    const was = doc.getElementById("was");
    const now = doc.getElementById("now");
    if (!was || !now) throw new Error("fixture drift");
    expect(isVisibleCandidate(was)).toBe(false);
    expect(selectSingleCandidate([was, now])).toBe(now);
  });
});

describe("M11-T06/T07 per-month-vs-total binding sub-case", () => {
  it("the money parser never truncates a cadence-suffixed string into a bare amount", () => {
    const doc = mountFixture("per-month-vs-total", "free-floating-per-month-not-bound-to-count");
    const perMonth = doc.getElementById("permonth");
    if (!perMonth) throw new Error("fixture drift");
    const result = parseMoneyToCents(perMonth.textContent ?? "");
    expect(result.kind).toBe("rejected");
    if (result.kind === "rejected") expect(result.reason).toBe("invalid_character");
  });
});
