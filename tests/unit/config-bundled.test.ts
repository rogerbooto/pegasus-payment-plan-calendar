/**
 * The bundled, validated config singleton every adapter reads from
 * (src/config/bundled.ts). Distinct from config-loader.test.ts: this
 * proves the SINGLETON wiring itself (real manifest hosts, real bundled
 * JSON, resolved at module load) rather than the validator function in
 * isolation.
 */
import { describe, expect, it } from "vitest";
import { BUNDLED_CONFIG } from "../../src/config/bundled";

describe("BUNDLED_CONFIG", () => {
  it("loads and validates cleanly against the real manifest at module load", () => {
    expect(BUNDLED_CONFIG.disabled).toEqual([]);
    expect([...BUNDLED_CONFIG.adapters.keys()].sort()).toEqual(["shopify-checkout", "stripe-hosted", "whop"]);
  });

  it("every launch adapter's anchors carry non-empty CSS selectors and instalment patterns (data-driven, not empty stubs)", () => {
    for (const [id, config] of BUNDLED_CONFIG.adapters) {
      expect(config.anchors.orderTotal.css.length, `${id} orderTotal.css`).toBeGreaterThan(0);
      expect(config.anchors.installmentText.patterns.length, `${id} installmentText.patterns`).toBeGreaterThan(0);
    }
  });
});
