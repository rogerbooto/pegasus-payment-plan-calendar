/**
 * T04 static guard, scoped to src/overlay and src/popup (the surfaces this
 * task owns). Complements eslint.config.mjs's no-restricted-syntax rules —
 * this test reads the source text directly, so it still catches a banned
 * sink even if an eslint-disable comment is added around it. RED when any
 * file under these two directories assigns innerHTML/outerHTML or calls
 * insertAdjacentHTML.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["src/overlay", "src/popup"];
const BANNED = [/\.innerHTML\s*=/, /\.outerHTML\s*=/, /insertAdjacentHTML\s*\(/];

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

describe("no HTML sinks anywhere in src/overlay or src/popup (T04)", () => {
  const files = ROOTS.flatMap((root) => walk(join(process.cwd(), root)));

  it("found a non-trivial corpus to scan (liveness — a misconfigured root must not pass vacuously)", () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it.each(files.map((f) => [f] as const))("%s contains no innerHTML/outerHTML/insertAdjacentHTML", (file) => {
    const src = readFileSync(file, "utf-8");
    for (const pattern of BANNED) {
      expect(pattern.test(src), `${file} matched banned sink pattern ${pattern}`).toBe(false);
    }
  });
});
