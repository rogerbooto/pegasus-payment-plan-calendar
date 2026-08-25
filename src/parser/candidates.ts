/**
 * Candidate filtering: the visibility hard gate and the single-candidate
 * rule. Hidden, struck-through, zero-size, transparent or offscreen nodes
 * are discarded before scoring; two visible, unequal candidates for the same
 * scalar is ambiguity, and ambiguity is refused — the engine never picks the
 * friendlier number.
 */
import { NotImplementedError } from "../shared/errors";

/** Visibility hard gate for a single rendered node. */
export function isVisibleCandidate(_el: Element): boolean {
  throw new NotImplementedError("parser/candidates#isVisibleCandidate");
}

/**
 * Applies the visibility gate, then the single-candidate rule: returns the
 * one surviving element (or several exactly-equal ones collapsed to one), or
 * null when the survivors disagree or none survive.
 */
export function selectSingleCandidate(_els: readonly Element[]): Element | null {
  throw new NotImplementedError("parser/candidates#selectSingleCandidate");
}
