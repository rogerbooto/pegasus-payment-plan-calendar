/**
 * The generic detector: structural heuristics that answer (i) is a checkout
 * present? and (ii) is a pay-in-installments option offered? It needs no
 * merchant-specific selector and is the universal fallback. Its extraction
 * path caps at PARTIAL unless every hard gate passes; its real job is to
 * make degradation specific and honest.
 */
import type { EngineState } from "../shared/types";
import type { Cadence, Currency, PartialCandidate, SoftSignal } from "../shared/types";
import type { Cents } from "../shared/money";
import type { ExtractionCore, PageProbe } from "./types";
import { parseMoneyToCents } from "../parser/money";
import { normalizeOrReject } from "../parser/unicode";
import { gradeCandidate } from "../parser/confidence";
import { resolveCadencePhrase } from "./cadence";
import { locateByCssOrLabel, locateInstalmentCluster, locateProviderWidget } from "./extraction-helpers";
import { INSTALLMENT_COUNT_MAX, INSTALLMENT_COUNT_MIN } from "../shared/constants";
import {
  GENERIC_CHECKOUT_PATH_PATTERNS,
  GENERIC_INSTALLMENT_PHRASE_PATTERNS,
  GENERIC_ORDER_TOTAL_LABEL_LEXICON,
  GENERIC_PROVIDER_WIDGET_CSS,
  GENERIC_PROVIDER_WIDGET_IFRAME_ORIGINS,
  PAYMENT_AFFORDANCE_SELECTORS,
} from "./generic-lexicon";

function normalizedText(el: Element): string {
  return (el.textContent ?? "").trim().replace(/\s+/g, " ");
}

/**
 * (i) Checkout presence -- score-based, all signals structural, none
 * merchant-specific (the design spec(i)). Requires at least two of the three signal
 * families (URL path, a labelled+money-parsing total row, a payment
 * affordance) so a single coincidental hit (e.g. an unrelated page whose
 * path happens to contain "/pay/") doesn't register as a checkout.
 */
export function detectCheckout(page: PageProbe): boolean {
  let score = 0;

  if (GENERIC_CHECKOUT_PATH_PATTERNS.some((pattern) => page.path.includes(pattern))) score += 1;

  const totalAnchor = locateByCssOrLabel(page, [], GENERIC_ORDER_TOTAL_LABEL_LEXICON);
  if (totalAnchor) {
    const normalized = normalizeOrReject(normalizedText(totalAnchor.element));
    if (normalized.kind === "ok" && parseMoneyToCents(normalized.text).kind === "parsed") score += 1;
  }

  if (PAYMENT_AFFORDANCE_SELECTORS.some((selector) => page.querySelectorAll(selector).length > 0)) score += 1;

  return score >= 2;
}

/**
 * (ii) BNPL option offered -- either signal family suffices to DETECT
 * (the design spec(ii)); both are independently checked, neither implies the other.
 */
export function detectInstallmentOffer(page: PageProbe): boolean {
  if (locateProviderWidget(page, GENERIC_PROVIDER_WIDGET_CSS, GENERIC_PROVIDER_WIDGET_IFRAME_ORIGINS)) {
    return true;
  }
  return locateInstalmentCluster(page, GENERIC_INSTALLMENT_PHRASE_PATTERNS) !== null;
}

const PLACEHOLDER_CONFIDENCE = { hardGatesPassed: false, softScore: 0, signals: [] as SoftSignal[] };

/**
 * Scalar extraction (generic path). Order total from the labelled
 * final-total row; count/cadence/per-instalment from the bound instalment
 * phrase cluster. The money/arithmetic half of the shared core
 * is used here, at extraction time, exactly as an adapter's extract() uses
 * it -- this function locates and binds text; it never itself decides what
 * counts as money or as a resolved currency.
 */
export function extractGeneric(page: PageProbe, core: ExtractionCore): EngineState {
  const signals: SoftSignal[] = [];

  let orderTotalCents: Cents | undefined;
  let currency: Currency | undefined;
  let installmentCount: number | undefined;
  let cadence: Cadence | undefined;
  let perInstallmentCents: Cents | undefined;

  const totalAnchor = locateByCssOrLabel(page, [], GENERIC_ORDER_TOTAL_LABEL_LEXICON);
  if (totalAnchor) {
    const normalized = core.normalizeText(normalizedText(totalAnchor.element));
    if (normalized.kind === "ok") {
      const parsed = core.parseMoney(normalized.text);
      if (parsed.kind === "parsed") {
        orderTotalCents = parsed.cents;
        currency = parsed.currency;
        signals.push("labelled_total_row");
      }
    }
  }

  const cluster = locateInstalmentCluster(page, GENERIC_INSTALLMENT_PHRASE_PATTERNS);
  if (cluster) {
    const countNum = parseInt(cluster.match.countRaw, 10);
    if (Number.isSafeInteger(countNum) && countNum >= INSTALLMENT_COUNT_MIN && countNum <= INSTALLMENT_COUNT_MAX) {
      installmentCount = countNum;
    }

    const resolvedCadence = resolveCadencePhrase(cluster.match.cadenceRaw);
    if (resolvedCadence) cadence = resolvedCadence;

    const normalizedMoney = core.normalizeText(cluster.match.moneyRaw);
    if (normalizedMoney.kind === "ok") {
      const parsedPer = core.parseMoney(normalizedMoney.text);
      if (parsedPer.kind === "parsed") {
        // A currency conflict between the total and the instalment amount
        // is ambiguity, same as within a single scalar -- refuse the pair
        // rather than pick one (hard gate 2's "ambiguity fails" posture,
        // applied across scalars).
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

  if (locateProviderWidget(page, GENERIC_PROVIDER_WIDGET_CSS, GENERIC_PROVIDER_WIDGET_IFRAME_ORIGINS)) {
    signals.push("provider_widget");
  }

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
