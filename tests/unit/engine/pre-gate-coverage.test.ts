/**
 * @vitest-environment jsdom
 *
 * The pre-gate decides whether it is worth attaching an observer at all. If it
 * says no, nothing happens on the page — no panel, no honest "we don't
 * recognize this checkout" message, nothing.
 *
 * That silence is the failure this file guards against. Where the extension
 * holds a host permission, staying quiet is worse than saying plainly that it
 * cannot read the page: the user gets no way to distinguish "nothing to show
 * here" from "this is broken".
 *
 * So: every host in the manifest must be reachable by the pre-gate on a
 * realistic checkout path for that host. Amazon is the case that motivated this
 * — its checkout path contains no form of the word "checkout", so it was
 * silently dormant while sitting in the host list.
 *
 * RED when: a manifest host gains no matching path pattern, or a pattern is
 * removed from the lexicon while its host stays in the manifest.
 */
import { describe, expect, it } from "vitest";
import manifest from "../../../src/manifest.json";
import { cheapPreGate, looksLikeCheckoutPath } from "../../../src/engine/pre-gate";
import type { PageProbe } from "../../../src/engine/types";

const PAYMENT_AFFORDANCE =
  '<form><input type="radio" name="payment-method"><button>Place your order</button></form>';

function probe(host: string, path: string, html = PAYMENT_AFFORDANCE): PageProbe {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  return {
    host,
    path,
    querySelector: (s) => doc.querySelector(s),
    querySelectorAll: (s) => Array.from(doc.querySelectorAll(s)),
  };
}

/** A realistic checkout path for each host the manifest asks permission for. */
const REALISTIC_CHECKOUT_PATH: Readonly<Record<string, string>> = {
  "checkout.shopify.com": "/checkouts/c/abc123",
  "shop.app": "/checkout/xyz",
  "checkout.stripe.com": "/c/pay/cs_test_a1b2c3",
  "whop.com": "/checkout/plan_abc",
  "www.amazon.com": "/gp/buy/spc/handlers/display.html",
  "www.amazon.ca": "/gp/cart/desktop/go-to-checkout.html",
};

const manifestHosts = (manifest.host_permissions as string[]).map((h) =>
  h.replace(/^https?:\/\//, "").replace(/\/\*$/, ""),
);

describe("pre-gate reaches every host the manifest asks for", () => {
  it("liveness — the manifest actually declares hosts (an empty list must not pass vacuously)", () => {
    expect(manifestHosts.length).toBeGreaterThanOrEqual(4);
  });

  it("every manifest host has a realistic path in this table (a new host must be added here)", () => {
    const missing = manifestHosts.filter((h) => !(h in REALISTIC_CHECKOUT_PATH));
    expect(missing).toEqual([]);
  });

  it.each(manifestHosts)("%s is not silently dormant on its own checkout path", (host) => {
    const path = REALISTIC_CHECKOUT_PATH[host];
    // Explicit rather than a non-null assertion: if the table ever drifts from
    // the manifest, this should fail saying so, not fail somewhere downstream.
    if (path === undefined) throw new Error(`no realistic checkout path recorded for host: ${host}`);
    expect(cheapPreGate(probe(host, path))).toBe(true);
  });

  it("a page that is not a checkout stays dormant (proves the gate is not always-true)", () => {
    expect(cheapPreGate(probe("example.com", "/blog/a-post", "<p>hello</p>"))).toBe(false);
  });
});

/**
 * `cheapPreGate` failing is not the end of the story: `looksLikeCheckoutPath`
 * is the weaker, cheaper half of the same decision, and it is what
 * lifecycle.ts checks before letting a session go fully silent (see
 * src/engine/lifecycle.ts's evaluatePreGate and DegradeReason's
 * "unconfirmed" in src/shared/types.ts). This block pins the PRINCIPLE, not
 * a symptom: for any host we hold permission for, a path that matches the
 * lexicon is never `cheapPreGate: false` AND `looksLikeCheckoutPath: false`
 * at once. Deliberately independent of PAYMENT_AFFORDANCE_SELECTORS'
 * contents -- these fixtures carry NO markup at all, so the assertion holds
 * regardless of what that list contains or how it changes.
 */
describe("looksLikeCheckoutPath — the structural signal that keeps a matched path from going fully silent", () => {
  it.each(manifestHosts)(
    "%s on its own realistic checkout path with NO affordance markup: cheapPreGate is strict (false) but looksLikeCheckoutPath still says something is worth reporting (true)",
    (host) => {
      const path = REALISTIC_CHECKOUT_PATH[host];
      if (path === undefined) throw new Error(`no realistic checkout path recorded for host: ${host}`);
      const bareProbe = probe(host, path, "<p>no payment affordance markup on this page at all</p>");
      expect(cheapPreGate(bareProbe)).toBe(false);
      expect(looksLikeCheckoutPath(bareProbe)).toBe(true);
    },
  );

  /**
   * Concrete case: the founder's reported URL shape
   * (`/checkout/p/<redacted>/spc`), matched by the plain "/checkout" path
   * pattern rather than either of the Amazon-specific "/gp/..." patterns
   * already covered above. This pins the reported shape as a regression
   * fixture; it does NOT assert the underlying report is resolved -- that
   * is unconfirmed pending the console diagnostic and a live retest.
   */
  it("an Amazon-shaped checkout URL (/checkout/p/.../spc) with no affordance markup: looksLikeCheckoutPath is still true", () => {
    const bareProbe = probe("www.amazon.ca", "/checkout/p/D1EF2C34AB56/spc", "<p>still rendering</p>");
    expect(cheapPreGate(bareProbe)).toBe(false);
    expect(looksLikeCheckoutPath(bareProbe)).toBe(true);
  });

  it("a page that is not a checkout at all: looksLikeCheckoutPath agrees with cheapPreGate (both false) — proves this is not always-true either", () => {
    const bareProbe = probe("example.com", "/blog/a-post", "<p>hello</p>");
    expect(cheapPreGate(bareProbe)).toBe(false);
    expect(looksLikeCheckoutPath(bareProbe)).toBe(false);
  });
});
