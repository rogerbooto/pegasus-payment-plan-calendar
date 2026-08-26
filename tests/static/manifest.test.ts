/**
 * Manifest structural guards — T09, T18, T19. All three findings share one
 * committed artifact (src/manifest.json), so this file holds all three
 * checks the way T09's target file note in the coverage matrix
 * describes ("tests/static/manifest.test.ts (shared file with T18/T19)").
 *
 * Every check below runs against a pure, exported validation function fed
 * BOTH the real committed manifest AND synthetic tampered payloads (the
 * teeth tests) — never a re-implementation of the same logic, so a teeth
 * test can't silently diverge from what production actually enforces.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const manifest = JSON.parse(readFileSync(join(process.cwd(), "src", "manifest.json"), "utf-8")) as Record<string, unknown>;

// ---------------------------------------------------------------------------
// T09 — externally_connectable absent, web_accessible_resources minimal,
// and a reviewed-keys allowlist so a brand-new top-level manifest field
// can't silently widen the surface without a reviewer having to touch this
// allowlist first.
// ---------------------------------------------------------------------------

const REVIEWED_TOP_LEVEL_KEYS = [
  "manifest_version",
  "name",
  "version",
  "description",
  "permissions",
  "host_permissions",
  "optional_host_permissions",
  "content_scripts",
  "background",
  "action",
  "content_security_policy",
  // Toolbar and store icons. Static image assets only — an icon cannot execute,
  // request a permission, or reach the network, so this widens no surface. Added
  // deliberately: the ratchet above flagged it, which is the ratchet working.
  "icons",
] as const;

function findUnreviewedTopLevelKeys(m: Record<string, unknown>): string[] {
  return Object.keys(m).filter((k) => !(REVIEWED_TOP_LEVEL_KEYS as readonly string[]).includes(k));
}

function hasExternalSurface(m: Record<string, unknown>): boolean {
  const externallyConnectable = m["externally_connectable"];
  if (externallyConnectable !== undefined) {
    if (Array.isArray((externallyConnectable as { matches?: unknown[] })?.matches)) {
      if (((externallyConnectable as { matches: unknown[] }).matches.length > 0)) return true;
    } else {
      return true; // any non-empty externally_connectable at all is a surface widening
    }
  }
  const war = m["web_accessible_resources"];
  if (Array.isArray(war) && war.length > 0) return true;
  return false;
}

describe("manifest — T09: no external surface, reviewed top-level keys", () => {
  it("liveness — the detector flags a planted externally_connectable and a planted web_accessible_resources entry", () => {
    expect(hasExternalSurface({ externally_connectable: { matches: ["https://evil.example/*"] } })).toBe(true);
    expect(hasExternalSurface({ web_accessible_resources: [{ resources: ["x.js"], matches: ["<all_urls>"] }] })).toBe(true);
    expect(hasExternalSurface({})).toBe(false);
  });

  it("liveness — the reviewed-keys scanner flags a planted unreviewed top-level key", () => {
    expect(findUnreviewedTopLevelKeys({ ...manifest, remote_config_url: "https://evil.example" })).toEqual(["remote_config_url"]);
    expect(findUnreviewedTopLevelKeys(manifest)).toEqual([]);
  });

  it("the committed manifest has no externally_connectable or web_accessible_resources surface", () => {
    expect(hasExternalSurface(manifest)).toBe(false);
    expect(manifest["externally_connectable"]).toBeUndefined();
    expect(manifest["web_accessible_resources"]).toBeUndefined();
  });

  it("the committed manifest introduces no unreviewed top-level key (ratchet: a new key must be added to REVIEWED_TOP_LEVEL_KEYS in a reviewed diff)", () => {
    expect(findUnreviewedTopLevelKeys(manifest)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// T18 — host_permissions is a minimum-necessary allowlist, no <all_urls>,
// no broad grants (tabs/webRequest/cookies/scripting).
// ---------------------------------------------------------------------------

const REVIEWED_HOST_PERMISSIONS = [
  "https://checkout.shopify.com/*",
  "https://shop.app/*",
  "https://checkout.stripe.com/*",
  "https://whop.com/*",
  "https://www.amazon.com/*",
  "https://www.amazon.ca/*",
] as const;

const BROAD_GRANTS = ["tabs", "webRequest", "webRequestBlocking", "cookies", "scripting", "declarativeNetRequest", "declarativeNetRequestWithHostAccess"] as const;

function findOverBroadHosts(hosts: readonly string[]): string[] {
  return hosts.filter((h) => h === "<all_urls>" || h === "*://*/*" || h === "http://*/*" || h === "https://*/*" || !(REVIEWED_HOST_PERMISSIONS as readonly string[]).includes(h));
}

