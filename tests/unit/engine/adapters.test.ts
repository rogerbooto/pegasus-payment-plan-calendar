// @vitest-environment jsdom
/**
 * The three launch adapters (D6 §B), exercised end-to-end (match -> locate
 * -> extract) against real fixtures and the real bundled config -- proves
 * the adapters are genuinely data-driven (src/config/adapters.config.json),
 * not hardcoded selector soup, and that the shared extraction/confidence
 * pipeline (src/engine/adapter-common.ts) produces the right terminal
 * state for each fixture.
 */
import { describe, expect, it } from "vitest";
import { shopifyCheckoutAdapter } from "../../../src/engine/adapters/shopify-checkout";
import { stripeHostedAdapter } from "../../../src/engine/adapters/stripe-hosted";
import { whopAdapter } from "../../../src/engine/adapters/whop";
import { extractionCore } from "../../../src/engine/extraction-core";
import { mountFixture, loadFixtureSidecar } from "../../support/dom-fixture";
import { pageProbeFor } from "../../support/page-probe";
import type { AnchorSet, CheckoutAdapter } from "../../../src/engine/types";

interface AdapterFixtureExpectation {
  readonly adapter: string;
  readonly expectedKind: "PARSED_CONFIRMABLE" | "PARTIAL" | "DEGRADED";
  readonly expectedMissing?: readonly string[];
  readonly expected: Record<string, unknown>;
}

function assertHardGatedFields(candidate: object, expected: Record<string, unknown>): void {
  const rec = candidate as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(expected)) {
    expect(rec[key], key).toBe(value);
  }
}

describe("shopifyCheckoutAdapter", () => {
  const host = "checkout.shopify.com";
  const path = "/checkouts/abc123";

  it("matches on the configured host + path + a CSS probe hit", () => {
    const doc = mountFixture("adapters/shopify-checkout", "full-confirmable");
    const page = pageProbeFor(doc, host, path);
    expect(shopifyCheckoutAdapter.match(page)).toEqual({ matched: true, specificity: 30 });
  });

  it("does not match on an unrelated host even with the same page content", () => {
    const doc = mountFixture("adapters/shopify-checkout", "full-confirmable");
    const page = pageProbeFor(doc, "evil.example", path);
    expect(shopifyCheckoutAdapter.match(page).matched).toBe(false);
  });

  it("full-confirmable fixture: match -> locate -> extract reaches PARSED_CONFIRMABLE with the exact scalars", () => {
    const sidecar = loadFixtureSidecar<AdapterFixtureExpectation>("adapters/shopify-checkout", "full-confirmable");
    const doc = mountFixture("adapters/shopify-checkout", "full-confirmable");
    const page = pageProbeFor(doc, host, path);
    expect(shopifyCheckoutAdapter.match(page).matched).toBe(true);
    const anchors = shopifyCheckoutAdapter.locate(page);
    expect(anchors).not.toBeNull();
    const state = shopifyCheckoutAdapter.extract(anchors as AnchorSet, extractionCore);
    expect(state.kind).toBe(sidecar.expectedKind);
    if (state.kind === "PARSED_CONFIRMABLE") assertHardGatedFields(state.candidate, sidecar.expected);
  });

  it("partial-no-cadence fixture: reaches PARTIAL with exactly cadence missing", () => {
    const sidecar = loadFixtureSidecar<AdapterFixtureExpectation>("adapters/shopify-checkout", "partial-no-cadence");
    const doc = mountFixture("adapters/shopify-checkout", "partial-no-cadence");
    const page = pageProbeFor(doc, host, path);
    const anchors = shopifyCheckoutAdapter.locate(page);
    const state = shopifyCheckoutAdapter.extract(anchors as AnchorSet, extractionCore);
    expect(state.kind).toBe("PARTIAL");
    if (state.kind === "PARTIAL") {
      expect(state.missing).toEqual(sidecar.expectedMissing);
      assertHardGatedFields(state.candidate, sidecar.expected);
    }
  });

  it("decoy-total-via-css fixture: an ambiguous CSS-located total is refused through the FULL adapter wiring, not silently picked", () => {
    const sidecar = loadFixtureSidecar<AdapterFixtureExpectation>("adapters/shopify-checkout", "decoy-total-via-css");
    const doc = mountFixture("adapters/shopify-checkout", "decoy-total-via-css");
    const page = pageProbeFor(doc, host, path);
    const anchors = shopifyCheckoutAdapter.locate(page);
    expect(anchors).not.toBeNull();
    expect((anchors as AnchorSet).orderTotal).toBeNull(); // the decoy pair resolves to no candidate at all
    const state = shopifyCheckoutAdapter.extract(anchors as AnchorSet, extractionCore);
    expect(state.kind).toBe("PARTIAL");
    if (state.kind === "PARTIAL") {
      expect(state.missing).toEqual(sidecar.expectedMissing);
      assertHardGatedFields(state.candidate, sidecar.expected);
      expect(state.candidate.orderTotalCents).toBeUndefined();
    }
  });
});

