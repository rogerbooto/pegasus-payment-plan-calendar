/**
 * The confidence model's threshold arithmetic: all four scalars
 * hard-gated and soft score >= 4/6 => PARSED_CONFIRMABLE; all four
 * hard-gated but soft score below the floor => PARTIAL; fewer than four
 * hard-gated => PARTIAL with the passing subset, or DEGRADED when the
 * subset is empty. The engine never displays a parsed number that failed a
 * hard gate — proven here by construction: DEGRADED/PARTIAL states never
 * carry a `ScheduleCandidate`-shaped value, only a `PartialCandidate`.
 */
import { describe, expect, it } from "vitest";
import { gradeCandidate } from "../../../src/parser/confidence";
import { assertCents } from "../../../src/shared/money";
import { SOFT_SCORE_CONFIRMABLE_FLOOR } from "../../../src/shared/constants";
import type { PartialCandidate, SoftSignal } from "../../../src/shared/types";

const fullCandidate: PartialCandidate = {
  orderTotalCents: assertCents(8996, "total"),
  installmentCount: 4,
  cadence: "BIWEEKLY",
  perInstallmentCents: assertCents(2249, "per"),
  currency: "CAD",
  confidence: { hardGatesPassed: false, softScore: 0, signals: [] },
};

const SIX_SIGNALS: readonly SoftSignal[] = [
  "provider_widget",
  "bound_cluster",
  "labelled_total_row",
  "adapter_path",
  "stable_across_ticks",
  "primary_anchor",
];

describe("gradeCandidate — threshold arithmetic", () => {
  it("all four scalars + soft score at the floor => PARSED_CONFIRMABLE", () => {
    const signals = SIX_SIGNALS.slice(0, SOFT_SCORE_CONFIRMABLE_FLOOR);
    const state = gradeCandidate({ candidate: fullCandidate, signals });
    expect(state.kind).toBe("PARSED_CONFIRMABLE");
    if (state.kind === "PARSED_CONFIRMABLE") {
      expect(state.candidate.orderTotalCents).toBe(8996);
      expect(state.candidate.confidence.softScore).toBe(SOFT_SCORE_CONFIRMABLE_FLOOR);
    }
  });

  it("all four scalars but one signal short of the floor => PARTIAL, never PARSED_CONFIRMABLE", () => {
    const signals = SIX_SIGNALS.slice(0, SOFT_SCORE_CONFIRMABLE_FLOOR - 1);
    const state = gradeCandidate({ candidate: fullCandidate, signals });
    expect(state.kind).toBe("PARTIAL");
    if (state.kind === "PARTIAL") expect(state.missing).toEqual([]);
  });

  it("full soft score (6/6) but a missing scalar => PARTIAL with the missing field named, never PARSED_CONFIRMABLE", () => {
    const { cadence: _drop, ...withoutCadence } = fullCandidate;
    const state = gradeCandidate({ candidate: withoutCadence, signals: SIX_SIGNALS });
    expect(state.kind).toBe("PARTIAL");
    if (state.kind === "PARTIAL") {
      expect(state.missing).toContain("cadence");
      expect("cadence" in state.candidate).toBe(false);
    }
  });

  it("no scalars hard-gated at all => DEGRADED, carrying no page data", () => {
    const state = gradeCandidate({
      candidate: { confidence: { hardGatesPassed: false, softScore: 0, signals: [] } },
      signals: [],
    });
    expect(state.kind).toBe("DEGRADED");
    if (state.kind === "DEGRADED") {
      expect(Object.keys(state)).toEqual(["kind", "reason"]);
    }
  });

  it("order total without a resolved currency does not count as the orderTotal scalar", () => {
    const { currency: _c, ...withoutCurrency } = fullCandidate;
    const state = gradeCandidate({ candidate: withoutCurrency, signals: SIX_SIGNALS });
    expect(state.kind).toBe("PARTIAL");
    if (state.kind === "PARTIAL") expect(state.missing).toContain("orderTotal");
  });
});