function findBroadGrants(permissions: readonly string[]): string[] {
  return permissions.filter((p) => (BROAD_GRANTS as readonly string[]).includes(p));
}

describe("manifest — T18: host_permissions allowlist, no broad grants", () => {
  it("liveness — the detector flags <all_urls> and an unreviewed host", () => {
    expect(findOverBroadHosts(["<all_urls>"])).toEqual(["<all_urls>"]);
    expect(findOverBroadHosts(["https://evil.example/*"])).toEqual(["https://evil.example/*"]);
    expect(findOverBroadHosts([...REVIEWED_HOST_PERMISSIONS])).toEqual([]);
  });

  it("liveness — the broad-grant detector flags webRequest/tabs/cookies", () => {
    expect(findBroadGrants(["storage", "webRequest"])).toEqual(["webRequest"]);
    expect(findBroadGrants(["storage", "activeTab"])).toEqual([]);
  });

  it("host_permissions is exactly the reviewed adapter allowlist; no <all_urls>", () => {
    const hosts = manifest["host_permissions"] as string[];
    expect(findOverBroadHosts(hosts)).toEqual([]);
    expect(hosts).not.toContain("<all_urls>");
  });

  it("permissions and optional_host_permissions request no broad grant", () => {
    const permissions = (manifest["permissions"] as string[] | undefined) ?? [];
    const optionalHosts = (manifest["optional_host_permissions"] as string[] | undefined) ?? [];
    expect(findBroadGrants(permissions)).toEqual([]);
    expect(optionalHosts).not.toContain("<all_urls>");
  });
});

// ---------------------------------------------------------------------------
// T19 — MV3, CSP is a tokenized allowlist (never a substring match, which a
// whitespace/casing/ordering trick could defeat), no unsafe-eval/inline.
// ---------------------------------------------------------------------------

const ALLOWED_CSP_TOKENS = new Set(["script-src", "'self'", "object-src", "'none'"]);

/** Tokenizes a CSP directive string and returns any token not on the
 * allowlist — case-sensitive on purpose (CSP keyword tokens like
 * 'unsafe-eval' are lowercase by spec; a directive NAME like
 * "Script-Src" would itself be an unreviewed token, which is correct: we
 * want to catch cosmetic drift, not normalize past it). */
function findDisallowedCspTokens(csp: string): string[] {
  const tokens = csp
    .split(";")
    .flatMap((directive) => directive.trim().split(/\s+/))
    .filter((t) => t.length > 0);
  return tokens.filter((t) => !ALLOWED_CSP_TOKENS.has(t));
}

describe("manifest — T19: MV3, tokenized CSP allowlist, no remote code", () => {
  it("liveness — the tokenizer flags 'unsafe-eval' regardless of whitespace/casing tricks a substring check could miss", () => {
    expect(findDisallowedCspTokens("script-src 'self'  'unsafe-eval'")).toContain("'unsafe-eval'");
    expect(findDisallowedCspTokens("script-src\t'self';object-src 'none'")).toEqual([]);
    // A naive substring check for "unsafe-eval" would miss this cosmetic
    // variant; the tokenizer still catches ANY token outside the allowlist,
    // including one that merely LOOKS unfamiliar (proving it isn't doing a
    // blocklist match, but a real allowlist).
    expect(findDisallowedCspTokens("script-src 'self' https://cdn.example.com")).toContain("https://cdn.example.com");
  });

  it("manifest_version is 3", () => {
    expect(manifest["manifest_version"]).toBe(3);
  });

  it("content_security_policy.extension_pages is a tokenized allowlist with no unreviewed token", () => {
    const csp = (manifest["content_security_policy"] as { extension_pages?: string } | undefined)?.extension_pages;
    expect(typeof csp).toBe("string");
    expect(findDisallowedCspTokens(csp as string)).toEqual([]);
  });

  it("no content_script or background entry references a remote URL", () => {
    const contentScripts = (manifest["content_scripts"] as { js?: string[] }[] | undefined) ?? [];
    for (const cs of contentScripts) {
      for (const js of cs.js ?? []) {
        expect(js.startsWith("http")).toBe(false);
      }
    }
    const bg = manifest["background"] as { service_worker?: string } | undefined;
    expect(bg?.service_worker?.startsWith("http")).toBe(false);
  });
});
