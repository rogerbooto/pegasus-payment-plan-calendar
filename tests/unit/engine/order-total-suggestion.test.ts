// @vitest-environment jsdom
/**
 * The order-total-suggestion feature's own engine-side read
 * (src/engine/order-total-suggestion.ts): a ONE-SHOT, order-total-ONLY
 * extraction reusing the frozen anchoring/guardrail machinery
 * (locateByCssOrLabel's exact-label match + its one permitted
 * trailing-colon loosening, selectSingleCandidate's disagreement rule, the
 * strict money grammar). Every fixture here is sabotage-verified: revert
 * the fix under test, confirm RED, restore, confirm GREEN (see the report
 * for the exact commands run).
 */
import { describe, expect, it } from "vitest";
import { readOrderTotalSuggestion } from "../../../src/engine/order-total-suggestion";
import { extractionCore } from "../../../src/engine/extraction-core";
import { mountFixture } from "../../support/dom-fixture";
import { pageProbeFor } from "../../support/page-probe";

const HOST = "www.amazon.ca";

describe("readOrderTotalSuggestion — C8(a): anchors the exactly-labelled total, never a tax/shipping/fee row", () => {
  it("returns the Order Total row's value from a full Items/Shipping/GST/PST summary block", () => {
    const doc = mountFixture("order-total-suggestion", "amazon-order-summary-trailing-colon");
    const page = pageProbeFor(doc, HOST, "/gp/buy/spc/handlers/display.html");
    const suggestion = readOrderTotalSuggestion(page, extractionCore);
    expect(suggestion).toEqual({ cents: 8996, currency: "CAD" });
  });
});

describe("readOrderTotalSuggestion — C8(b): two disagreeing total rows -> blank", () => {
  it("returns null when two visible 'Order Total:' rows carry different values", () => {
    const doc = mountFixture("order-total-suggestion", "disagreeing-order-total-rows");
    const page = pageProbeFor(doc, HOST, "/checkout/pay");
    expect(readOrderTotalSuggestion(page, extractionCore)).toBeNull();
  });
});

describe("readOrderTotalSuggestion — C8(c): a loose-path non-checkout page never yields a plausible-wrong value", () => {
  it("returns null on an order-history page listing two different past orders' totals (blank, never a cherry-picked one)", () => {
    const doc = mountFixture("order-total-suggestion", "order-history-loose-path-multiple-orders");
    // /gp/... is one of GENERIC_CHECKOUT_PATH_PATTERNS' loose substrings,
    // but this function never consults page.path at all -- it is
    // deliberately blind to whether the page "looks like" a checkout
    // (that epistemic claim is NOT_CONFIRMED's job, per C5). The disagreement
    // guard is what produces blank here, the same as C8(b).
    const page = pageProbeFor(doc, HOST, "/gp/css/order-history");
    expect(readOrderTotalSuggestion(page, extractionCore)).toBeNull();
  });
});

describe("readOrderTotalSuggestion — C8(d): trailing-colon labels, EN and FR", () => {
  it("EN: 'Order total:' (trailing colon, no space) still matches", () => {
    const doc = mountFixture("order-total-suggestion", "trailing-colon-en");
    const page = pageProbeFor(doc, HOST, "/checkout/pay");
    expect(readOrderTotalSuggestion(page, extractionCore)).toEqual({ cents: 4210, currency: "CAD" });
  });

  it("FR: 'Total de la commande :' (trailing space + colon) still matches", () => {
    const doc = mountFixture("order-total-suggestion", "trailing-colon-fr");
    const page = pageProbeFor(doc, HOST, "/checkout/pay");
    expect(readOrderTotalSuggestion(page, extractionCore)).toEqual({ cents: 1500, currency: "CAD" });
  });
});

describe("readOrderTotalSuggestion — C6: the suggestion carries only the total and currency", () => {
  it("the returned object has exactly the keys 'cents' and 'currency', nothing else", () => {
    const doc = mountFixture("order-total-suggestion", "amazon-order-summary-trailing-colon");
    const page = pageProbeFor(doc, HOST, "/gp/buy/spc/handlers/display.html");
    const suggestion = readOrderTotalSuggestion(page, extractionCore);
    expect(suggestion).not.toBeNull();
    expect(Object.keys(suggestion as object).sort()).toEqual(["cents", "currency"]);
  });
});

describe("readOrderTotalSuggestion — FROZEN guardrails still apply (C2)", () => {
  it("an unsupported-currency value on an otherwise-exact label still yields blank, never a best-effort guess", () => {
    const doc = mountFixture("order-total-suggestion", "unparseable-currency-total");
    const page = pageProbeFor(doc, HOST, "/checkout/pay");
    expect(readOrderTotalSuggestion(page, extractionCore)).toBeNull();
  });

  it("no exact label match at all (an unrelated page) yields blank", () => {
    const doc = mountFixture("no-checkout", "unrelated-article-page");
    const page = pageProbeFor(doc, "blog.example.com", "/posts/weekend-recap");
    expect(readOrderTotalSuggestion(page, extractionCore)).toBeNull();
  });
});
