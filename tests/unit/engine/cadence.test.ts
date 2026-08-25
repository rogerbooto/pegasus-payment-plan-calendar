/**
 * Cadence phrase resolution: only exact, named phrases resolve to the
 * closed Cadence enum. Anything else (an unmodelled cadence like "every 3
 * weeks", or unparseable text) resolves to null -- a missing scalar
 * upstream, never a guess.
 */
import { describe, expect, it } from "vitest";
import { resolveCadencePhrase } from "../../../src/engine/cadence";

describe("resolveCadencePhrase", () => {
  it.each([
    ["weekly", "WEEKLY"],
    ["every week", "WEEKLY"],
    ["chaque semaine", "WEEKLY"],
    ["every 2 weeks", "BIWEEKLY"],
    ["aux 2 semaines", "BIWEEKLY"],
    ["monthly", "MONTHLY"],
    ["every month", "MONTHLY"],
    ["chaque mois", "MONTHLY"],
  ] as const)("resolves %j to %s", (raw, expected) => {
    expect(resolveCadencePhrase(raw)).toBe(expected);
  });

  it("a cadence this product doesn't model (every 3 weeks) resolves to null, not a nearest guess", () => {
    expect(resolveCadencePhrase("every 3 weeks")).toBeNull();
  });

  it("undefined input (no cadence phrase captured at all) resolves to null", () => {
    expect(resolveCadencePhrase(undefined)).toBeNull();
  });

  it("unrecognized text resolves to null", () => {
    expect(resolveCadencePhrase("bimonthly")).toBeNull();
  });
});