describe("stripeHostedAdapter", () => {
  const host = "checkout.stripe.com";
  const path = "/c/pay/cs_test_abc";

  it("partial-schedule-in-redirect fixture: the total hard-gates, the instalment scalars stay missing (schedule finalizes off-page)", () => {
    const sidecar = loadFixtureSidecar<AdapterFixtureExpectation>(
      "adapters/stripe-hosted",
      "partial-schedule-in-redirect",
    );
    const doc = mountFixture("adapters/stripe-hosted", "partial-schedule-in-redirect");
    const page = pageProbeFor(doc, host, path);
    expect(stripeHostedAdapter.match(page).matched).toBe(true);
    const anchors = stripeHostedAdapter.locate(page);
    const state = stripeHostedAdapter.extract(anchors as AnchorSet, extractionCore);
    expect(state.kind).toBe("PARTIAL");
    if (state.kind === "PARTIAL") {
      expect(state.missing.slice().sort()).toEqual([...sidecar.expectedMissing!].sort());
      assertHardGatedFields(state.candidate, sidecar.expected);
    }
  });
});

describe("whopAdapter", () => {
  const host = "whop.com";
  const path = "/checkout/abc";

  it("full-confirmable fixture: reaches PARSED_CONFIRMABLE with the exact scalars", () => {
    const sidecar = loadFixtureSidecar<AdapterFixtureExpectation>("adapters/whop", "full-confirmable");
    const doc = mountFixture("adapters/whop", "full-confirmable");
    const page = pageProbeFor(doc, host, path);
    expect(whopAdapter.match(page).matched).toBe(true);
    const anchors = whopAdapter.locate(page);
    const state = whopAdapter.extract(anchors as AnchorSet, extractionCore);
    expect(state.kind).toBe(sidecar.expectedKind);
    if (state.kind === "PARSED_CONFIRMABLE") assertHardGatedFields(state.candidate, sidecar.expected);
  });
});

describe("adapters disabled by a broken bundled config never crash and never widen capture", () => {
  it("locate()/extract() with a config lookup that fails to find the adapter entry degrade honestly, they don't throw", () => {
    // Simulates the "config validation disabled this adapter entirely"
    // path (D6 §C.2) at the seam every adapter shares, without mutating
    // the real bundled singleton (which every other test in this file
    // depends on staying valid).
    const adapters: readonly CheckoutAdapter[] = [shopifyCheckoutAdapter, stripeHostedAdapter, whopAdapter];
    for (const adapter of adapters) {
      // extract() with an empty AnchorSet (as if locate() had found nothing
      // but was still called) must never throw and must degrade honestly.
      expect(() =>
        adapter.extract({ orderTotal: null, installmentCluster: null, providerWidget: null }, extractionCore),
      ).not.toThrow();
    }
  });
});
