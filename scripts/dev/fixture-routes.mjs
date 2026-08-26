// The route table the local fixture server (serve-fixtures.mjs) serves
// from, and the SAME table tests/static/dev-fixture-routes.test.ts checks
// against the real, committed fixture files on disk. Every `file` entry
// below points directly at a file already committed under
// tests/fixtures/dom/ -- most of them are the exact bytes an existing
// Vitest suite already asserts extraction results against (see each
// entry's `pairedTest`); none of them is a copy, so what the founder
// clicks through in a browser and what the suite asserts on cannot drift.
//
// Only `path` (the served URL) is chosen freely -- it does not have to
// match the file's location on disk. src/engine/pre-gate.ts and
// src/engine/generic-lexicon.ts's GENERIC_CHECKOUT_PATH_PATTERNS key off
// the URL a page is served at, not where its HTML happens to live in this
// repo, so each route below is served at whatever URL actually exercises
// the detection signal it is meant to demonstrate.
import { DEV_ADAPTER_PATH_PREFIX } from "../lib/dev-build.mjs";

export const FIXTURE_ROUTES = [
  {
    path: "/checkout/summary",
    file: "tests/fixtures/dom/generic-checkout/full-flow-no-elevation.html",
    label: "Full installment offer (generic path, no elevation needed)",
    describes:
      'An invented shop\'s checkout with a "pay in 4" cluster: an order total, count, cadence ' +
      "and per-payment amount, detected purely through src/engine/generic-detector.ts's path + " +
      "label + instalment-phrase signals -- no adapter host match involved, so this reaches the " +
      "same terminal state at this server's ordinary default port as it would at any other. " +
      "Detection, the pre-filled manual-entry sheet, and the calendar all run end to end -- this " +
      "is the path that had never run in a real browser before this fixture, and needs no " +
      "elevated bind to try. See the adapter-matched fixture below for the port-80-only case, " +
      "which additionally exercises adapter-specific selectors this generic path does not.",
    pairedTest: "tests/unit/engine/generic-full-flow-fixture.test.ts",
  },
  {
    path: DEV_ADAPTER_PATH_PREFIX,
    file: "tests/fixtures/dom/adapters/shopify-checkout/full-confirmable.html",
    label: "Full installment offer via the real adapter code (port 80 only)",
    describes:
      'The same shape of "pay in 4" cluster, matched instead through the dev-only ' +
      "shopify-checkout override (scripts/lib/dev-build.mjs) -- the same adapter code and " +
      "selectors that already match checkout.shopify.com in production, with 'localhost' added " +
      "as a second host. This is the ONE fixture that needs the server bound to port 80 " +
      "specifically (a browser only omits the port from `location.host` at http's own default) " +
      "-- see CONTRIBUTING.md. Everything else, including the fixture above, needs no elevation " +
      "at all. Its value here is exercising adapter-specific selectors and the one-click " +
      "confirmation sheet, which the generic path above deliberately does not reach.",
    pairedTest: "tests/unit/engine/adapters.test.ts",
  },
  {
    path: "/checkout/still-loading",
    file: "tests/fixtures/dom/degraded-unconfirmed/checkout-shell-no-affordance.html",
    label: "Degraded / unconfirmed",
    describes:
      "A plausible checkout page with an order summary but no payment-method affordance yet. " +
      "The panel discloses that it cannot confirm anything, rather than staying silent.",
    pairedTest: "tests/unit/engine/degraded-unconfirmed-fixture.test.ts",
  },
  {
    path: "/gp/buy/spc/handlers/display.html",
    file: "tests/fixtures/dom/order-total-suggestion/amazon-order-summary-trailing-colon.html",
    label: "Amazon-shaped totals block",
    describes:
      "Items / Shipping & Handling / Estimated GST-HST / Estimated PST-RST-QST / Order Total, " +
      "each with a trailing colon -- the exact shape that motivated the order-total suggestion. " +
      'Open "Add a plan" to see the total offered back to you.',
    pairedTest: "tests/unit/engine/order-total-suggestion.test.ts",
  },
  {
    path: "/checkout/review",
    file: "tests/fixtures/dom/order-total-suggestion/disagreeing-order-total-rows.html",
    label: "Two disagreeing totals",
    describes:
      'Two visible "Order Total" rows carrying two different amounts. The suggested total ' +
      "must stay blank -- never a guess, never the first one found.",
    pairedTest: "tests/unit/engine/order-total-suggestion.test.ts",
  },
  {
    path: "/checkout/paiement",
    file: "tests/fixtures/dom/order-total-suggestion/trailing-colon-fr.html",
    label: "French locale",
    describes: '"Total de la commande :" (a space before the colon) still resolves to a suggestion.',
    pairedTest: "tests/unit/engine/order-total-suggestion.test.ts",
  },
  {
    path: "/checkout/off-topic-page",
    file: "tests/fixtures/dom/no-checkout/unrelated-article-page.html",
    label: "Non-checkout page on a checkout-ish path",
    describes:
      "An ordinary article, served at a URL that merely looks like a checkout. Confirms that " +
      "nothing inappropriate ever appears here.",
    pairedTest: "tests/unit/engine/generic-detector.test.ts",
  },
];
