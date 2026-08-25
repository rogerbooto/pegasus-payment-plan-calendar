/**
 * Platform adapter: stripe-hosted (checkout.stripe.com). Single stable
 * host, single vendor, conservative DOM (D6 §B) -- cheapest adapter per
 * unit of coverage. Full schedules often finalize inside the provider
 * redirect, so PARTIAL is an expected, honest outcome here more often than
 * on Shopify, not a bug.
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

/** Static, never computed from page data (D6 §A.3). */
export const stripeHostedAdapterSpecificity = 20;

export const stripeHostedAdapter: CheckoutAdapter = {
  id: "stripe-hosted",
  configSchemaVersion: CONFIG_SCHEMA_VERSION,
  match(page: PageProbe): MatchResult {
    return matchAdapterConfig(page, BUNDLED_CONFIG.adapters.get("stripe-hosted"), stripeHostedAdapterSpecificity);
  },
  locate(page: PageProbe): AnchorSet | null {
    return locateAdapterAnchors(page, BUNDLED_CONFIG.adapters.get("stripe-hosted"));
  },
  extract(anchors: AnchorSet, core: ExtractionCore): EngineState {
    return extractAdapterAnchors(anchors, BUNDLED_CONFIG.adapters.get("stripe-hosted"), core);
  },
};
