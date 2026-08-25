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
});
