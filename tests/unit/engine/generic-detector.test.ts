// @vitest-environment jsdom
/**
 * The generic detector: checkout/instalment-offer presence
 * scoring, and the "caps at PARTIAL in practice, not by an artificial
 * ceiling" property -- a fully hard-gated generic candidate still falls
 * short of PARSED_CONFIRMABLE because it lacks the adapter_path soft
 * signal, which is exactly the intended behaviour (the design spec's own framing:
 * "its real job is to make degradation specific and honest... rather than
 * to compete with adapters on precision").
 */
import { describe, expect, it } from "vitest";
import { detectCheckout, detectInstallmentOffer, extractGeneric } from "../../../src/engine/generic-detector";
import { runEngine } from "../../../src/engine/engine";
import { extractionCore } from "../../../src/engine/extraction-core";
import { mountFixture } from "../../support/dom-fixture";
import { pageProbeFor } from "../../support/page-probe";

const AMAZON_LIKE_HOST = "www.amazon.ca";

describe("detectCheckout / detectInstallmentOffer", () => {
  it("a checkout-shaped page (path + labelled total that parses + a provider widget) is detected", () => {
    const doc = mountFixture("generic-checkout", "unrecognized-platform-still-confirmable-subset");
    const page = pageProbeFor(doc, AMAZON_LIKE_HOST, "/checkout/pay");
    expect(detectCheckout(page)).toBe(true);
    expect(detectInstallmentOffer(page)).toBe(true);
  });

  it("an unrelated page (no path match, no total, no payment affordance) is NOT detected as a checkout", () => {
    const doc = mountFixture("no-checkout", "unrelated-article-page");
    const page = pageProbeFor(doc, "blog.example.com", "/posts/weekend-recap");
    expect(detectCheckout(page)).toBe(false);
  });

  it("a single coincidental signal alone (URL path only) does not register as a checkout -- needs 2 of 3", () => {
    const doc = mountFixture("no-checkout", "unrelated-article-page");
    // Path contains "/pay/" but nothing else on the page looks like a checkout.
    const page = pageProbeFor(doc, "blog.example.com", "/how-to-pay/off-debt");
    expect(detectCheckout(page)).toBe(false);
  });
});

describe("extractGeneric", () => {
  it("all four scalars hard-gate but the soft score (3/6, no adapter_path) is one short of the confirmable floor -- PARTIAL, never PARSED_CONFIRMABLE", () => {
    const doc = mountFixture("generic-checkout", "unrecognized-platform-still-confirmable-subset");
    const page = pageProbeFor(doc, AMAZON_LIKE_HOST, "/checkout/pay");
    const state = extractGeneric(page, extractionCore);
    expect(state.kind).toBe("PARTIAL");
    if (state.kind === "PARTIAL") {
      expect(state.missing).toEqual([]);
      expect(state.candidate.orderTotalCents).toBe(8996);
      expect(state.candidate.installmentCount).toBe(4);
      expect(state.candidate.cadence).toBe("BIWEEKLY");
      expect(state.candidate.perInstallmentCents).toBe(2249);
      expect(state.candidate.currency).toBe("USD");
    }
  });
});

describe("runEngine on an unrecognized platform (no adapter matches the host)", () => {
  it("falls straight to the generic path and reaches the same honest PARTIAL result", () => {
    const doc = mountFixture("generic-checkout", "unrecognized-platform-still-confirmable-subset");
    const page = pageProbeFor(doc, AMAZON_LIKE_HOST, "/checkout/pay");
    const state = runEngine(page, extractionCore);
    expect(state.kind).toBe("PARTIAL");
  });

  it("a page with no checkout signal at all reaches DEGRADED(no_match)", () => {
    const doc = mountFixture("no-checkout", "unrelated-article-page");
    const page = pageProbeFor(doc, "blog.example.com", "/posts/weekend-recap");
    const state = runEngine(page, extractionCore);
    expect(state).toEqual({ kind: "DEGRADED", reason: "no_match" });
  });
});
