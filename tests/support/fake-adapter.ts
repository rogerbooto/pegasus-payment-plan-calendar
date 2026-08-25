/**
 * Test-only fakes for the engine's own composition tests (precedence,
 * fallback). Real coverage of a real adapter's match/locate/extract lives
 * in tests/unit/engine/adapters.test.ts, against real fixtures and the
 * real bundled config -- these fakes exist ONLY to make registry.ts's and
 * engine.ts's orchestration logic testable in isolation, per their own
 * `selectAdapterFrom` / `runEngineWithAdapter` seams.
 */
import type { AnchorSet, CheckoutAdapter, MatchResult, PageProbe } from "../../src/engine/types";
import type { EngineState } from "../../src/shared/types";

export function fakePage(overrides: Partial<PageProbe> = {}): PageProbe {
  return {
    host: "example.test",
    path: "/checkout",
    querySelector: () => null,
    querySelectorAll: () => [],
    ...overrides,
  };
}

export function fakeAdapter(overrides: Partial<CheckoutAdapter> & { id: CheckoutAdapter["id"] }): CheckoutAdapter {
  return {
    configSchemaVersion: 1,
    match: (): MatchResult => ({ matched: true, specificity: 10 }),
    locate: (): AnchorSet | null => ({ orderTotal: null, installmentCluster: null, providerWidget: null }),
    extract: (): EngineState => ({ kind: "DEGRADED", reason: "gate_failed" }),
    ...overrides,
  };
}
