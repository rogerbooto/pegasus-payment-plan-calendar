/**
 * @vitest-environment jsdom
 *
 * Pins the "degraded / unconfirmed" fixture
 * (tests/fixtures/dom/degraded-unconfirmed/checkout-shell-no-affordance.html)
 * against the real pre-gate functions (src/engine/pre-gate.ts): a
 * checkout-shaped path with a plausible order-summary page that carries
 * NO payment-affordance markup stays `cheapPreGate: false` (no observer is
 * ever attached) while `looksLikeCheckoutPath: true` (the session is not
 * silently dormant -- lifecycle.ts still reports one DEGRADED("unconfirmed")
 * state). This is also the exact bytes served live at
 * /checkout/still-loading by scripts/dev/serve-fixtures.mjs -- what the
 * founder browser-tests and what this file asserts on cannot drift, since
 * both read the same fixture file (scripts/dev/fixture-routes.mjs).
 *
 * RED when: the fixture gains a payment-affordance selector (cheapPreGate
 * would flip true), the served path stops containing a
 * GENERIC_CHECKOUT_PATH_PATTERNS substring (looksLikeCheckoutPath would
 * flip false, and the panel would go silent), or pre-gate.ts's own logic
 * regresses.
 */
import { describe, expect, it } from "vitest";
import { cheapPreGate, looksLikeCheckoutPath } from "../../../src/engine/pre-gate";
import { mountFixture, loadFixtureSidecar } from "../../support/dom-fixture";
import { pageProbeFor } from "../../support/page-probe";

interface DegradedUnconfirmedSidecar {
  readonly expectedCheapPreGate: boolean;
  readonly expectedLooksLikeCheckoutPath: boolean;
}

// The path this fixture is served at (scripts/dev/fixture-routes.mjs).
// Deliberately contains "/checkout" -- one of GENERIC_CHECKOUT_PATH_PATTERNS'
// substrings (src/engine/generic-lexicon.ts) -- without matching any real
// adapter's host or the dev-only shopify-checkout override's path prefix.
const SERVED_PATH = "/checkout/still-loading";

describe("degraded-unconfirmed fixture: checkout-shaped path, zero affordance markup", () => {
  it("matches its own sidecar's expectations (the sidecar is the single source of truth this test and the served page both point at)", () => {
    const sidecar = loadFixtureSidecar<DegradedUnconfirmedSidecar>("degraded-unconfirmed", "checkout-shell-no-affordance");
    const doc = mountFixture("degraded-unconfirmed", "checkout-shell-no-affordance");
    const page = pageProbeFor(doc, "localhost", SERVED_PATH);

    expect(cheapPreGate(page)).toBe(sidecar.expectedCheapPreGate);
    expect(looksLikeCheckoutPath(page)).toBe(sidecar.expectedLooksLikeCheckoutPath);
  });

  it("cheapPreGate is false: no payment-affordance selector, no adapter match -- an observer is never attached for this page", () => {
    const doc = mountFixture("degraded-unconfirmed", "checkout-shell-no-affordance");
    const page = pageProbeFor(doc, "localhost", SERVED_PATH);
    expect(cheapPreGate(page)).toBe(false);
  });

  it("looksLikeCheckoutPath is true: the session is never silently dormant even though cheapPreGate is strict", () => {
    const doc = mountFixture("degraded-unconfirmed", "checkout-shell-no-affordance");
    const page = pageProbeFor(doc, "localhost", SERVED_PATH);
    expect(looksLikeCheckoutPath(page)).toBe(true);
  });

  it("on a path with no checkout-shaped substring at all, this SAME page's content also fails looksLikeCheckoutPath (proves the true reading above comes from the path, not a DOM signal this fixture happens to carry)", () => {
    const doc = mountFixture("degraded-unconfirmed", "checkout-shell-no-affordance");
    const page = pageProbeFor(doc, "localhost", "/store/harlow-and-finch");
    expect(cheapPreGate(page)).toBe(false);
    expect(looksLikeCheckoutPath(page)).toBe(false);
  });
});
