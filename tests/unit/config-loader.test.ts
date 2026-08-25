import { describe, expect, it } from "vitest";
import { validateConfig } from "../../src/config/loader";
import bundledConfig from "../../src/config/adapters.config.json";
import manifest from "../../src/manifest.json";

const manifestHosts = manifest.host_permissions.map((p) =>
  p.replace("https://", "").replace("/*", ""),
);

describe("bundled selector config", () => {
  it("the shipped config validates against the shipped manifest hosts", () => {
    const result = validateConfig(bundledConfig, manifestHosts);
    expect(result.disabled).toEqual([]);
    expect([...result.adapters.keys()].sort()).toEqual(["shopify-checkout", "stripe-hosted", "whop"]);
  });

  it("an adapter whose hosts are not covered by the manifest is disabled entirely", () => {
    const tampered = structuredClone(bundledConfig) as Record<string, unknown>;
    const whopHosts = (tampered.adapters as Record<string, { hosts: string[] } | undefined>)["whop"];
    if (!whopHosts) throw new Error("fixture drift: bundled config no longer defines the 'whop' adapter");
    whopHosts.hosts = ["evil.example"];
    const result = validateConfig(tampered, manifestHosts);
    expect(result.adapters.has("whop")).toBe(false);
    expect(result.disabled.map((d) => d.id)).toContain("whop");
  });

  it("code-shaped selector strings disable the adapter", () => {
    const tampered = structuredClone(bundledConfig) as Record<string, unknown>;
    const whopAnchors = (
      tampered.adapters as Record<string, { anchors: { orderTotal: { css: string[] } } } | undefined>
    )["whop"];
    if (!whopAnchors) throw new Error("fixture drift: bundled config no longer defines the 'whop' adapter");
    whopAnchors.anchors.orderTotal.css = ["div; eval(alert(1))"];
    const result = validateConfig(tampered, manifestHosts);
    expect(result.adapters.has("whop")).toBe(false);
  });

  it("unknown top-level keys fail the whole config", () => {
    expect(() => validateConfig({ ...bundledConfig, remoteUrl: "x" }, manifestHosts)).toThrow(
      /unknown top-level key/,
    );
  });

  it("an unknown schema version is a load-time hard failure", () => {
    expect(() => validateConfig({ ...bundledConfig, schemaVersion: 99 }, manifestHosts)).toThrow(
      /schemaVersion/,
    );
  });

  // The four checks below are new hardening added alongside the
  // adapter-engine build (labelLexicon/iframeOrigins were previously
  // unvalidated -- T16 requires the config be treated as untrusted input
  // even though we author it). Each test targets ONE specific guard and
  // would pass vacuously if that guard were removed rather than some other
  // unrelated check catching the tampering -- so each uses a minimal,
  // otherwise-valid tamper that only that guard can reject.

  it("a labelLexicon term outside the plain-word charset disables the adapter", () => {
    const tampered = structuredClone(bundledConfig) as Record<string, unknown>;
    const whopAnchors = (
      tampered.adapters as Record<string, { anchors: { orderTotal: { labelLexicon: string[] } } } | undefined>
    )["whop"];
    if (!whopAnchors) throw new Error("fixture drift: bundled config no longer defines the 'whop' adapter");
    whopAnchors.anchors.orderTotal.labelLexicon = ["total{count}"];
    const result = validateConfig(tampered, manifestHosts);
    expect(result.adapters.has("whop")).toBe(false);
    expect(result.disabled.find((d) => d.id === "whop")?.errors.some((e) => e.includes("labelLexicon"))).toBe(true);
  });

  it("an iframeOrigin outside the bare-hostname charset disables the adapter", () => {
    const tampered = structuredClone(bundledConfig) as Record<string, unknown>;
    const whopAnchors = (
      tampered.adapters as Record<string, { anchors: { bnplWidget: { iframeOrigins: string[] } } } | undefined>
    )["whop"];
    if (!whopAnchors) throw new Error("fixture drift: bundled config no longer defines the 'whop' adapter");
    whopAnchors.anchors.bnplWidget.iframeOrigins = ["https://widget.sezzle.com/evil"];
    const result = validateConfig(tampered, manifestHosts);
    expect(result.adapters.has("whop")).toBe(false);
    expect(result.disabled.find((d) => d.id === "whop")?.errors.some((e) => e.includes("iframeOrigins"))).toBe(true);
  });

  it("an unknown key inside an anchor group disables the adapter (closed schema, not just top-level)", () => {
    const tampered = structuredClone(bundledConfig) as Record<string, unknown>;
    const whopAnchors = (
      tampered.adapters as Record<string, { anchors: { orderTotal: Record<string, unknown> } } | undefined>
    )["whop"];
    if (!whopAnchors) throw new Error("fixture drift: bundled config no longer defines the 'whop' adapter");
    whopAnchors.anchors.orderTotal.remoteFetchUrl = "https://evil.example/selectors.json";
    const result = validateConfig(tampered, manifestHosts);
    expect(result.adapters.has("whop")).toBe(false);
    expect(result.disabled.find((d) => d.id === "whop")?.errors.some((e) => e.includes("unknown key"))).toBe(true);
  });

  it("a css array beyond the entry cap disables the adapter (defense-in-depth against a bloated config)", () => {
    const tampered = structuredClone(bundledConfig) as Record<string, unknown>;
    const whopAnchors = (
      tampered.adapters as Record<string, { anchors: { orderTotal: { css: string[] } } } | undefined>
    )["whop"];
    if (!whopAnchors) throw new Error("fixture drift: bundled config no longer defines the 'whop' adapter");
    whopAnchors.anchors.orderTotal.css = Array.from({ length: 21 }, (_, i) => `.total-${i}`);
    const result = validateConfig(tampered, manifestHosts);
    expect(result.adapters.has("whop")).toBe(false);
    expect(result.disabled.find((d) => d.id === "whop")?.errors.some((e) => e.includes("entry cap"))).toBe(true);
  });
});
