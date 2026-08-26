// @vitest-environment jsdom
/**
 * Pins the "full flow, no elevation" fixture
 * (tests/fixtures/dom/generic-checkout/full-flow-no-elevation.html)
 * against the REAL engine entrypoint (src/engine/engine.ts's runEngine,
 * the same function src/content/entrypoint wires up in production --
 * never a copy of the detection logic). This fixture exists because the
 * only fixture that previously carried a full order-total + count +
 * cadence + per-payment cluster (tests/fixtures/dom/adapters/shopify-checkout/
 * full-confirmable.html) only reaches its terminal state through the
 * shopify-checkout adapter's exact-host match, which (src/config/loader.ts's
 * HOST_CHARSET has no room for a colon) only resolves at http's own default
 * port, 80 -- an elevated bind on this machine. This fixture reaches a
 * terminal, confirmable-with-every-scalar state through
 * src/engine/generic-detector.ts instead: path-shape + label-lexicon +
 * bound instalment phrase, none of which involve `location.host` at all,
 * so it is exercised identically at ANY port, including the fixture
 * server's ordinary default (scripts/lib/fixture-port.mjs's
 * DEFAULT_FIXTURE_PORT, 8080).
 *
 * This is also the exact bytes served live at
 * /checkout/summary by scripts/dev/serve-fixtures.mjs (see
 * scripts/dev/fixture-routes.mjs) -- what gets clicked through in a
 * browser and what this file asserts on cannot drift, since both read the
 * same fixture file.
 *
 * RED when: the fixture's instalment cluster stops carrying all of count +
 * money + cadence bound in one text node (the load-bearing case -- see the
 * sabotage note below), the served path stops containing a
 * GENERIC_CHECKOUT_PATH_PATTERNS substring, the "Order total" label
 * stops matching GENERIC_ORDER_TOTAL_LABEL_LEXICON exactly, or the
 * generic detector's own logic regresses.
 */
import { describe, expect, it } from "vitest";
import { runEngine } from "../../../src/engine/engine";
import { detectCheckout, detectInstallmentOffer } from "../../../src/engine/generic-detector";
import { selectAdapter } from "../../../src/engine/registry";
import { extractionCore } from "../../../src/engine/extraction-core";
import { mountFixture, loadFixtureSidecar } from "../../support/dom-fixture";
import { pageProbeFor } from "../../support/page-probe";

interface GenericFullFlowSidecar {
  readonly expectedKind: "PARTIAL" | "PARSED_CONFIRMABLE" | "DEGRADED";
  readonly expectedMissing: readonly string[];
  readonly expected: {
    readonly orderTotalCents: number;
    readonly installmentCount: number;
    readonly cadence: string;
    readonly perInstallmentCents: number;
    readonly currency: string;
  };
}

// The path this fixture is served at (scripts/dev/fixture-routes.mjs).
// Contains "/checkout" -- one of GENERIC_CHECKOUT_PATH_PATTERNS'
// substrings (src/engine/generic-lexicon.ts) -- and matches no real
// bundled adapter's host or path (src/config/adapters.config.json), on
// any host at all -- this test uses "localhost" specifically to prove
// that even the exact host name the dev-only adapter override targets
// still falls through to the generic path when the SHIPPING config (the
// only one this test suite ever loads) is what's asked.
const SERVED_PATH = "/checkout/summary";
const SERVED_HOST = "localhost";

describe("generic full-flow fixture: a full order-total + count + cadence + per-payment cluster reached with no adapter host match", () => {
  it("matches its own sidecar's expectations (the sidecar is the single source of truth this test and the served page both point at)", () => {
    const sidecar = loadFixtureSidecar<GenericFullFlowSidecar>("generic-checkout", "full-flow-no-elevation");
    const doc = mountFixture("generic-checkout", "full-flow-no-elevation");
    const page = pageProbeFor(doc, SERVED_HOST, SERVED_PATH);
    const state = runEngine(page, extractionCore);

    expect(state.kind).toBe(sidecar.expectedKind);
    if (state.kind === "PARTIAL") {
      expect(state.missing).toEqual(sidecar.expectedMissing);
      expect(state.candidate.orderTotalCents).toBe(sidecar.expected.orderTotalCents);
      expect(state.candidate.installmentCount).toBe(sidecar.expected.installmentCount);
      expect(state.candidate.cadence).toBe(sidecar.expected.cadence);
      expect(state.candidate.perInstallmentCents).toBe(sidecar.expected.perInstallmentCents);
      expect(state.candidate.currency).toBe(sidecar.expected.currency);
    }
  });

  it("no bundled adapter matches this host/path at all -- the terminal state above is reached purely through the generic path", () => {
    const doc = mountFixture("generic-checkout", "full-flow-no-elevation");
    const page = pageProbeFor(doc, SERVED_HOST, SERVED_PATH);
    expect(selectAdapter(page)).toBeNull();
  });

  it("detectCheckout is true (path + labelled total + a payment-method radiogroup: 3 of 3 signal families) and detectInstallmentOffer is true (the bound instalment phrase)", () => {
    const doc = mountFixture("generic-checkout", "full-flow-no-elevation");
    const page = pageProbeFor(doc, SERVED_HOST, SERVED_PATH);
    expect(detectCheckout(page)).toBe(true);
    expect(detectInstallmentOffer(page)).toBe(true);
  });

  it("reaches PARTIAL, never PARSED_CONFIRMABLE -- the generic path's signal ceiling (no adapter_path signal exists outside an adapter match) sits below SOFT_SCORE_CONFIRMABLE_FLOOR by construction, so a real browser session against this exact page would land on the pre-filled manual-entry sheet, not the one-click confirmation sheet", () => {
    const doc = mountFixture("generic-checkout", "full-flow-no-elevation");
    const page = pageProbeFor(doc, SERVED_HOST, SERVED_PATH);
    const state = runEngine(page, extractionCore);
    expect(state.kind).toBe("PARTIAL");
  });

  it("reached identically at a non-default port -- proves nothing here depends on location.host omitting a port (unlike the adapter-matched fixture)", () => {
    const doc = mountFixture("generic-checkout", "full-flow-no-elevation");
    // A real browser never reports a port in `location.host` for the
    // scheme default; this probe's host string is unaffected by any
    // fixture-server port at all, because nothing in the generic path
    // ever reads a port. Asserting the SAME result under a page probe
    // that would differ only if a port were somehow in play:
    const page = pageProbeFor(doc, `${SERVED_HOST}:8080`, SERVED_PATH);
    const state = runEngine(page, extractionCore);
    expect(state.kind).toBe("PARTIAL");
  });
});
