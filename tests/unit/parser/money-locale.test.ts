// @vitest-environment jsdom
/**
 * T02 — the parser resolves currency/locale deterministically or
 * returns unrecognized; it never guesses on ambiguous separators/currency.
 * Universally quantified over the fixture corpus, not one example: a
 * partial regression that fixes one convention and breaks another must
 * still turn this file red.
 */
import { describe, expect, it } from "vitest";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseMoneyToCents } from "../../../src/parser/money";
import { loadFixtureSidecar, mountFixture } from "../../support/dom-fixture";
import type { Cents } from "../../../src/shared/money";
import type { Currency } from "../../../src/shared/types";

interface LocaleSidecar {
  readonly expectedResult: "parsed" | "rejected";
  readonly expectedCents: number | null;
  readonly expectedCurrency: Currency | null;
  readonly expectedReason: string | null;
}

const HERE = dirname(fileURLToPath(import.meta.url));
const CATEGORY = "locale-currency";
const FIXTURE_DIR = join(HERE, "..", "..", "fixtures", "dom", CATEGORY);
const names = readdirSync(FIXTURE_DIR)
  .filter((f) => f.endsWith(".html"))
  .map((f) => f.replace(/\.html$/, ""));

describe("T02 test_ambiguous_locale_never_returns_a_number — the full locale-currency corpus", () => {
  it("names at least one fixture per required grammar shape (corpus sanity — a guard cannot pass on zero fixtures)", () => {
    expect(names.length).toBeGreaterThanOrEqual(8);
  });

  for (const name of names) {
    it(`${name}: matches the ground truth exactly, never a guess`, () => {
      const doc = mountFixture(CATEGORY, name);
      const el = doc.getElementById("total");
      if (!el) throw new Error(`fixture "${name}" is missing its #total node`);
      const sidecar = loadFixtureSidecar<LocaleSidecar>(CATEGORY, name);
      const result = parseMoneyToCents(el.textContent ?? "");

      if (sidecar.expectedResult === "rejected") {
        expect(result.kind).toBe("rejected");
        if (result.kind === "rejected" && sidecar.expectedReason) {
          expect(result.reason).toBe(sidecar.expectedReason);
        }
        return;
      }

      expect(result.kind).toBe("parsed");
      if (result.kind === "parsed") {
        expect(result.cents).toBe(sidecar.expectedCents as Cents);
        expect(result.currency).toBe(sidecar.expectedCurrency);
      }
    });
  }

  it("the design spec's named example: a single dot with three trailing digits is ambiguous, never accepted", () => {
    const result = parseMoneyToCents("USD 1.234");
    expect(result.kind).toBe("rejected");
    if (result.kind === "rejected") expect(result.reason).toBe("ambiguous_separators");
  });

  it("D6's cross-format example resolves EN-CA and EU-style grouping to the identical value", () => {
    const en = parseMoneyToCents("CAD 1,234.56");
    const eu = parseMoneyToCents("CAD 1.234,56");
    expect(en.kind).toBe("parsed");
    expect(eu.kind).toBe("parsed");
    if (en.kind === "parsed" && eu.kind === "parsed") {
      expect(en.cents).toBe(eu.cents);
      expect(en.cents).toBe(123456);
    }
  });

  it("never returns a numeric value for any fixture whose ground truth says rejected — universally, not just one case", () => {
    const rejectedNames = names.filter((name) => {
      const sidecar = loadFixtureSidecar<LocaleSidecar>(CATEGORY, name);
      return sidecar.expectedResult === "rejected";
    });
    expect(rejectedNames.length).toBeGreaterThan(0);
    for (const name of rejectedNames) {
      const doc = mountFixture(CATEGORY, name);
      const el = doc.getElementById("total");
      const result = parseMoneyToCents(el?.textContent ?? "");
      expect(result.kind, `fixture "${name}" must be rejected`).toBe("rejected");
    }
  });
});
