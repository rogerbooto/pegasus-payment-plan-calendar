/**
 * scripts/dev/fixture-routes.mjs is the single source of truth both
 * scripts/dev/serve-fixtures.mjs (what the founder browser-tests against)
 * and this file read from. Every route's `file` must point at a real,
 * committed fixture that already exists under tests/fixtures/dom/ --
 * never a copy, never a path that silently stops resolving.
 *
 * RED when: a route's file is renamed/removed without updating this
 * table, a route's URL stops containing the checkout-shaped substring it
 * needs (for the routes that rely on src/engine/generic-lexicon.ts's
 * GENERIC_CHECKOUT_PATH_PATTERNS), or two routes collide on the same URL.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { FIXTURE_ROUTES } from "../../scripts/dev/fixture-routes.mjs";
import { DEV_ADAPTER_PATH_PREFIX } from "../../scripts/lib/dev-build.mjs";

const GENERIC_CHECKOUT_PATH_SUBSTRINGS = ["/checkout", "/checkouts/", "/pay/", "/order/confirm", "/gp/buy/", "/gp/cart/desktop/go-to-checkout"];

describe("FIXTURE_ROUTES -- every entry resolves to a real, committed fixture file", () => {
  it("liveness -- the table is non-empty and covers at least the six documented scenarios", () => {
    expect(FIXTURE_ROUTES.length).toBeGreaterThanOrEqual(6);
  });

  it.each(FIXTURE_ROUTES.map((r) => [r.path, r.file] as const))("%s -> %s exists on disk and is non-empty", (_path, file) => {
    const full = join(process.cwd(), file);
    expect(existsSync(full), file).toBe(true);
    expect(readFileSync(full, "utf-8").length).toBeGreaterThan(0);
  });

  it("no two routes share the same served path", () => {
    const paths = FIXTURE_ROUTES.map((r) => r.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("every fixture file lives under tests/fixtures/dom/ -- the one canonical corpus, never a separate browser-only copy", () => {
    for (const route of FIXTURE_ROUTES) {
      expect(route.file.startsWith("tests/fixtures/dom/"), route.file).toBe(true);
    }
  });

  it("the primary (full installment offer) route is served at exactly DEV_ADAPTER_PATH_PREFIX -- the one path the dev-only shopify-checkout override actually matches", () => {
    const primary = FIXTURE_ROUTES.find((r) => r.file.endsWith("full-confirmable.html"));
    expect(primary?.path).toBe(DEV_ADAPTER_PATH_PREFIX);
  });

  it("every route that depends on the generic path-shape signal (i.e. not the primary adapter-matched one) is served at a URL containing a real GENERIC_CHECKOUT_PATH_PATTERNS substring, so the panel is never silently dormant", () => {
    for (const route of FIXTURE_ROUTES) {
      if (route.path === DEV_ADAPTER_PATH_PREFIX) continue; // adapter-matched, doesn't need the loose path lexicon
      const hasSubstring = GENERIC_CHECKOUT_PATH_SUBSTRINGS.some((s) => route.path.includes(s));
      expect(hasSubstring, `${route.path} has no checkout-shaped substring`).toBe(true);
    }
  });

  it("each route file is real HTML with no <script> tag and no remote asset reference (a static fixture document, never executable, never network-fetching)", () => {
    for (const route of FIXTURE_ROUTES) {
      const html = readFileSync(join(process.cwd(), route.file), "utf-8");
      expect(html, route.file).not.toMatch(/<script/i);
      expect(html, route.file).not.toMatch(/https?:\/\//i);
    }
  });
});
