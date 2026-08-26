/**
 * Platform adapter: whop (whop.com). Niche but demographically on-target
 * -- a small, cheap slot: single host, single vendor.
 *
 * Every selector, host and pattern this adapter uses is DATA, read from the
 * bundled, validated config (src/config/adapters.config.json via
 * src/config/bundled.ts); match/locate/extract are shared with the other
 * two launch adapters in src/engine/adapter-common.ts.
 */
import type { EngineState } from "../../shared/types";
import type { AnchorSet, CheckoutAdapter, ExtractionCore, MatchResult, PageProbe } from "../types";
import { CONFIG_SCHEMA_VERSION } from "../../shared/constants";
import { BUNDLED_CONFIG } from "../../config/bundled";
import { extractAdapterAnchors, locateAdapterAnchors, matchAdapterConfig } from "../adapter-common";

/** Static, never computed from page data. */
export const whopAdapterSpecificity = 20;

export const whopAdapter: CheckoutAdapter = {
  id: "whop",
  configSchemaVersion: CONFIG_SCHEMA_VERSION,
  match(page: PageProbe): MatchResult {
    return matchAdapterConfig(page, BUNDLED_CONFIG.adapters.get("whop"), whopAdapterSpecificity);
  },
  locate(page: PageProbe): AnchorSet | null {
    return locateAdapterAnchors(page, BUNDLED_CONFIG.adapters.get("whop"));
  },
  extract(anchors: AnchorSet, core: ExtractionCore): EngineState {
    return extractAdapterAnchors(anchors, BUNDLED_CONFIG.adapters.get("whop"), core);
  },
};
