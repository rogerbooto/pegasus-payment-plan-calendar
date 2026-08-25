// @vitest-environment jsdom
/**
 * D3 finding T10 / D3b invariant #10, at the ENGINE's own layer: the
 * detection/extraction/lifecycle machinery reads the page DOM but never
 * writes to it -- no marker attribute, class, or node appears in page
 * (light) DOM after a full run. This is distinct from the overlay's own
 * T10 coverage (owned by another task) -- this test proves the ENGINE
 * itself (match/locate/extract/observer setup) is footprint-free, which
 * matters independently since the engine runs BEFORE any overlay exists.
 */
import { describe, expect, it, vi } from "vitest";
import { runEngine } from "../../../src/engine/engine";
import { extractionCore } from "../../../src/engine/extraction-core";
import { createEngineLifecycle } from "../../../src/engine/lifecycle";
import { mountFixture } from "../../support/dom-fixture";
import { pageProbeFor } from "../../support/page-probe";

describe("the engine never writes to the page DOM", () => {
  it("running the full match->locate->extract pipeline leaves document.body.outerHTML byte-identical", () => {
    const doc = mountFixture("adapters/shopify-checkout", "full-confirmable");
    const before = doc.body.outerHTML;
    const page = pageProbeFor(doc, "checkout.shopify.com", "/checkouts/abc123");
    runEngine(page, extractionCore);
    expect(doc.body.outerHTML).toBe(before);
  });

  it("running the lifecycle controller (pre-gate, observer attach, one settled parse) also leaves the DOM untouched", () => {
    vi.useFakeTimers();
    try {
      const doc = mountFixture("adapters/shopify-checkout", "full-confirmable");
      const before = doc.body.outerHTML;
      const styleSheetCountBefore = doc.styleSheets.length;
      const htmlAttrsBefore = [...doc.documentElement.attributes].map((a) => a.name).sort();
      const bodyAttrsBefore = [...doc.body.attributes].map((a) => a.name).sort();

      const lifecycle = createEngineLifecycle({ doc, core: extractionCore, onState: () => {} });
      lifecycle.start();
      vi.advanceTimersByTime(1000); // past the debounce + idle-callback fallback window
      lifecycle.teardown();

      expect(doc.body.outerHTML).toBe(before);
      expect(doc.styleSheets.length).toBe(styleSheetCountBefore);
      expect([...doc.documentElement.attributes].map((a) => a.name).sort()).toEqual(htmlAttrsBefore);
      expect([...doc.body.attributes].map((a) => a.name).sort()).toEqual(bodyAttrsBefore);
    } finally {
      vi.useRealTimers();
    }
  });
});
