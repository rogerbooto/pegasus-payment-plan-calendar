// @vitest-environment jsdom
/**
 * runEngine, end-to-end, through the REAL registry + REAL bundled config
 * (no fakes) -- proves precedence and fallback hold in practice, not just
 * against the isolated fakes in engine.test.ts.
 */
import { describe, expect, it } from "vitest";
import { runEngine } from "../../../src/engine/engine";
import { extractionCore } from "../../../src/engine/extraction-core";
import { mountFixture } from "../../support/dom-fixture";
import { pageProbeFor } from "../../support/page-probe";

describe("runEngine -- real registry, real config, real fixtures", () => {
  it("a matched platform adapter wins over the generic path even though the same content would only reach PARTIAL generically", () => {
    // Sanity precondition making this test meaningful: this exact fixture,
    // run through the GENERIC path alone, caps at PARTIAL (see
    // generic-detector.test.ts's sibling assertions on shopify's own
    // provider-widget marker not being in the generic lexicon). If
    // adapter precedence silently broke (engine fell through to generic
    // regardless of a real adapter match), this specific fixture would
    // regress from PARSED_CONFIRMABLE to PARTIAL here.
    const doc = mountFixture("adapters/shopify-checkout", "full-confirmable");
    const page = pageProbeFor(doc, "checkout.shopify.com", "/checkouts/abc123");
    const state = runEngine(page, extractionCore);
    expect(state.kind).toBe("PARSED_CONFIRMABLE");
    if (state.kind === "PARSED_CONFIRMABLE") {
      expect(state.candidate.orderTotalCents).toBe(8996);
      expect(state.candidate.confidence.signals).toContain("adapter_path");
    }
  });

  it("an adapter that matches but extracts nothing falls back once to generic; when generic also finds nothing, the reason is the more specific adapter_error, not no_match", () => {
    const doc = mountFixture("adapters/shopify-checkout", "adapter-matches-but-nothing-extractable");
    const page = pageProbeFor(doc, "checkout.shopify.com", "/checkouts/abc123");
    const state = runEngine(page, extractionCore);
    expect(state).toEqual({ kind: "DEGRADED", reason: "adapter_error" });
  });
});
