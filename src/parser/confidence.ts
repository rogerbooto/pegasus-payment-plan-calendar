/**
 * The confidence model: deterministic hard gates plus soft signals, no ML.
 * Thresholds live in src/shared/constants.ts. All four scalars hard-gated
 * and soft score >= SOFT_SCORE_CONFIRMABLE_FLOOR => PARSED_CONFIRMABLE;
 * all four hard-gated below the floor => PARTIAL; fewer than four =>
 * PARTIAL with the passing subset or DEGRADED. The engine never displays a
 * parsed number that failed a hard gate.
 */
import type { EngineState, PartialCandidate, SoftSignal } from "../shared/types";
import { NotImplementedError } from "../shared/errors";

export interface GateInput {
  readonly candidate: PartialCandidate;
  readonly signals: readonly SoftSignal[];
}

export function gradeCandidate(_input: GateInput): EngineState {
  throw new NotImplementedError("parser/confidence#gradeCandidate");
}
