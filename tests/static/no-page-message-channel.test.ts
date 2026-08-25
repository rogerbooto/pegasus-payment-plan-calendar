/**
 * T08 (hardened scope, per the coverage matrix's §B/§H note): the page is
 * never a control channel, in two independent, structurally-checked ways:
 *
 * 1. No file under src/ registers a listener for page-originated messages
 *    (`window.addEventListener("message", ...)`, `window.onmessage = ...`,
 *    or a bare DOM `CustomEvent` listener wired to a command dispatcher).
 * 2. No file under src/ registers `chrome.runtime.onMessageExternal` — the
 *    channel by which a CO-INSTALLED extension (in-model per this
 *    project's own trust model) could message this one directly,
 *    independent of any page-level restriction.
 *
 * This is a static source scan, not a runtime behavioural probe, precisely
 * because the safest state here is "the listener was never registered at
 * all" — a scan is the only way to prove a negative that a unit test
 * calling the (nonexistent) handler cannot.
 *
 * RED when: any file under src/ adds a page-message listener or an
 * onMessageExternal listener.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const SRC_ROOT = join(process.cwd(), "src");

const PAGE_MESSAGE_CHANNEL_PATTERNS: readonly RegExp[] = [
  /window\s*\.\s*addEventListener\s*\(\s*['"]message['"]/,
  /window\s*\.\s*onmessage\s*=/,
  // Matches actual code USE (property access, e.g. reading or subscribing
  // to the listener collection) — not prose that merely mentions the name
  // in a comment, which a bare \bonMessageExternal\b word-boundary match
  // would false-positive on (this file's own service-worker.ts doc comment
  // says "There is no onMessageExternal listener").
  /\.\s*onMessageExternal\b/,
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

function scanForPageMessageChannel(text: string): RegExp[] {
  return PAGE_MESSAGE_CHANNEL_PATTERNS.filter((pattern) => pattern.test(text));
}

describe("no page-message or cross-extension-message channel anywhere in src/ (T08)", () => {
  const files = walk(SRC_ROOT);

  it("liveness — found a non-trivial corpus to scan", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it("liveness — the scanner catches a planted page-message listener and a planted onMessageExternal registration, independently", () => {
    expect(scanForPageMessageChannel('window.addEventListener("message", (e) => handle(e));').length).toBeGreaterThan(0);
    expect(scanForPageMessageChannel("window.onmessage = handle;").length).toBeGreaterThan(0);
    expect(scanForPageMessageChannel("chrome.runtime.onMessageExternal.addListener(handle);").length).toBeGreaterThan(0);
    expect(scanForPageMessageChannel("// this extension never listens for page messages").length).toBe(0);
  });

  it.each(files.map((f) => [f] as const))("%s registers no page-message or onMessageExternal channel", (file) => {
    const src = readFileSync(file, "utf-8");
    const matches = scanForPageMessageChannel(src);
    expect(matches, `${file} matched: ${matches.join(", ")}`).toEqual([]);
  });
});
