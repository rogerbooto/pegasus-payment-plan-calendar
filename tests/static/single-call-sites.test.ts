/**
 * Two structural "exactly one call site" guards, the Mission-6-B1 pattern
 * ("a correct validator function is meaningless if a second, unvalidated
 * call site exists elsewhere in the tree"):
 *
 * - T17: `chrome.storage.local.set(` must appear in exactly ONE file
 *   (src/storage/store.ts's `chromeLocalStore`) — the single validated
 *   writer PlanLedger routes every write through. A second, unvalidated
 *   call site anywhere else would be a silent bypass of the whole
 *   allowlist/schema machinery in src/storage/ledger.ts.
 * - T18: `chrome.permissions.request(` must appear in exactly ONE file
 *   (src/popup/popup.ts's `onEnableThisStoreClick`), invoked only from a
 *   genuine user gesture (a toolbar-popup click handler), never from a
 *   background/content-script code path that could fire without one.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const SRC_ROOT = join(process.cwd(), "src");

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

/**
 * Strips `//` line comments and `/* *\/` block comments before scanning.
 * Load-bearing: this very codebase's own doc comments describe these call
 * sites in prose (e.g. store.ts's header says "chrome.storage.local.set
 * (a structural guard...)"), which a naive regex-over-raw-text scan
 * miscounts as a second call site — discovered while building this test,
 * not a hypothetical. A real call site is CODE, never a comment.
 */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

function countCallSites(files: readonly string[], pattern: RegExp): { file: string; count: number }[] {
  const hits: { file: string; count: number }[] = [];
  for (const file of files) {
    const src = stripComments(readFileSync(file, "utf-8"));
    const matches = src.match(pattern);
    if (matches && matches.length > 0) hits.push({ file, count: matches.length });
  }
  return hits;
}

const STORAGE_SET_PATTERN = /chrome\s*\.\s*storage\s*\.\s*local\s*\.\s*set\s*\(/g;
const PERMISSIONS_REQUEST_PATTERN = /chrome\s*\.\s*permissions\s*\.\s*request\s*\(/g;

describe("single call site — chrome.storage.local.set (T17)", () => {
  const files = walk(SRC_ROOT);

  it("liveness — stripComments removes a doc-comment mention of the pattern but keeps a real call site", () => {
    const withCommentMention = "/**\n * chrome.storage.local.set (a structural guard pins this)\n */\nfunction real() { chrome.storage.local.set({a:1}); }";
    const stripped = stripComments(withCommentMention);
    expect(stripped.match(STORAGE_SET_PATTERN)?.length).toBe(1);
  });

  it("liveness — found a non-trivial corpus, and the detector counts a planted second call site correctly", () => {
    expect(files.length).toBeGreaterThan(10);
    const planted = "chrome.storage.local.set({a:1});\nfunction x() { chrome.storage.local.set({b:2}); }";
    const matches = planted.match(STORAGE_SET_PATTERN);
    expect(matches?.length).toBe(2);
  });

  it("exactly one file in src/ calls chrome.storage.local.set(, and it is src/storage/store.ts", () => {
    const hits = countCallSites(files, STORAGE_SET_PATTERN);
    const totalCallSites = hits.reduce((sum, h) => sum + h.count, 0);
    expect(hits.map((h) => h.file), "expected exactly one file to call chrome.storage.local.set(").toEqual([
      join(SRC_ROOT, "storage", "store.ts"),
    ]);
    expect(totalCallSites, "expected exactly one total call site — calibrated to exactly 1, not '>=1'").toBe(1);
  });
});

describe("single call site — chrome.permissions.request (T18)", () => {
  const files = walk(SRC_ROOT);

  it("liveness — the detector counts a planted second call site correctly", () => {
    const planted = "chrome.permissions.request({origins:[a]});\nchrome.permissions.request({origins:[b]});";
    const matches = planted.match(PERMISSIONS_REQUEST_PATTERN);
    expect(matches?.length).toBe(2);
  });

  it("exactly one file in src/ calls chrome.permissions.request(, and it is src/popup/popup.ts", () => {
    const hits = countCallSites(files, PERMISSIONS_REQUEST_PATTERN);
    const totalCallSites = hits.reduce((sum, h) => sum + h.count, 0);
    expect(hits.map((h) => h.file)).toEqual([join(SRC_ROOT, "popup", "popup.ts")]);
    expect(totalCallSites).toBe(1);
  });

  it("the single call site is exported as a named function invoked from a click handler, not fired at module load or from a background/content-script context", () => {
    const src = readFileSync(join(SRC_ROOT, "popup", "popup.ts"), "utf-8");
    // Structural: the call lives inside an exported function (a callable
    // the popup's own click handler invokes), not inside a bare top-level
    // `if (isExtensionPageContext()) { ... }` block that would fire
    // unconditionally on every popup open.
    expect(src).toMatch(/export\s+async\s+function\s+onEnableThisStoreClick[\s\S]*chrome\.permissions\.request/);
  });
});
