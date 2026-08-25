/**
 * The generic detector: structural heuristics that answer (i) is a checkout
 * present? and (ii) is a pay-in-installments option offered? It needs no
 * merchant-specific selector and is the universal fallback. Its extraction
 * path caps at PARTIAL unless every hard gate passes; its real job is to
 * make degradation specific and honest.
 */
import type { EngineState } from "../shared/types";
import type { ExtractionCore, PageProbe } from "./types";
import { NotImplementedError } from "../shared/errors";

export function detectCheckout(_page: PageProbe): boolean {
  throw new NotImplementedError("engine/generic-detector#detectCheckout");
}

export function detectInstallmentOffer(_page: PageProbe): boolean {
  throw new NotImplementedError("engine/generic-detector#detectInstallmentOffer");
}

export function extractGeneric(_page: PageProbe, _core: ExtractionCore): EngineState {
  throw new NotImplementedError("engine/generic-detector#extractGeneric");
}
