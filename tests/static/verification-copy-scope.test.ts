/**
 * T14, second half: genuineness is asserted ONLY via the toolbar
 * verification surface. `toolbar-verification.test.ts` already proves the
 * overlay contains no credential input; this file proves the OTHER half
 * of the finding — that genuineness/official-shaped LANGUAGE itself never
 * leaks into any other overlay surface (a page can draw a pixel-identical
 * overlay, so if the real overlay ever says "verified"/"genuine"/
 * "official" anywhere outside the toolbar module, a clone gets to say it
 * too, for free).
 *
 * Scoped to src/overlay/** (the in-page injected panel), excluding
 * src/overlay/ToolbarVerification.ts itself, which is where this language
 * is REQUIRED to live (it renders inside the browser-toolbar popup, never
 * inside the page-injected overlay — see src/popup/PopupApp.ts's
 * "verify" screen). src/popup/** is NOT scanned here: the toolbar popup
 * itself (as opposed to the in-page overlay) is the one place this
 * language belongs by design (T14 — "genuineness is asserted only via the
 * extension TOOLBAR surface, never in-overlay").
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const OVERLAY_ROOT = join(process.cwd(), "src", "overlay");
const EXCLUDED_FILE = join(OVERLAY_ROOT, "ToolbarVerification.ts");

const GENUINENESS_PATTERNS: readonly RegExp[] = [/\bverif(y|ied|ication)\b/i, /\bgenuine\b/i, /\bofficial\b/i];

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

function scanForGenuinenessLanguage(text: string): RegExp[] {
  return GENUINENESS_PATTERNS.filter((pattern) => pattern.test(text));
}

describe("verification/genuineness copy lives only in ToolbarVerification.ts (T14)", () => {
  const files = walk(OVERLAY_ROOT).filter((f) => f !== EXCLUDED_FILE);

  it("liveness — found a non-trivial corpus to scan (excluding the one file allowed to contain this language)", () => {
    expect(files.length).toBeGreaterThan(3);
  });

  it("liveness — the scanner catches a planted 'verified'/'genuine'/'official' string", () => {
    expect(scanForGenuinenessLanguage("This panel is verified.").length).toBeGreaterThan(0);
    expect(scanForGenuinenessLanguage("The genuine article.").length).toBeGreaterThan(0);
    expect(scanForGenuinenessLanguage("An official Pegasus panel.").length).toBeGreaterThan(0);
    expect(scanForGenuinenessLanguage("This plan adds 4 payments.").length).toBe(0);
  });

  it("ToolbarVerification.ts itself DOES contain this language (a sanity check that the scanner isn't just matching nothing everywhere)", () => {
    const src = readFileSync(EXCLUDED_FILE, "utf-8");
    expect(scanForGenuinenessLanguage(src).length).toBeGreaterThan(0);
  });

  it.each(files.map((f) => [f] as const))("%s contains no verify/genuine/official-shaped copy", (file) => {
    const src = readFileSync(file, "utf-8");
    const matches = scanForGenuinenessLanguage(src);
    expect(matches, `${file} matched: ${matches.join(", ")}`).toEqual([]);
  });
});
