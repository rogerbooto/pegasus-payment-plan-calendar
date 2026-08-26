/**
 * Bundled constants for the GENERIC detector only. These are
 * deliberately NOT platform selectors and do not live in
 * src/config/adapters.config.json: the generic detector's whole reason to
 * exist is that it needs no merchant- or platform-specific selector. The
 * instalment phrase patterns below use the same restricted token language
 * as the bundled adapter config (compiled by src/engine/pattern-compiler.ts)
 * so the count+amount+cadence binding rule has exactly one implementation,
 * shared by every extraction path.
 */

/** Loosely matched (substring) against the page path -- the generic path is a fallback, not a fingerprint. */
export const GENERIC_CHECKOUT_PATH_PATTERNS: readonly string[] = [
  "/checkout",
  "/checkouts/",
  "/pay/",
  "/order/confirm",
];

/** EN/FR, CA+US geography (the design spec(i)). Exact (trimmed, case-insensitive) label match only. */
export const GENERIC_ORDER_TOTAL_LABEL_LEXICON: readonly string[] = [
  "total",
  "order total",
  "montant total",
  "total de la commande",
];

/**
 * Payment affordance: role/structure only, never a form value. A radio
 * group or provider-origin iframe is read for its existence and origin,
 * never its contents.
 */
export const PAYMENT_AFFORDANCE_SELECTORS: readonly string[] = [
  '[role="radiogroup"]',
  'input[type="radio"][name*="payment" i]',
  "form[data-payment-method]",
  'form[data-testid*="payment" i]',
  'iframe[src*="js.stripe.com"]',
  'iframe[src*="checkout.stripe.com"]',
];

/**
 * Provider-controlled BNPL widget markers -- the most stable selectors in
 * the whole system, because the provider (not the merchant) controls them.
 */
export const GENERIC_PROVIDER_WIDGET_CSS: readonly string[] = [
  "klarna-placement",
  "afterpay-placement",
  '[class*="affirm-as-low-as" i]',
  '[class*="sezzle" i]',
];

export const GENERIC_PROVIDER_WIDGET_IFRAME_ORIGINS: readonly string[] = [
  "js.klarna.com",
  "static.klarnaservices.com",
  "js.afterpay.com",
  "cdn.affirm.com",
  "widget.sezzle.com",
];

/**
 * count + amount + cadence bound in one text cluster: a
 * free-floating amount and a count found in separate nodes are never
 * joined. Patterns lacking {cadence} still bind count+amount; cadence then
 * stays an unresolved (missing) scalar rather than a guess.
 */
export const GENERIC_INSTALLMENT_PHRASE_PATTERNS: readonly string[] = [
  "{count} interest-free payments of {money} {cadence}",
  "{count} payments of {money} {cadence}",
  "{count} interest-free payments of {money}",
  "{count} payments of {money}",
  "{count} versements sans intérêts de {money} {cadence}",
  "{count} versements de {money} {cadence}",
  "{count} versements sans intérêts de {money}",
  "{count} versements de {money}",
];
