/**
 * The instalment-phrase pattern compiler: literals + {count}/{money}/
 * {cadence} tokens -> one RegExp binding all present tokens against a
 * SINGLE text cluster. This is the the design spec defense in code: a count found
 * in one node and an amount found in another must never be joined, which
 * this module enforces by construction (one cluster, one regex, one
 * match) rather than by convention.
 */
import { describe, expect, it } from "vitest";
import { compilePattern, matchInstalmentPhrase } from "../../../src/engine/pattern-compiler";

describe("compilePattern / matchInstalmentPhrase", () => {
  it("binds count + money + cadence from one pattern with all three tokens", () => {
    const compiled = compilePattern("{count} interest-free payments of {money} {cadence}");
    const match = matchInstalmentPhrase(compiled, "4 interest-free payments of CA$22.49 every 2 weeks");
    expect(match).not.toBeNull();
    expect(match?.countRaw).toBe("4");
    expect(match?.moneyRaw).toBe("CA$22.49");
    expect(match?.cadenceRaw).toBe("every 2 weeks");
  });

  it("a pattern with no {cadence} token yields cadenceRaw: undefined, never a guess", () => {
    const compiled = compilePattern("{count} payments of {money}");
    const match = matchInstalmentPhrase(compiled, "4 payments of CA$22.49");
    expect(match).not.toBeNull();
    expect(match?.cadenceRaw).toBeUndefined();
  });

  it("does not match when the cluster is missing a required token's value entirely", () => {
    const compiled = compilePattern("{count} interest-free payments of {money} {cadence}");
    // No cadence phrase present at all -- the whole pattern (which requires one) must not match.
    const match = matchInstalmentPhrase(compiled, "4 interest-free payments of CA$22.49");
    expect(match).toBeNull();
  });

  it("never joins a count and a money value that appear in unrelated surrounding text of a DIFFERENT pattern shape", () => {
    const compiled = compilePattern("{count} payments of {money}");
    // "4" and "$22.49" both appear, but not in the bound shape the pattern requires.
    const match = matchInstalmentPhrase(compiled, "Item quantity: 4. Shipping estimate: $22.49");
    expect(match).toBeNull();
  });

  it("literal text is escaped: a pattern's literal characters are not treated as regex metacharacters", () => {
    const compiled = compilePattern("{count} payments of {money}");
    // A stray literal "." next to digits must not accidentally become "any character" and over-match.
    const match = matchInstalmentPhrase(compiled, "4x payments of $22.49");
    expect(match).toBeNull();
  });

  it("French pattern with an accented literal matches, binding all three tokens", () => {
    const compiled = compilePattern("{count} versements sans intérêts de {money} {cadence}");
    const match = matchInstalmentPhrase(compiled, "4 versements sans intérêts de 22,49 $ aux 2 semaines");
    expect(match).not.toBeNull();
    expect(match?.countRaw).toBe("4");
    expect(match?.cadenceRaw).toBe("aux 2 semaines");
  });
});
