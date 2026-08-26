// @vitest-environment jsdom
/**
 * The local fixture-testing build's derivation logic
 * (scripts/lib/dev-build.mjs), exercised against the REAL, committed
 * src/manifest.json and src/config/adapters.config.json -- never a
 * hand-copied stand-in for either.
 *
 * Three things pinned here:
 *  1. deriveDevManifest's output differs from the shipping manifest ONLY
 *     in the expected ways (two added host permissions, one added
 *     content-script match, a version_name, a description suffix, a
 *     retitled action/name) -- every other field is untouched.
 *  2. deriveDevAdaptersConfig's output differs from the shipping adapter
 *     config ONLY in shopify-checkout's hosts/pathPatterns gaining one
 *     entry each -- every selector, label and pattern is untouched, and
 *     every OTHER adapter (stripe-hosted, whop) is untouched entirely.
 *  3. The end-to-end integration this whole mechanism exists for: feed
 *     the derived manifest + derived config into the REAL validator
 *     (src/config/loader.ts's validateConfig) and the REAL adapter
 *     matcher (src/engine/adapter-common.ts's matchAdapterConfig, which
 *     this PR does NOT modify), against the REAL committed
 *     full-confirmable.html fixture -- and confirm it reaches
 *     PARSED_CONFIRMABLE from a bare "localhost" page (the shape a
 *     browser reports when scripts/dev/serve-fixtures.mjs is bound to
 *     port 80), exactly as scripts/build-dev.mjs wires it live. This is
 *     also the proof that NEITHER src/config/bundled.ts NOR
 *     src/engine/adapter-common.ts needed to change: this test calls
 *     src/config/loader.ts's validateConfig directly, with a manifest-host
 *     derivation computed inline here (deliberately mirroring
 *     src/config/bundled.ts's own, UNCHANGED, https-only regex) rather
 *     than importing anything from that module.
 *
 * RED when: the dev manifest/config derivation stops being additive-only,
 * drifts to differ from shipping in an unreviewed way, or the localhost
 * override stops actually reaching PARSED_CONFIRMABLE end to end.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  deriveDevAdaptersConfig,
  deriveDevManifest,
  DEV_ADAPTER_HOST,
  DEV_ADAPTER_PATH_PREFIX,
  DEV_HOST_PATTERN_HTTP,
  DEV_HOST_PATTERN_HTTPS,
} from "../../scripts/lib/dev-build.mjs";
import { validateConfig } from "../../src/config/loader";
import { shopifyCheckoutAdapter, shopifyCheckoutAdapterSpecificity } from "../../src/engine/adapters/shopify-checkout";
import { matchAdapterConfig } from "../../src/engine/adapter-common";
import { extractionCore } from "../../src/engine/extraction-core";
import { mountFixture } from "../support/dom-fixture";
import { pageProbeFor } from "../support/page-probe";

const shippingManifest = JSON.parse(readFileSync(join(process.cwd(), "src", "manifest.json"), "utf-8")) as Record<string, unknown>;
const shippingAdaptersConfig = JSON.parse(
  readFileSync(join(process.cwd(), "src", "config", "adapters.config.json"), "utf-8"),) as Record<string, unknown>;

/**
 * Deliberately mirrors src/config/bundled.ts's own MANIFEST_HOSTS
 * derivation exactly (https-only scheme strip), rather than importing it
 * -- this test is the proof that the dev build works WITHOUT that module
 * changing at all. Duplicated on purpose: it is the assertion, not a
 * shortcut around one.
 */
