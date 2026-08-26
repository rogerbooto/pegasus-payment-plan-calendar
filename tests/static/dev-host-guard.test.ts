/**
 * The release-blocking dev-only-host guard behind `npm run release-check`
 * (scripts/release-check.mjs / scripts/lib/dev-host-guard.mjs). Same
 * shape as tests/static/release-guard.test.ts: exercises the SAME
 * exported functions the real CLI calls, fed both real, committed source
 * content and synthetic/planted payloads.
 *
 * The self-reference question (does this guard's OWN detection code ever
 * appear inside the surface it scans, the way marketing-host-guard.mjs's
 * MARKETING_HOST_CONFIGURED check unavoidably does?) is answered directly
 * below, not assumed: the liveness test scans the REAL, committed src/
 * tree for every pattern this guard looks for and pins the answer as
 * "zero occurrences today". scripts/ (where this guard's own text lives)
 * is never an esbuild entry point (scripts/build.mjs's entryPoints are
 * all under src/), so this guard's own source can never end up inside
 * dist/ regardless.
 *
 * RED when: the guard stops catching a dev-flavoured manifest/bundle, a
 * legitimate src/ string starts coincidentally matching one of these
 * patterns (forcing a reviewed exclusion, the same shape the marketing
 * guard already has), or the CLI's failure message stops naming the
 * cause.
 */
import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DEV_ONLY_HOST_PATTERNS,
  findDevOnlyHostMatches,
  formatDevHostGuardFailureMessage,
  scanForDevOnlyHosts,
} from "../../scripts/lib/dev-host-guard.mjs";
import { deriveDevManifest, DEV_HOST_PATTERN_HTTP } from "../../scripts/lib/dev-build.mjs";

const SRC_ROOT = join(process.cwd(), "src");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

describe("findDevOnlyHostMatches -- catches localhost/loopback shapes", () => {
  it("flags a bare 'localhost' match pattern", () => {
    expect(findDevOnlyHostMatches(`var x = "http://localhost/*";`)).toEqual(["localhost"]);
  });

  it("flags 127.0.0.1", () => {
    expect(findDevOnlyHostMatches(`var x = "http://127.0.0.1:8080/*";`)).toContain("127.0.0.1 (loopback)");
  });

  it("flags 0.0.0.0", () => {
    expect(findDevOnlyHostMatches(`var x = "0.0.0.0";`)).toContain("0.0.0.0");
  });

  it("flags bare IPv6 loopback ::1 but not an unrelated longer hex/IPv6 literal that merely contains the substring", () => {
    expect(findDevOnlyHostMatches(`var x = "::1";`)).toContain("::1 (IPv6 loopback)");
    expect(findDevOnlyHostMatches(`var x = "fe80::1234:5678";`)).toEqual([]);
  });

  it("does not flag unrelated bundled text (money/date/config strings already shipped today)", () => {
    const noise = [
      `throw new Error('overlay/format-helpers: invalid ISO date "' + date + '"')`,
      `return "invalid_fraction_digits"`,
      `var CADENCE = "BIWEEKLY";`,
      `errors.push("invalid host " + host)`,
    ].join("\n");
    expect(findDevOnlyHostMatches(noise)).toEqual([]);
  });

  it("liveness -- the pattern table itself is non-empty (a misconfigured guard must not pass vacuously)", () => {
    expect(DEV_ONLY_HOST_PATTERNS.length).toBeGreaterThan(0);
  });
});

describe("scanForDevOnlyHosts / formatDevHostGuardFailureMessage -- against files actually read from disk", () => {
  let tmpDir: string | null = null;

  afterEach(() => {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = null;
  });

  function writeDistLikeFile(name: string, contents: string): { path: string; text: string } {
    tmpDir ??= mkdtempSync(join(tmpdir(), "dev-host-guard-test-"));
    const fullPath = join(tmpDir, name);
    writeFileSync(fullPath, contents, "utf-8");
    return { path: fullPath, text: contents };
  }

  it("liveness -- reports zero hits across a clean, dist-shaped file set", () => {
    const files = [
      writeDistLikeFile("content-script.js", `var x = "no dev host referenced here";`),
      writeDistLikeFile("manifest.json", JSON.stringify({ host_permissions: ["https://checkout.shopify.com/*"] })),
    ];
    expect(scanForDevOnlyHosts(files)).toEqual([]);
  });

  it("reports the dev host when present in a built manifest, naming the exact file", () => {
    const devManifest = deriveDevManifest({
      name: "x",
      version: "0.1.0",
      description: "x",
      host_permissions: ["https://checkout.shopify.com/*"],
      content_scripts: [{ matches: ["https://checkout.shopify.com/*"], js: ["content-script.js"], run_at: "document_idle" }],
      action: { default_title: "x", default_popup: "popup.html", default_icon: {} },
    });
    const files = [
      writeDistLikeFile("manifest.json", JSON.stringify(devManifest)),
      writeDistLikeFile("content-script.js", `var z = "unrelated";`),
    ];
    const hits = scanForDevOnlyHosts(files);
    expect(hits.map((h) => h.path)).toEqual([files[0]?.path]);
    expect(hits.every((h) => h.match === "localhost")).toBe(true);
  });

  it("reports the dev host when present in a built JS bundle (the compiled BUNDLED_CONFIG carrying the dev-only shopify-checkout hosts entry)", () => {
    const files = [writeDistLikeFile("content-script.js", `var hosts = ["checkout.shopify.com","shop.app","localhost"];`)];
    const hits = scanForDevOnlyHosts(files);
    expect(hits).toHaveLength(1);
    expect(hits[0]?.match).toBe("localhost");
  });

  it("formatDevHostGuardFailureMessage names the offending file(s) and points at the local fixture-testing build", () => {
    const files = [writeDistLikeFile("manifest.json", `{"host_permissions":["${DEV_HOST_PATTERN_HTTP}"]}`)];
    const message = formatDevHostGuardFailureMessage(scanForDevOnlyHosts(files));
    expect(message).toMatch(/RELEASE BLOCKED/);
    expect(message).toContain(files[0]?.path);
    expect(message).toContain("localhost");
  });
});

describe("self-reference check: the real, committed src/ tree carries none of these patterns today", () => {
  const files = walk(SRC_ROOT).filter((f) => /\.(ts|json|html)$/.test(f));

  it("liveness -- found a non-trivial corpus to scan", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it.each(files.map((f) => [f] as const))(
    "%s contains no dev-only-host pattern (if this ever fails, it means src/ now has a LEGITIMATE reason to mention one of these strings -- see this guard's own header comment on why that would newly require a reviewed exclusion, mirroring marketing-host-guard.mjs's)",
    (file) => {
      const text = readFileSync(file, "utf-8");
      expect(findDevOnlyHostMatches(text), file).toEqual([]);
    },);
});
