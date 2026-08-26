// @vitest-environment jsdom
/**
 * scripts/lib/fixture-port.mjs is the single source of truth for the
 * local fixture server's port, shared by `npm run build:dev`
 * (scripts/build-dev.mjs) and `npm run serve:fixtures`
 * (scripts/dev/serve-fixtures.mjs). This file pins three things:
 *
 *  1. The pure port-resolution/comparison functions behave correctly in
 *     isolation (default, override, invalid input, mismatch reporting).
 *  2. Neither consuming script re-introduces a private, driftable port
 *     literal of its own -- both are statically confirmed to resolve the
 *     port through this shared module (a real regression -- a hardcoded
 *     `const PORT = 8080` reappearing directly in either script -- would
 *     turn this test RED; see its own liveness check).
 *  3. The actual, verified reason a port can never be baked into the
 *     dev-only adapter host list: feeding a port-bearing host string
 *     through the REAL, unmodified src/config/loader.ts validator
 *     disables the whole adapter it's attached to, and a real browser at
 *     the new default port (8080) genuinely does not reach the
 *     adapter-matched state -- both demonstrated against the real
 *     production code paths, not asserted from a comment.
 *
 * RED when: the default port changes without both scripts changing with
 * it, either script stops importing from this module, or the dev-only
 * adapter host derivation starts trying to encode a port (which breaks
 * validation -- this file is what pins that down as a known, permanent
 * constraint rather than something a future "fix" quietly reintroduces).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  canReachAdapterMatchedFixture,
  DEFAULT_FIXTURE_PORT,
  describeFixturePortMismatch,
  HTTP_DEFAULT_PORT,
  resolveFixturePort,
} from "../../scripts/lib/fixture-port.mjs";
import { buildDevMeta, deriveDevAdaptersConfig, DEV_ADAPTER_HOST, DEV_ADAPTER_PATH_PREFIX } from "../../scripts/lib/dev-build.mjs";
import { validateConfig } from "../../src/config/loader";
import { matchAdapterConfig } from "../../src/engine/adapter-common";
import { shopifyCheckoutAdapterSpecificity } from "../../src/engine/adapters/shopify-checkout";
import { mountFixture } from "../support/dom-fixture";
import { pageProbeFor } from "../support/page-probe";

const shippingAdaptersConfig = JSON.parse(
  readFileSync(join(process.cwd(), "src", "config", "adapters.config.json"), "utf-8"),
) as { adapters: Record<string, { hosts: string[]; pathPatterns: string[] }> };

describe("resolveFixturePort -- the one place PPC_FIXTURE_PORT is read", () => {
  it("defaults to DEFAULT_FIXTURE_PORT (8080) when unset", () => {
    expect(resolveFixturePort({})).toBe(DEFAULT_FIXTURE_PORT);
    expect(DEFAULT_FIXTURE_PORT).toBe(8080);
  });

  it("defaults when the env var is present but empty/whitespace", () => {
    expect(resolveFixturePort({ PPC_FIXTURE_PORT: "" })).toBe(DEFAULT_FIXTURE_PORT);
    expect(resolveFixturePort({ PPC_FIXTURE_PORT: "   " })).toBe(DEFAULT_FIXTURE_PORT);
  });

  it("honours a valid override", () => {
    expect(resolveFixturePort({ PPC_FIXTURE_PORT: "3000" })).toBe(3000);
    expect(resolveFixturePort({ PPC_FIXTURE_PORT: String(HTTP_DEFAULT_PORT) })).toBe(HTTP_DEFAULT_PORT);
  });

  it("fails loudly, naming the bad value, rather than silently producing NaN", () => {
    expect(() => resolveFixturePort({ PPC_FIXTURE_PORT: "not-a-port" })).toThrow(/not-a-port/);
    expect(() => resolveFixturePort({ PPC_FIXTURE_PORT: "-5" })).toThrow(/-5/);
    expect(() => resolveFixturePort({ PPC_FIXTURE_PORT: "0" })).toThrow();
    expect(() => resolveFixturePort({ PPC_FIXTURE_PORT: "8080.5" })).toThrow();
  });
});

describe("canReachAdapterMatchedFixture / describeFixturePortMismatch -- pure comparisons", () => {
  it("is true ONLY at HTTP_DEFAULT_PORT", () => {
    expect(canReachAdapterMatchedFixture(HTTP_DEFAULT_PORT)).toBe(true);
    expect(canReachAdapterMatchedFixture(DEFAULT_FIXTURE_PORT)).toBe(false);
    expect(canReachAdapterMatchedFixture(3000)).toBe(false);
  });

  it("reports no mismatch when the ports agree", () => {
    expect(describeFixturePortMismatch(8080, 8080)).toBeNull();
    expect(describeFixturePortMismatch(80, 80)).toBeNull();
  });

  it("names BOTH ports in an actionable message when they disagree", () => {
    const message = describeFixturePortMismatch(8080, 9000);
    expect(message).toContain("8080");
    expect(message).toContain("9000");
  });
});

describe("buildDevMeta (scripts/lib/dev-build.mjs) -- pure function of the resolved port, no filesystem", () => {
  it("records the port and correctly derives reachability at the new default (8080)", () => {
    expect(buildDevMeta(DEFAULT_FIXTURE_PORT)).toEqual({
      expectedFixturePort: DEFAULT_FIXTURE_PORT,
      primaryFixtureAdapterMatchable: false,
    });
  });

  it("flips to reachable only at HTTP_DEFAULT_PORT", () => {
    expect(buildDevMeta(HTTP_DEFAULT_PORT)).toEqual({
      expectedFixturePort: HTTP_DEFAULT_PORT,
      primaryFixtureAdapterMatchable: true,
    });
  });
});

describe("build-dev.mjs and serve-fixtures.mjs both resolve the port through scripts/lib/fixture-port.mjs -- never a private literal", () => {
  const buildDevSrc = readFileSync(join(process.cwd(), "scripts", "build-dev.mjs"), "utf-8");
  const serveFixturesSrc = readFileSync(join(process.cwd(), "scripts", "dev", "serve-fixtures.mjs"), "utf-8");

  // A hardcoded port assignment shaped like the one this refactor removed
  // from both files (`const DEFAULT_PORT = 80;` / `const PORT = ...`
  // assigned to a bare numeric literal, not a call).
  const HARDCODED_PORT_LITERAL = /\b(?:const|let)\s+\w*PORT\w*\s*=\s*\d+\s*;/;

  it("liveness -- the hardcoded-literal pattern actually matches the shape it exists to catch", () => {
    expect(HARDCODED_PORT_LITERAL.test("const DEFAULT_PORT = 80;")).toBe(true);
    expect(HARDCODED_PORT_LITERAL.test("const PORT = 8080;")).toBe(true);
    expect(HARDCODED_PORT_LITERAL.test("const PORT = resolveFixturePort();")).toBe(false);
  });

  it("scripts/build-dev.mjs imports resolveFixturePort from the shared module and contains no private port literal", () => {
    expect(buildDevSrc).toMatch(/from\s+"\.\/lib\/fixture-port\.mjs"/);
    expect(buildDevSrc).toContain("resolveFixturePort");
    expect(HARDCODED_PORT_LITERAL.test(buildDevSrc)).toBe(false);
  });

  it("scripts/dev/serve-fixtures.mjs imports resolveFixturePort from the shared module and contains no private port literal", () => {
    expect(serveFixturesSrc).toMatch(/from\s+"\.\.\/lib\/fixture-port\.mjs"/);
    expect(serveFixturesSrc).toContain("resolveFixturePort");
    expect(HARDCODED_PORT_LITERAL.test(serveFixturesSrc)).toBe(false);
  });
});

describe("regression: a port can never be spelled into the shopify-checkout adapter's hosts list", () => {
  it("src/config/loader.ts's validateConfig disables the WHOLE adapter when a hosts entry carries a port -- proving DEV_ADAPTER_HOST must stay a bare hostname", () => {
    const devConfig = deriveDevAdaptersConfig(shippingAdaptersConfig) as {
      adapters: Record<string, { hosts: string[]; pathPatterns: string[]; anchors: unknown }>;
    };
    const poisoned = {
      ...devConfig,
      adapters: {
        ...devConfig.adapters,
        "shopify-checkout": {
          ...devConfig.adapters["shopify-checkout"]!,
          hosts: [...devConfig.adapters["shopify-checkout"]!.hosts, "localhost:8080"],
        },
      },
    };
    // Manifest coverage isn't the thing under test here -- include the
    // port-bearing host so the ONLY possible failure is the charset check.
    const manifestHosts = [...poisoned.adapters["shopify-checkout"]!.hosts];
    const validated = validateConfig(poisoned, manifestHosts);

    expect(validated.adapters.has("shopify-checkout")).toBe(false);
    const failure = validated.disabled.find((d) => d.id === "shopify-checkout");
    expect(failure?.errors).toEqual(expect.arrayContaining([expect.stringContaining("invalid host localhost:8080")]));
  });

  it("the SAME adapter, with only the real bare-hostname override, validates cleanly", () => {
    const devConfig = deriveDevAdaptersConfig(shippingAdaptersConfig);
    const manifestHosts = [...(devConfig as { adapters: Record<string, { hosts: string[] }> }).adapters["shopify-checkout"]!.hosts];
    const validated = validateConfig(devConfig, manifestHosts);
    expect(validated.adapters.has("shopify-checkout")).toBe(true);
  });

  it("at the new default port (8080), a real browser's location.host genuinely does NOT reach the adapter-matched state -- only HTTP_DEFAULT_PORT's bare-'localhost' shape does", () => {
    const devConfig = deriveDevAdaptersConfig(shippingAdaptersConfig);
    const manifestHosts = [...(devConfig as { adapters: Record<string, { hosts: string[] }> }).adapters["shopify-checkout"]!.hosts];
    const validated = validateConfig(devConfig, manifestHosts);
    const config = validated.adapters.get("shopify-checkout");
    const doc = mountFixture("adapters/shopify-checkout", "full-confirmable");

    const at8080 = pageProbeFor(doc, `${DEV_ADAPTER_HOST}:${DEFAULT_FIXTURE_PORT}`, DEV_ADAPTER_PATH_PREFIX);
    expect(matchAdapterConfig(at8080, config, shopifyCheckoutAdapterSpecificity).matched).toBe(false);

    const atHttpDefault = pageProbeFor(doc, DEV_ADAPTER_HOST, DEV_ADAPTER_PATH_PREFIX);
    expect(matchAdapterConfig(atHttpDefault, config, shopifyCheckoutAdapterSpecificity).matched).toBe(true);
  });
});
