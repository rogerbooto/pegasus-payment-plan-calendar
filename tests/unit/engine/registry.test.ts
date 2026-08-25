/**
 * D6 §A.3 precedence rule: highest static specificity wins; ties break by
 * registry order; a throwing match() is equivalent to "no match". Tested
 * against the parameterized selectAdapterFrom() with fake adapters, so a
 * genuine tie-break scenario can be constructed (the real bundled adapters
 * never share a host, so a tie can't arise from real config alone).
 */
import { describe, expect, it } from "vitest";
import { ADAPTER_REGISTRY, selectAdapterFrom } from "../../../src/engine/registry";
import { fakeAdapter, fakePage } from "../../support/fake-adapter";

describe("selectAdapterFrom", () => {
  it("the highest-specificity matching adapter wins over a lower one", () => {
    const low = fakeAdapter({ id: "stripe-hosted", match: () => ({ matched: true, specificity: 10 }) });
    const high = fakeAdapter({ id: "shopify-checkout", match: () => ({ matched: true, specificity: 30 }) });
    const winner = selectAdapterFrom([low, high], fakePage());
    expect(winner).toBe(high);
  });

  it("a tie breaks by registry order (the earlier-registered adapter wins)", () => {
    const first = fakeAdapter({ id: "shopify-checkout", match: () => ({ matched: true, specificity: 20 }) });
    const second = fakeAdapter({ id: "whop", match: () => ({ matched: true, specificity: 20 }) });
    expect(selectAdapterFrom([first, second], fakePage())).toBe(first);
    expect(selectAdapterFrom([second, first], fakePage())).toBe(second);
  });

  it("a non-matching adapter never wins even with the highest specificity constant", () => {
    const nonMatching = fakeAdapter({ id: "shopify-checkout", match: () => ({ matched: false, specificity: 999 }) });
    const matching = fakeAdapter({ id: "whop", match: () => ({ matched: true, specificity: 1 }) });
    expect(selectAdapterFrom([nonMatching, matching], fakePage())).toBe(matching);
  });

  it("a throwing match() is equivalent to no match -- it never crashes selection and never wins", () => {
    const throwing = fakeAdapter({
      id: "shopify-checkout",
      match: () => {
        throw new Error("simulated adapter match() crash");
      },
    });
    const matching = fakeAdapter({ id: "whop", match: () => ({ matched: true, specificity: 1 }) });
    expect(() => selectAdapterFrom([throwing, matching], fakePage())).not.toThrow();
    expect(selectAdapterFrom([throwing, matching], fakePage())).toBe(matching);
  });

  it("no adapter matches at all => null (the caller falls back to the generic detector)", () => {
    const nonMatching = fakeAdapter({ id: "whop", match: () => ({ matched: false, specificity: 1 }) });
    expect(selectAdapterFrom([nonMatching], fakePage())).toBeNull();
  });

  it("the real bundled registry contains exactly the three launch adapters, Shopify first (highest specificity)", () => {
    expect(ADAPTER_REGISTRY.map((a) => a.id)).toEqual(["shopify-checkout", "stripe-hosted", "whop"]);
  });
});
