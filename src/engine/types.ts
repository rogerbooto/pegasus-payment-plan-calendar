/**
 * The checkout-detection engine seams: one generic detector plus a small,
 * closed set of platform adapters, all funneled through one shared
 * extraction core. Adapters supply where to look; the core owns how a value
 * becomes a trusted integer-cent scalar. An adapter has no API through which
 * a fifth field could reach storage.
 */
import type { Cents } from "../shared/money";
import type { EngineState } from "../shared/types";
import type { MoneyParseResult } from "../parser/money";
import type { UnicodeResult } from "../parser/unicode";

/** Closed enum: adding an adapter is a code change shipped as a store update. */
export type AdapterId = "shopify-checkout" | "stripe-hosted" | "whop";

/**
 * The page as adapters see it. Adapters never touch `document` directly —
 * they receive a probe, which keeps them cheap to fixture-test and makes it
 * impossible for an adapter to acquire capabilities the engine didn't grant.
 */
export interface PageProbe {
  readonly host: string;
  readonly path: string;
  querySelector(selector: string): Element | null;
  querySelectorAll(selector: string): readonly Element[];
}

/** `specificity` is static per adapter, never computed from page data. */
export interface MatchResult {
  readonly matched: boolean;
  readonly specificity: number;
}

/** Where the order summary / installment cluster / provider widget anchors are. */
export interface AnchorSet {
  readonly orderTotal: Element | null;
  readonly installmentCluster: Element | null;
  readonly providerWidget: Element | null;
}

/**
 * The only way any adapter (or the generic detector) produces a scalar.
 * Implemented over src/parser/*; adapters cannot bypass it.
 */
export interface ExtractionCore {
  parseMoney(raw: string): MoneyParseResult;
  normalizeText(raw: string): UnicodeResult;
  isVisible(el: Element): boolean;
  arithmeticConsistent(
    installmentCount: number,
    perInstallmentCents: Cents,
    orderTotalCents: Cents,
  ): boolean;
}

export interface CheckoutAdapter {
  readonly id: AdapterId;
  /** Must match the bundled config it consumes (src/config). */
  readonly configSchemaVersion: number;
  /** Cheap structural fingerprint. No network, no storage, O(few) queries. */
  match(page: PageProbe): MatchResult;
  locate(page: PageProbe): AnchorSet | null;
  extract(anchors: AnchorSet, core: ExtractionCore): EngineState;
}
