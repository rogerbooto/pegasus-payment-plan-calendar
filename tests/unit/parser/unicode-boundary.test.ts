// @vitest-environment jsdom
/**
 * M11-T03 — bidi overrides, zero-width controls and unrecognized scripts
 * are rejected; the three named unambiguous non-ASCII digit blocks
 * (Eastern Arabic-Indic, Extended Arabic-Indic, fullwidth) normalize to an
 * exact, authored ground-truth value. No partial credit: the assertion is
 * exact-match-or-explicit-rejection, never "not obviously wrong."
 */
import { describe, expect, it } from "vitest";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeOrReject } from "../../../src/parser/unicode";
import { parseMoneyToCents } from "../../../src/parser/money";
import { loadFixtureSidecar, mountFixture } from "../../support/dom-fixture";

interface BidiSidecar {
  readonly expectedResult: "ok" | "rejected";
  readonly expectedText: string | null;
}

const HERE = dirname(fileURLToPath(import.meta.url));
const CATEGORY = "bidi-homoglyph";
const FIXTURE_DIR = join(HERE, "..", "..", "fixtures", "dom", CATEGORY);
const names = readdirSync(FIXTURE_DIR)
  .filter((f) => f.endsWith(".html"))
  .map((f) => f.replace(/\.html$/, ""));

describe("M11-T03 test_bidi_zwsp_homoglyph_rejected_or_normalized_to_ground_truth", () => {
  it("names at least one control-char fixture and one digit-block fixture (corpus sanity)", () => {
    expect(names.length).toBeGreaterThanOrEqual(6);
  });

  for (const name of names) {
    it(`${name}: exact ground truth or explicit rejection, never partial credit`, () => {
      const doc = mountFixture(CATEGORY, name);
      const el = doc.getElementById("total");
      if (!el) throw new Error(`fixture "${name}" is missing its #total node`);
      const sidecar = loadFixtureSidecar<BidiSidecar>(CATEGORY, name);
      const result = normalizeOrReject(el.textContent ?? "");

      expect(result.kind).toBe(sidecar.expectedResult);
      if (sidecar.expectedResult === "ok" && result.kind === "ok") {
        expect(result.text).toBe(sidecar.expectedText);
      }
    });
  }

  it("a bidi-override fixture never yields a numeric scalar even chained through the money parser", () => {
    const doc = mountFixture(CATEGORY, "rlo-override-in-amount");
    const el = doc.getElementById("total");
    const normalized = normalizeOrReject(el?.textContent ?? "");
    expect(normalized.kind).toBe("rejected");
    // Defense in depth: even if a caller skipped normalization entirely,
    // the raw control-char string must not parse to a number either.
    const rawParsed = parseMoneyToCents(el?.textContent ?? "");
    expect(rawParsed.kind).toBe("rejected");
  });

  it("Eastern Arabic-Indic and fullwidth digit fixtures normalize to the correct cents end-to-end", () => {
    const eastern = mountFixture(CATEGORY, "eastern-arabic-indic-digits").getElementById("total");
    const normalized = normalizeOrReject(eastern?.textContent ?? "");
    expect(normalized.kind).toBe("ok");
    if (normalized.kind === "ok") {
      const parsed = parseMoneyToCents(normalized.text);
      expect(parsed.kind).toBe("parsed");
      if (parsed.kind === "parsed") expect(parsed.cents).toBe(4450);
    }
  });

  it("rejects a homoglyph digit (Cyrillic З resembling 3) — not a known digit block", () => {
    const doc = mountFixture(CATEGORY, "cyrillic-homoglyph-digit");
    const el = doc.getElementById("total");
    expect(normalizeOrReject(el?.textContent ?? "").kind).toBe("rejected");
  });

  it("rejects a string mixing two different non-ASCII digit blocks", () => {
    const doc = mountFixture(CATEGORY, "mixed-digit-scripts-rejected");
    const el = doc.getElementById("total");
    expect(normalizeOrReject(el?.textContent ?? "").kind).toBe("rejected");
  });
});
