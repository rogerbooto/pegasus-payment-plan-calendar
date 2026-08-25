/**
 * Invariant #6 (§D): no dynamic-code sink anywhere in src/**, ONE merged
 * whole-tree guard rather than several path-scoped ones (which can each
 * individually miss a sink reachable through a different file). Merges
 * T04 (innerHTML/outerHTML/insertAdjacentHTML — already checked, but only
 * for src/overlay and src/popup, by overlay-no-html-sinks.test.ts), T16
 * (no dynamic-code sink in the config path), and T19 (no remote-code load)
 * into one scan covering the ENTIRE src/ tree.
 *
 * This is a static source scan on purpose, not a lint-rule check: ESLint's
 * no-eval/no-new-func/no-restricted-syntax rules cover much of this, but
 * `// eslint-disable-next-line` defeats a lint rule locally while leaving
 * everything else green — a `fs`-based regex scan over the committed text
 * has no such escape hatch (per this task's own stated standard).
 *
 * RED when: any file under src/ contains eval(, new Function(,
 * setTimeout/setInterval called with a string first argument, an
 * innerHTML/outerHTML assignment, insertAdjacentHTML(, or a <script
 * src="http...">/dynamic import() of a non-bundled URL.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const SRC_ROOT = join(process.cwd(), "src");

const DYNAMIC_SINK_PATTERNS: readonly RegExp[] = [
  /\beval\s*\(/,
  /\bnew\s+Function\s*\(/,
  // setTimeout/setInterval with a STRING first argument (the classic
  // implied-eval form) — not the ordinary, safe function-reference form
  // this codebase actually uses (`setTimeout(() => ..., ms)`).
  /\bset(Timeout|Interval)\s*\(\s*['"`]/,
  /\.innerHTML\s*=/,
  /\.outerHTML\s*=/,
  /insertAdjacentHTML\s*\(/,
  // A <script src="http...">-shaped string, or a dynamic import() of a
  // non-relative/non-bundled URL.
  /<script[^>]+src\s*=\s*["']https?:/,
  /\bimport\s*\(\s*['"`]https?:/,
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

function scanForDynamicSink(text: string): RegExp[] {
  return DYNAMIC_SINK_PATTERNS.filter((pattern) => pattern.test(text));
}

describe("no dynamic-code sink anywhere in src/** — whole-tree merged guard (Invariant #6 / T04+T16+T19)", () => {
  const files = walk(SRC_ROOT);

  it("liveness — found a non-trivial corpus to scan (a misconfigured root must not pass vacuously)", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it("liveness — the scanner catches each of the four sink classes independently, so a partial regression in one can't hide behind the others passing", () => {
    // Four SEPARATE assertions, per the task's own note that a merged
    // regex covering all sink types could regress on just one silently.
    expect(scanForDynamicSink('eval("2 + 2")').length).toBeGreaterThan(0);
    expect(scanForDynamicSink('new Function("return 1")').length).toBeGreaterThan(0);
    expect(scanForDynamicSink('setTimeout("doStuff()", 0)').length).toBeGreaterThan(0);
    expect(scanForDynamicSink("el.innerHTML = untrusted").length).toBeGreaterThan(0);
  });

  it("liveness — the scanner does NOT flag the safe, function-reference form this codebase actually uses", () => {
    expect(scanForDynamicSink("setTimeout(() => doStuff(), 300)").length).toBe(0);
    expect(scanForDynamicSink("setInterval(tick, 1000)").length).toBe(0);
    expect(scanForDynamicSink("// no dynamic sinks here, just prose about fetching data").length).toBe(0);
  });

  it.each(files.map((f) => [f] as const))("%s contains no dynamic-code sink", (file) => {
    const src = readFileSync(file, "utf-8");
    const matches = scanForDynamicSink(src);
    expect(matches, `${file} matched dynamic-sink pattern(s): ${matches.join(", ")}`).toEqual([]);
  });
});
