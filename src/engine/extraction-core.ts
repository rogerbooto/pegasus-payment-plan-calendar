/**
 * The one concrete ExtractionCore implementation, wiring the already-built
 * shared extraction primitives (src/parser/*) to the engine's `types.ts`
 * seam. This is composition only -- it calls parseMoneyToCents,
 * normalizeOrReject, isVisibleCandidate and arithmeticConsistent; it
 * re-implements none of them. Adapters and the generic detector receive
 * this object rather than importing src/parser/* directly, which is what
 * makes "adapters cannot bypass the shared core" true by
 * construction rather than by convention.
 */
import { parseMoneyToCents, arithmeticConsistent as arithmeticConsistentImpl } from "../parser/money";
import { normalizeOrReject } from "../parser/unicode";
import { isVisibleCandidate } from "../parser/candidates";
import type { ExtractionCore } from "./types";

export const extractionCore: ExtractionCore = {
  parseMoney: parseMoneyToCents,
  normalizeText: normalizeOrReject,
  isVisible: isVisibleCandidate,
  arithmeticConsistent: arithmeticConsistentImpl,
};
