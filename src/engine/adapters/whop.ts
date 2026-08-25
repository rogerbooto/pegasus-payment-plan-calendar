/**
 * Platform adapter: whop. Skeleton only — match/locate/extract land with
 * the adapter-engine task. Specificity is static (never computed from page
 * data); the selectors it consumes come from the bundled config in
 * src/config, validated at load.
 */
import type { EngineState } from "../../shared/types";
import type { AnchorSet, CheckoutAdapter, ExtractionCore, MatchResult, PageProbe } from "../types";
import { CONFIG_SCHEMA_VERSION } from "../../shared/constants";
import { NotImplementedError } from "../../shared/errors";

export const whopAdapterSpecificity = 20;

export const whopAdapter: CheckoutAdapter = {
  id: "whop",
  configSchemaVersion: CONFIG_SCHEMA_VERSION,
  match(_page: PageProbe): MatchResult {
    throw new NotImplementedError("engine/adapters/whop#match");
  },
  locate(_page: PageProbe): AnchorSet | null {
    throw new NotImplementedError("engine/adapters/whop#locate");
  },
  extract(_anchors: AnchorSet, _core: ExtractionCore): EngineState {
    throw new NotImplementedError("engine/adapters/whop#extract");
  },
};
