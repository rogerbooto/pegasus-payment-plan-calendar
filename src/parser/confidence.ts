/**
 * The confidence model: deterministic hard gates plus soft signals, no ML.
 * Thresholds live in src/shared/constants.ts. All four scalars hard-gated
 * and soft score >= SOFT_SCORE_CONFIRMABLE_FLOOR => PARSED_CONFIRMABLE;
 * all four hard-gated below the floor => PARTIAL; fewer than four =>
 * PARTIAL with the passing subset or DEGRADED. The engine never displays a
 * parsed number that failed a hard gate.
 *
 * This module does not itself run the five hard gates (money parse,
 * currency resolved, arithmetic consistency, visibility, single-candidate)
 * — those live in parser/money.ts, parser/candidates.ts and the arithmetic
 * check, run by the (adapter/generic-detector) caller before this module
 * ever sees a value. `candidate` here already reflects only the scalars
 * whose hard gates passed; this module's only job is the threshold
 * arithmetic and building the terminal EngineState.
 */
import type { EngineState, PartialCandidate, ScalarName, ScheduleCandidate, SoftSignal } from "../shared/types";
import { SOFT_SCORE_CONFIRMABLE_FLOOR } from "../shared/constants";

export interface GateInput {
  readonly candidate: PartialCandidate;
  readonly signals: readonly SoftSignal[];
}

const ALL_SCALARS: readonly ScalarName[] = ["orderTotal", "installmentCount", "cadence", "perInstallment"];

function presentScalars(candidate: PartialCandidate): readonly ScalarName[] {
  const present: ScalarName[] = [];
  if (candidate.orderTotalCents !== undefined && candidate.currency !== undefined) {
    present.push("orderTotal");
  }
  if (candidate.installmentCount !== undefined) present.push("installmentCount");
  if (candidate.cadence !== undefined) present.push("cadence");
  if (candidate.perInstallmentCents !== undefined) present.push("perInstallment");
  return present;
}

export function gradeCandidate(input: GateInput): EngineState {
  const { candidate, signals } = input;
  const present = presentScalars(candidate);
  const missing = ALL_SCALARS.filter((s) => !present.includes(s));
  const softScore = signals.length;
  const confidence = { hardGatesPassed: missing.length === 0, softScore, signals };

  if (missing.length > 0) {
    if (present.length === 0) {
      return { kind: "DEGRADED", reason: "gate_failed" };
    }
    return { kind: "PARTIAL", candidate: { ...candidate, confidence }, missing };
  }

  if (softScore >= SOFT_SCORE_CONFIRMABLE_FLOOR) {
    // Safe: missing.length === 0 above proves every field checked in
    // presentScalars() is defined.
    const full: ScheduleCandidate = {
      orderTotalCents: candidate.orderTotalCents as ScheduleCandidate["orderTotalCents"],
      installmentCount: candidate.installmentCount as number,
      cadence: candidate.cadence as ScheduleCandidate["cadence"],
      perInstallmentCents: candidate.perInstallmentCents as ScheduleCandidate["perInstallmentCents"],
      currency: candidate.currency as ScheduleCandidate["currency"],
      confidence,
    };
    return { kind: "PARSED_CONFIRMABLE", candidate: full };
  }

  return { kind: "PARTIAL", candidate: { ...candidate, confidence }, missing: [] };
}