function deriveManifestHostsForTest(hostPermissions: readonly string[]): string[] {
  return hostPermissions.map((pattern) => pattern.replace(/^https:\/\//, "").replace(/\/\*$/, ""));
}

describe("deriveDevManifest -- additive-only, differs from shipping ONLY in the expected ways", () => {
  const devManifest = deriveDevManifest(shippingManifest) as Record<string, unknown> & {
    host_permissions: string[];
    content_scripts: { matches: string[] }[];
  };

  it("liveness -- the shipping manifest actually has content to diff against (a broken read must not pass vacuously)", () => {
    expect((shippingManifest.host_permissions as string[]).length).toBeGreaterThan(0);
  });

  it("gains exactly TWO host permissions (the http one actually used for injection, and the inert https one that lets the unmodified bundled.ts regex derive a bare hostname), appended after the real ones", () => {
    const shippingHosts = shippingManifest.host_permissions as string[];
    expect(devManifest.host_permissions).toEqual([...shippingHosts, DEV_HOST_PATTERN_HTTPS, DEV_HOST_PATTERN_HTTP]);
  });

  it("gains exactly ONE content-script match -- the http pattern only, since that is the only one ever actually served -- appended after the real ones", () => {
    const shippingCs = (shippingManifest.content_scripts as { matches: string[]; js: string[]; run_at: string }[])[0]!;
    const devCs = devManifest.content_scripts[0]!;
    expect(devCs.matches).toEqual([...shippingCs.matches, DEV_HOST_PATTERN_HTTP]);
  });

  it("every OTHER top-level field (manifest_version, permissions, background, action.default_icon/default_popup, content_security_policy, icons, version) is byte-identical to shipping", () => {
    const UNCHANGED_KEYS = [
      "manifest_version",
      "version",
      "permissions",
      "background",
      "content_security_policy",
      "icons",
    ] as const;
    for (const key of UNCHANGED_KEYS) {
      expect(devManifest[key], key).toEqual(shippingManifest[key]);
    }
    const shippingAction = shippingManifest.action as Record<string, unknown>;
    const devAction = devManifest.action as Record<string, unknown>;
    expect(devAction.default_icon).toEqual(shippingAction.default_icon);
    expect(devAction.default_popup).toEqual(shippingAction.default_popup);
  });

  it("adds a version_name and a description suffix, and retitles name/action.default_title -- so chrome://extensions cannot be mistaken for the shipping build", () => {
    expect(devManifest.version_name).toBe(`${shippingManifest.version as string}-dev-fixtures`);
    expect(devManifest.name).not.toBe(shippingManifest.name);
    expect((devManifest.description as string).startsWith(shippingManifest.description as string)).toBe(true);
    const devAction = devManifest.action as Record<string, unknown>;
    const shippingAction = shippingManifest.action as Record<string, unknown>;
    expect(devAction.default_title).not.toBe(shippingAction.default_title);
  });

  it("never mutates the shipping manifest object passed in (no shared-reference surprise)", () => {
    const before = JSON.stringify(shippingManifest);
    deriveDevManifest(shippingManifest);
    expect(JSON.stringify(shippingManifest)).toBe(before);
  });
});

describe("deriveDevAdaptersConfig -- additive-only, touches ONLY shopify-checkout's hosts/pathPatterns", () => {
  const devConfig = deriveDevAdaptersConfig(shippingAdaptersConfig) as {
    adapters: Record<string, { hosts: string[]; pathPatterns: string[]; anchors: unknown }>;
  };
  const shippingAdapters = (shippingAdaptersConfig as { adapters: Record<string, { hosts: string[]; pathPatterns: string[]; anchors: unknown }> }).adapters;

  it("shopify-checkout gains exactly DEV_ADAPTER_HOST in hosts and DEV_ADAPTER_PATH_PREFIX in pathPatterns", () => {
    expect(devConfig.adapters["shopify-checkout"]!.hosts).toEqual([...shippingAdapters["shopify-checkout"]!.hosts, DEV_ADAPTER_HOST]);
    expect(devConfig.adapters["shopify-checkout"]!.pathPatterns).toEqual([
      ...shippingAdapters["shopify-checkout"]!.pathPatterns,
      DEV_ADAPTER_PATH_PREFIX,
    ]);
  });

  it("shopify-checkout's anchors (selectors, label lexicon, instalment patterns) are byte-identical to shipping -- the SAME adapter logic runs, nothing re-implemented", () => {
    expect(devConfig.adapters["shopify-checkout"]!.anchors).toEqual(shippingAdapters["shopify-checkout"]!.anchors);
  });

  it("stripe-hosted and whop are completely untouched", () => {
    expect(devConfig.adapters["stripe-hosted"]).toEqual(shippingAdapters["stripe-hosted"]);
    expect(devConfig.adapters["whop"]).toEqual(shippingAdapters["whop"]);
  });

  it("never mutates the shipping config object passed in", () => {
    const before = JSON.stringify(shippingAdaptersConfig);
    deriveDevAdaptersConfig(shippingAdaptersConfig);
    expect(JSON.stringify(shippingAdaptersConfig)).toBe(before);
  });
});

describe("end to end: a bare-'localhost' page (port 80's shape) serving the real full-confirmable fixture reaches PARSED_CONFIRMABLE, exactly as scripts/build-dev.mjs wires it live -- with ZERO change to src/config/bundled.ts or src/engine/adapter-common.ts", () => {
  it("validates cleanly and matches through the REAL, unmodified matchAdapterConfig", () => {
    const devManifest = deriveDevManifest(shippingManifest) as { host_permissions: string[] };
    const devConfig = deriveDevAdaptersConfig(shippingAdaptersConfig);

    const manifestHosts = deriveManifestHostsForTest(devManifest.host_permissions);
    // Proves DEV_HOST_PATTERN_HTTPS is what makes this validate: the
    // https-scheme entry is the one the (unmodified) https-only regex can
    // actually strip down to "localhost".
    expect(manifestHosts).toContain(DEV_ADAPTER_HOST);

    const validated = validateConfig(devConfig, manifestHosts);
    expect(validated.disabled).toEqual([]);

    const doc = mountFixture("adapters/shopify-checkout", "full-confirmable");
    // Bare "localhost", no port -- exactly what a real browser reports as
    // `location.host` when scripts/dev/serve-fixtures.mjs is bound to
    // port 80 (http's default port is omitted from location.host).
    const page = pageProbeFor(doc, DEV_ADAPTER_HOST, DEV_ADAPTER_PATH_PREFIX);

    const config = validated.adapters.get("shopify-checkout");
    const matchResult = matchAdapterConfig(page, config, shopifyCheckoutAdapterSpecificity);
    expect(matchResult).toEqual({ matched: true, specificity: shopifyCheckoutAdapterSpecificity });

    const anchors = shopifyCheckoutAdapter.locate(page);
    expect(anchors).not.toBeNull();
    const state = shopifyCheckoutAdapter.extract(anchors!, extractionCore);
    expect(state.kind).toBe("PARSED_CONFIRMABLE");
    if (state.kind === "PARSED_CONFIRMABLE") {
      expect(state.candidate.orderTotalCents).toBe(8996);
      expect(state.candidate.installmentCount).toBe(4);
      expect(state.candidate.cadence).toBe("BIWEEKLY");
      expect(state.candidate.perInstallmentCents).toBe(2249);
      expect(state.candidate.currency).toBe("CAD");
    }
  });

  it("the SAME fixture, on the real shipping config (no localhost host added), does NOT match on localhost -- proves the dev override is what makes the difference, not a pre-existing hole", () => {
    const manifestHosts = deriveManifestHostsForTest(shippingManifest.host_permissions as string[]);
    const validated = validateConfig(shippingAdaptersConfig, manifestHosts);
    const doc = mountFixture("adapters/shopify-checkout", "full-confirmable");
    const page = pageProbeFor(doc, DEV_ADAPTER_HOST, DEV_ADAPTER_PATH_PREFIX);
    const config = validated.adapters.get("shopify-checkout");
    expect(matchAdapterConfig(page, config, shopifyCheckoutAdapterSpecificity).matched).toBe(false);
  });
});
