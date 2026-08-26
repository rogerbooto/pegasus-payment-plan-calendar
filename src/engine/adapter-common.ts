/**
 * Shared match/locate/extract logic for every platform adapter (the design spec:
 * "never one adapter per merchant" -- here, not even duplicated per
 * *platform*). Each of src/engine/adapters/{shopify-checkout,stripe-hosted,
 * whop}.ts is a thin composition over this module and its own entry in the
 * bundled config (src/config/adapters.config.json); none of them
 * re-implements matching, anchor location or extraction, and none of them
 * contains a single hardcoded selector.
 */
import type { AdapterConfig } from "../config/loader";
import type { AnchorSet, ExtractionCore, MatchResult, PageProbe } from "./types";
import type { Cadence, Currency, EngineState, PartialCandidate, SoftSignal } from "../shared/types";
import type { Cents } from "../shared/money";
import { locateByCssOrLabel, locateInstalmentCluster, locateProviderWidget, matchClusterElement } from "./extraction-helpers";
import { resolveCadencePhrase } from "./cadence";
import { gradeCandidate } from "../parser/confidence";
import { INSTALLMENT_COUNT_MAX, INSTALLMENT_COUNT_MIN } from "../shared/constants";

function normalizedText(el: Element): string {
  return (el.textContent ?? "").trim().replace(/\s+/g, " ");
}

/**
 * Cheap structural fingerprint: host + path-prefix (both from the bundled,
 * validated config) plus one CSS probe. O(small-constant) -- the probe only
 * runs the adapter's own (length-capped) selector lists, never a page-wide
 * scan. `config === undefined` means the bundled config failed validation
 * for this adapter (src/config/loader.ts); per the design spec that disables the
 * adapter entirely -- `match` reports no match, and the engine falls
 * through to the generic detector exactly as if the platform weren't
 * covered at all.
 */
export function matchAdapterConfig(
  page: PageProbe,
  config: AdapterConfig | undefined,
  specificity: number,): MatchResult {
  if (!config) return { matched: false, specificity };
  if (!config.hosts.includes(page.host)) return { matched: false, specificity };
  if (!config.pathPatterns.some((prefix) => page.path.startsWith(prefix))) return { matched: false, specificity };
  const probeHit =
    config.anchors.orderTotal.css.some((sel) => page.querySelectorAll(sel).length > 0) ||
    config.anchors.bnplWidget.css.some((sel) => page.querySelectorAll(sel).length > 0);
  return { matched: probeHit, specificity };
}

/**
 * Finds the order-summary / instalment-cluster / provider-widget anchors,
 * data-driven entirely from the adapter's config entry. Returns null when
 * nothing at all was found (config missing/disabled, or none of the three
 * anchors are present on this page) -- the caller (src/engine/engine.ts)
 * treats that as a locate() failure and falls back to the generic detector.
 */
export function locateAdapterAnchors(page: PageProbe, config: AdapterConfig | undefined): AnchorSet | null {
  if (!config) return null;
  const orderTotal =
    locateByCssOrLabel(page, config.anchors.orderTotal.css, config.anchors.orderTotal.labelLexicon)?.element ?? null;
  const providerWidget = locateProviderWidget(page, config.anchors.bnplWidget.css, config.anchors.bnplWidget.iframeOrigins);
  const installmentCluster = locateInstalmentCluster(page, config.anchors.installmentText.patterns)?.element ?? null;
  if (!orderTotal && !providerWidget && !installmentCluster) return null;
  return { orderTotal, installmentCluster, providerWidget };
}

const PLACEHOLDER_CONFIDENCE = { hardGatesPassed: false, softScore: 0, signals: [] as SoftSignal[] };

/**
 * Extracts the four scalars from already-located anchors, through the
 * injected ExtractionCore only -- this function locates
 * nothing itself and decides no adapter-specific business rule; it is the
 * one place all three adapters turn `AnchorSet` + config patterns into an
 * `EngineState`.
 */
export function extractAdapterAnchors(
  anchors: AnchorSet,
  config: AdapterConfig | undefined,
  core: ExtractionCore,): EngineState {
  if (!config) return { kind: "DEGRADED", reason: "adapter_error" };

  const signals: SoftSignal[] = ["adapter_path"];
  let orderTotalCents: Cents | undefined;
  let currency: Currency | undefined;
  let installmentCount: number | undefined;
  let cadence: Cadence | undefined;
  let perInstallmentCents: Cents | undefined;

  if (anchors.orderTotal) {
    const normalized = core.normalizeText(normalizedText(anchors.orderTotal));
    if (normalized.kind === "ok") {
      const parsed = core.parseMoney(normalized.text);
      if (parsed.kind === "parsed") {
        orderTotalCents = parsed.cents;
        currency = parsed.currency;
        signals.push("labelled_total_row");
      }
    }
  }

  if (anchors.installmentCluster) {
    const match = matchClusterElement(anchors.installmentCluster, config.anchors.installmentText.patterns);
    if (match) {
      const countNum = parseInt(match.countRaw, 10);
      if (Number.isSafeInteger(countNum) && countNum >= INSTALLMENT_COUNT_MIN && countNum <= INSTALLMENT_COUNT_MAX) {
        installmentCount = countNum;
      }

      const resolvedCadence = resolveCadencePhrase(match.cadenceRaw);
      if (resolvedCadence) cadence = resolvedCadence;

      const normalizedMoney = core.normalizeText(match.moneyRaw);
      if (normalizedMoney.kind === "ok") {
        const parsedPer = core.parseMoney(normalizedMoney.text);
        if (parsedPer.kind === "parsed") {
          // Cross-scalar currency ambiguity is refused, never picked (same
          // "ambiguity fails" posture as hard gate 2 within a single scalar).
          if (currency === undefined) {
            currency = parsedPer.currency;
            perInstallmentCents = parsedPer.cents;
            signals.push("bound_cluster");
          } else if (currency === parsedPer.currency) {
            perInstallmentCents = parsedPer.cents;
            signals.push("bound_cluster");
          }
        }
      }
    }
  }

  if (anchors.providerWidget) signals.push("provider_widget");

  if (
    orderTotalCents !== undefined &&
    perInstallmentCents !== undefined &&
    installmentCount !== undefined &&
    !core.arithmeticConsistent(installmentCount, perInstallmentCents, orderTotalCents)) {
    // Hard gate 3 failure (the design spec / D3 T07): drop the money pair; count
    // and cadence may still stand alone as passing scalars.
    orderTotalCents = undefined;
    perInstallmentCents = undefined;
  }

  const candidate: PartialCandidate = {
    orderTotalCents,
    installmentCount,
    cadence,
    perInstallmentCents,
    currency,
    confidence: PLACEHOLDER_CONFIDENCE,
  };
  return gradeCandidate({ candidate, signals });
}
