/**
 * the design spec's fallback rule, tested against `runEngineWithAdapter` with fake
 * adapters so each branch (locate() null, extract() throw, extract()
 * DEGRADED, extract() PARTIAL/PARSED_CONFIRMABLE) can be constructed
 * directly, independent of real bundled config. "Fallback is
 * one-directional and single-step (adapter -> generic -> degraded), never
 * a retry loop" is asserted precisely: a PARTIAL/PARSED_CONFIRMABLE result
 * from the winning adapter must NEVER trigger a second (generic) attempt.
 */
import { describe, expect, it, vi } from "vitest";
import { runEngineWithAdapter } from "../../../src/engine/engine";
import { extractionCore } from "../../../src/engine/extraction-core";
import { fakeAdapter, fakePage } from "../../support/fake-adapter";
import type { ScheduleCandidate } from "../../../src/shared/types";
import { assertCents } from "../../../src/shared/money";

// A page that produces neither a checkout signal nor an instalment-offer
// signal for the generic path (empty querySelectorAll, an unrelated path).
const noSignalPage = fakePage({ path: "/about-us", querySelectorAll: () => [] });

const dummyCandidate: ScheduleCandidate = {
  orderTotalCents: assertCents(8996, "total"),
  installmentCount: 4,
  cadence: "BIWEEKLY",
  perInstallmentCents: assertCents(2249, "per"),
  currency: "CAD",
  confidence: { hardGatesPassed: true, softScore: 6, signals: [] },
};

describe("runEngineWithAdapter -- precedence and fallback", () => {
  it("no adapter selected at all => runs the generic path directly (DEGRADED when it too finds nothing)", () => {
    const state = runEngineWithAdapter(null, noSignalPage, extractionCore);
    expect(state).toEqual({ kind: "DEGRADED", reason: "no_match" });
  });

  it("adapter locate() returns null => falls back to generic (single step)", () => {
    const adapter = fakeAdapter({ id: "whop", locate: () => null });
    const state = runEngineWithAdapter(adapter, noSignalPage, extractionCore);
    expect(state).toEqual({ kind: "DEGRADED", reason: "adapter_error" });
  });

  it("adapter locate() throws => falls back to generic, never crashes the engine", () => {
    const adapter = fakeAdapter({
      id: "whop",
      locate: () => {
        throw new Error("simulated locate() crash");
      },
    });
    expect(() => runEngineWithAdapter(adapter, noSignalPage, extractionCore)).not.toThrow();
    expect(runEngineWithAdapter(adapter, noSignalPage, extractionCore)).toEqual({
      kind: "DEGRADED",
      reason: "adapter_error",
    });
  });

  it("adapter extract() throws => falls back to generic, never crashes the engine", () => {
    const adapter = fakeAdapter({
      id: "whop",
      extract: () => {
        throw new Error("simulated extract() crash");
      },
    });
    expect(() => runEngineWithAdapter(adapter, noSignalPage, extractionCore)).not.toThrow();
    expect(runEngineWithAdapter(adapter, noSignalPage, extractionCore)).toEqual({
      kind: "DEGRADED",
      reason: "adapter_error",
    });
  });

  it("adapter extract() resolves DEGRADED => falls back to generic", () => {
    const adapter = fakeAdapter({ id: "whop", extract: () => ({ kind: "DEGRADED", reason: "gate_failed" }) });
    const state = runEngineWithAdapter(adapter, noSignalPage, extractionCore);
    expect(state).toEqual({ kind: "DEGRADED", reason: "adapter_error" });
  });

  it("adapter extract() resolves PARTIAL => returned AS-IS, no fallback attempt (generic never runs)", () => {
    const partialState = {
      kind: "PARTIAL" as const,
      candidate: { confidence: { hardGatesPassed: false, softScore: 0, signals: [] } },
      missing: ["cadence" as const],
    };
    const extract = vi.fn(() => partialState);
    const adapter = fakeAdapter({ id: "whop", extract });
    const state = runEngineWithAdapter(adapter, noSignalPage, extractionCore);
    expect(state).toBe(partialState);
    expect(extract).toHaveBeenCalledTimes(1);
  });

  it("adapter extract() resolves PARSED_CONFIRMABLE => returned AS-IS, no fallback attempt", () => {
    const confirmable = { kind: "PARSED_CONFIRMABLE" as const, candidate: dummyCandidate };
    const adapter = fakeAdapter({ id: "shopify-checkout", extract: () => confirmable });
    const state = runEngineWithAdapter(adapter, noSignalPage, extractionCore);
    expect(state).toBe(confirmable);
  });

  it("never merges scalars across adapters: only the winning adapter's extract() is ever called", () => {
    const winnerExtract = vi.fn(() => ({ kind: "PARSED_CONFIRMABLE" as const, candidate: dummyCandidate }));
    const adapter = fakeAdapter({ id: "shopify-checkout", extract: winnerExtract });
    // runEngineWithAdapter only ever receives ONE adapter (the registry's
    // own winner-selection already happened before this call) -- there is
    // no code path here through which a second adapter's extract() could
    // run for the same session.
    runEngineWithAdapter(adapter, noSignalPage, extractionCore);
    expect(winnerExtract).toHaveBeenCalledTimes(1);
  });
});
