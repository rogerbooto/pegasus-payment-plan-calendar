/**
 * Platform adapter: shopify-checkout. Shopify controls this DOM as a single
 * vendor (post-Checkout-Extensibility, merchants can no longer arbitrarily
 * rewrite checkout DOM), which is why this is the flagship launch adapter
 * covering the largest merchant long tail from one parser.
 *
 * Every selector, host and pattern this adapter uses is DATA, read from the
 * bundled, validated config (src/config/adapters.config.json via
 * src/config/bundled.ts) -- there is no hardcoded selector soup here, and
 * match/locate/extract are all implemented once, shared with the other two
 * launch adapters, in src/engine/adapter-common.ts.
 */
import type { EngineState } from "../../shared/types";
import type { AnchorSet, CheckoutAdapter, ExtractionCore, MatchResult, PageProbe } from "../types";
import { CONFIG_SCHEMA_VERSION } from "../../shared/constants";
import { BUNDLED_CONFIG } from "../../config/bundled";
import { extractAdapterAnchors, locateAdapterAnchors, matchAdapterConfig } from "../adapter-common";

/** Static, never computed from page data. Highest of the three: Shopify is the flagship. */
export const shopifyCheckoutAdapterSpecificity = 30;

export const shopifyCheckoutAdapter: CheckoutAdapter = {
  id: "shopify-checkout",
  configSchemaVersion: CONFIG_SCHEMA_VERSION,
  match(page: PageProbe): MatchResult {
    return matchAdapterConfig(
      page,
      BUNDLED_CONFIG.adapters.get("shopify-checkout"),
      shopifyCheckoutAdapterSpecificity,);
  },
  locate(page: PageProbe): AnchorSet | null {
    return locateAdapterAnchors(page, BUNDLED_CONFIG.adapters.get("shopify-checkout"));
  },
  extract(anchors: AnchorSet, core: ExtractionCore): EngineState {
    return extractAdapterAnchors(anchors, BUNDLED_CONFIG.adapters.get("shopify-checkout"), core);
  },
};
