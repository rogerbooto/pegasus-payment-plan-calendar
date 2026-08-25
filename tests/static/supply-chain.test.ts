/**
 * T15b — the genuinely testable slice of the silent-update-supply-chain
 * finding (T15a, the two-clean-builds hash-compare check, is a CI
 * pipeline script per the coverage matrix's own framing, not a Vitest
 * test — reproducible-build proof needs two real `npm ci && npm run
 * build` invocations, which does not belong in the fast default lane).
 *
 * This file checks the two things that ARE plain data assertions over the
 * committed lockfile:
 * 1. Every resolved package entry carries an `integrity` hash (a
 *    dependency silently resolving to an unverified tarball is a supply-
 *    chain hole regardless of anything else in this file).
 * 2. The total resolved dependency count does not exceed a pinned
 *    ceiling — ratchet-DOWN only (mirrors the ESLint warning-backlog
 *    pattern already used elsewhere in this codebase's parent project).
 *    The starting ceiling is the count at the time this test was written
 *    plus ~20% headroom, per the coverage matrix's own recommendation
 *    (D3b §H.3) for a solo-founder project with no prior number pinned.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const LOCKFILE_PATH = join(process.cwd(), "package-lock.json");
const lockfile = JSON.parse(readFileSync(LOCKFILE_PATH, "utf-8")) as {
  packages: Record<string, { integrity?: string; link?: boolean; resolved?: string }>;
};

/**
 * Every non-root, non-symlink `packages` entry must carry an `integrity`
 * hash. The root entry (`""`, this project itself) and workspace symlinks
 * (`link: true`) are excluded — neither is a downloaded, unverified
 * artifact.
 */
function findEntriesMissingIntegrity(
  packages: Record<string, { integrity?: string; link?: boolean }>,
): string[] {
  return Object.entries(packages)
    .filter(([key, entry]) => key !== "" && !entry.link && !entry.integrity)
    .map(([key]) => key);
}

// Ratchet-down only. 247 resolved entries at authoring time + ~20%
// headroom, per D3b §H.3 (no prior number was pinned anywhere upstream).
// Lowering this is always fine; raising it is a reviewed diff, not a
// tuning knob to silence a failing test.
const DEPENDENCY_COUNT_CEILING = 300;

describe("supply chain — lockfile integrity and dependency ceiling (T15b)", () => {
  it("liveness — the committed lockfile has a non-trivial, plausibly-sized package set (a broken parse must not pass on nothing)", () => {
    expect(Object.keys(lockfile.packages).length).toBeGreaterThan(50);
  });

  it("liveness — the integrity detector flags a planted entry missing its hash", () => {
    const planted = { "": {}, "node_modules/real": { integrity: "sha512-abc" }, "node_modules/tampered": {} };
    expect(findEntriesMissingIntegrity(planted)).toEqual(["node_modules/tampered"]);
  });

  it("every resolved (non-root, non-link) package entry in the committed lockfile carries an integrity hash", () => {
    const missing = findEntriesMissingIntegrity(lockfile.packages);
    expect(missing, `entries missing an integrity hash: ${missing.join(", ")}`).toEqual([]);
  });

  it("total resolved dependency count does not exceed the pinned ceiling", () => {
    const total = Object.keys(lockfile.packages).filter((k) => k !== "").length;
    expect(total, `resolved dependency count (${total}) exceeds the pinned ceiling (${DEPENDENCY_COUNT_CEILING}) — raising the ceiling is a reviewed diff, not a silent bump`).toBeLessThanOrEqual(
      DEPENDENCY_COUNT_CEILING,
    );
  });
});
