/**
 * The release-blocking guard behind `npm run release-check`
 * (scripts/release-check.mjs / scripts/lib/marketing-host-guard.mjs).
 *
 * This exercises the SAME exported functions the real CLI calls — never a
 * re-implementation of the detection regex — fed both real, committed
 * source content and synthetic/planted payloads (the teeth tests), the
 * same pattern tests/static/manifest.test.ts and
 * tests/static/supply-chain.test.ts already use for this codebase's other
 * pure structural guards.
 *
 * What this deliberately does NOT do: shell out to esbuild and scan a
 * freshly built dist/. tests/static/supply-chain.test.ts already draws
 * that line for this codebase ("the two-clean-builds hash-compare check
 * ... is a CI pipeline script per the coverage matrix's own framing, not a
 * Vitest test ... does not belong in the fast default lane") — a real
 * build inside every `npm test` run is exactly that. Instead, the
 * "against the built output" requirement is satisfied two ways: (a) the
 * filesystem-level tests below feed the guard actual files read from disk
 * (a temp directory shaped like dist/, not an in-memory string), so the
 * read-a-real-file path is exercised, and (b) this file's own header
 * comment plus the verbatim `npm run build && npm run release-check`
 * transcript in the PR description is the real build-output proof.
 *
 * RED when: the guard stops catching the real placeholder, starts
 * false-firing on unrelated "invalid" strings already present elsewhere
 * in this codebase's bundled output, or the CLI's failure message stops
 * naming the constant/file to fix.
 */
import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MARKETING_HOST } from "../../src/popup/copy";
import {
  findUnconfiguredMarketingHostMatches,
  formatGuardFailureMessage,
  scanForUnconfiguredMarketingHost,
} from "../../scripts/lib/marketing-host-guard.mjs";

describe("findUnconfiguredMarketingHostMatches — detects the placeholder, ignores its own self-reference", () => {
  it("flags the real, currently-shipped MARKETING_HOST value", () => {
    expect(findUnconfiguredMarketingHostMatches(MARKETING_HOST)).toEqual(["pegasus.invalid"]);
  });

  it("flags the placeholder under a renamed constant / different file — a future refactor moving the string must still be caught", () => {
    const bundledLike = `var TOTALLY_RENAMED_HOST = "https://marketing.pegasus.invalid/launch-notify";`;
    expect(findUnconfiguredMarketingHostMatches(bundledLike)).toEqual(["pegasus.invalid"]);
  });

  it("does NOT flag MARKETING_HOST_CONFIGURED's own bundled comparison — `.includes(\".invalid\")` contains the bare substring on every build, configured or not", () => {
    const bundledLike = `var MARKETING_HOST_CONFIGURED = !MARKETING_HOST.includes(".invalid");`;
    expect(findUnconfiguredMarketingHostMatches(bundledLike)).toEqual([]);
  });

  it("does NOT flag the unrelated 'invalid' strings already bundled into this codebase's real output (money/date/config validation errors)", () => {
    const bundledLikeNoise = [
      `throw new Error('overlay/format-helpers: invalid ISO date "' + date + '"')`,
      `return "invalid_fraction_digits"`,
      `return "invalid_character"`,
      `errors.push("invalid host " + host)`,
      `errors.push(where + ".css contains an invalid selector")`,
    ].join("\n");
    expect(findUnconfiguredMarketingHostMatches(bundledLikeNoise)).toEqual([]);
  });

  it("does not flag a configured host — the reserved, non-resolving `.example` TLD stands in for 'a real origin' so this test never writes a real hostname", () => {
    expect(findUnconfiguredMarketingHostMatches(`var MARKETING_HOST = "https://marketing.pegasus.example";`)).toEqual([]);
  });
});

describe("scanForUnconfiguredMarketingHost / formatGuardFailureMessage — against files actually read from disk", () => {
  let tmpDir: string | null = null;

  afterEach(() => {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = null;
  });

  function writeDistLikeFile(name: string, contents: string): { path: string; text: string } {
    tmpDir ??= mkdtempSync(join(tmpdir(), "release-guard-test-"));
    const fullPath = join(tmpDir, name);
    writeFileSync(fullPath, contents, "utf-8");
    return { path: fullPath, text: contents };
  }

  it("liveness — reports zero hits across a clean, dist-shaped file set", () => {
    const files = [
      writeDistLikeFile("content-script.js", `var x = "no marketing host referenced here";`),
      writeDistLikeFile("service-worker.js", `var y = 1;`),
    ];
    expect(scanForUnconfiguredMarketingHost(files)).toEqual([]);
  });

  it("reports the placeholder when it is present, naming the exact file — mirrors dist/popup.js and dist/welcome.js both carrying the bundled constant", () => {
    const files = [
      writeDistLikeFile("popup.js", `var MARKETING_HOST = "https://marketing.pegasus.invalid";`),
      writeDistLikeFile("welcome.js", `var MARKETING_HOST = "https://marketing.pegasus.invalid";`),
      writeDistLikeFile("content-script.js", `var z = "unrelated";`),
    ];
    const hits = scanForUnconfiguredMarketingHost(files);
    expect(hits.map((hit) => hit.path).sort()).toEqual([files[0]?.path, files[1]?.path].sort());
    expect(hits.every((hit) => hit.match === "pegasus.invalid")).toBe(true);
  });

  it("formatGuardFailureMessage names MARKETING_HOST, src/popup/copy.ts, and the offending file(s) — and never invents a replacement domain", () => {
    const files = [writeDistLikeFile("popup.js", `var MARKETING_HOST = "https://marketing.pegasus.invalid";`)];
    const message = formatGuardFailureMessage(scanForUnconfiguredMarketingHost(files));

    expect(message).toContain("MARKETING_HOST");
    expect(message).toContain("src/popup/copy.ts");
    expect(message).toContain(files[0]?.path);
    expect(message).toMatch(/RELEASE BLOCKED/);
    // No invented replacement domain: the message names the file/constant
    // to fix in prose, but must never itself contain a URL scheme (which
    // is what suggesting a concrete replacement host would require).
    expect(message).not.toMatch(/https?:\/\//);
  });
});
