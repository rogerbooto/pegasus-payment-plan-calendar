/**
 * The air gap.
 *
 * Nothing this extension holds can leave the device, because the extension has
 * no network code at all. Its complete outbound surface is zero — see
 * src/telemetry/sink.ts, which validates an event and then drops it.
 *
 * This test pins that structurally, so introducing any transport becomes a
 * loud, reviewed, red-on-CI act rather than a quiet one. "Everything stays on
 * this device" is only a promise if nothing is able to send.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const SRC_ROOT = join(process.cwd(), "src");
const MANIFEST_PATH = join(process.cwd(), "src", "manifest.json");

// Network-request API surface. Matches the call form, not the bare
// identifier, so a comment mentioning "fetch" in prose doesn't false-fire.
const NETWORK_API_PATTERNS: readonly RegExp[] = [
  /\bfetch\s*\(/,
  /\bnew\s+XMLHttpRequest\s*\(/,
  /\bnavigator\.sendBeacon\s*\(/,
  /\bnew\s+WebSocket\s*\(/,
  /\bnew\s+EventSource\s*\(/,
  /\bnew\s+Request\s*\(/,
];

// Manifest permissions that would give a future transport a redirect,
// intercept, or persistent-cookie mechanic to piggyback on.
const NETWORK_ADJACENT_PERMISSIONS: readonly string[] = [
  "webRequest",
  "webRequestBlocking",
  "declarativeNetRequest",
  "declarativeNetRequestWithHostAccess",
  "cookies",
];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) out.push(...walk(full));
    else if (entry.endsWith(".ts")) out.push(full);
  }
  return out;
}

/** Pure scan function, exported implicitly via the liveness test below by
 * being exercised directly against synthetic text — proves the detector
 * still detects before it's trusted against real source. */
function scanForNetworkCode(text: string): RegExp[] {
  return NETWORK_API_PATTERNS.filter((pattern) => pattern.test(text));
}

function scanPermissionsForNetworkAdjacent(permissions: readonly string[]): string[] {
  return permissions.filter((permission) => NETWORK_ADJACENT_PERMISSIONS.includes(permission));
}

describe("air gap — no network-capable code or permission exists", () => {
  const files = walk(SRC_ROOT);

  it("liveness — found a non-trivial corpus to scan (a misconfigured root must not pass vacuously)", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it("liveness — the scanner catches a planted network call (a blind detector must not pass on nothing)", () => {
    expect(scanForNetworkCode('const x = fetch("https://example.com");').length).toBeGreaterThan(0);
    expect(scanForNetworkCode("new XMLHttpRequest()").length).toBeGreaterThan(0);
    expect(scanForNetworkCode("navigator.sendBeacon(url, body)").length).toBeGreaterThan(0);
    expect(scanForNetworkCode("// no network code, just prose about fetching data").length).toBe(0);
  });

  it.each(files.map((f) => [f] as const))("%s contains no network-request API call", (file) => {
    const src = readFileSync(file, "utf-8");
    const matches = scanForNetworkCode(src);
    expect(matches, `${file} matched network API pattern(s): ${matches.join(", ")}`).toEqual([]);
  });

  it("liveness — the permission scanner catches a planted network-adjacent permission", () => {
    expect(scanPermissionsForNetworkAdjacent(["storage", "webRequest"])).toEqual(["webRequest"]);
    expect(scanPermissionsForNetworkAdjacent(["storage", "activeTab"])).toEqual([]);
  });

  it("manifest requests no network-adjacent permission (webRequest/declarativeNetRequest/cookies)", () => {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8")) as {
      permissions?: string[];
      optional_permissions?: string[];
    };
    const found = scanPermissionsForNetworkAdjacent([
      ...(manifest.permissions ?? []),
      ...(manifest.optional_permissions ?? []),
    ]);
    expect(found, `manifest requests network-adjacent permission(s): ${found.join(", ")}`).toEqual([]);
  });
});
