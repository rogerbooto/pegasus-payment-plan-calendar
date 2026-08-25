import { describe, expect, it } from "vitest";
import { normalizeOrReject } from "../../../src/parser/unicode";

/**
 * Pins the bidi / zero-width control rejection in normalizeOrReject.
 *
 * Why this file exists: every control character in that guard EXCEPT U+FEFF is
 * also caught downstream by the per-character allowlist, because U+FEFF is
 * matched by JavaScript's `\s`. So deleting the guard left the whole suite
 * green — the money grammar still rejected the result, and nothing failed.
 *
 * Nothing unsafe was reachable (both paths degrade, no wrong number), but a
 * mitigation no test pins is a mitigation that can be deleted in a refactor and
 * never noticed. These assertions are unit-level on purpose: they fail if the
 * guard is removed, regardless of what any downstream stage happens to do.
 */
describe("bidi / zero-width control rejection is pinned at the normalization boundary", () => {
  const CONTROLS: ReadonlyArray<readonly [string, string]> = [
    ["U+200B ZWSP", "​"],
    ["U+200C ZWNJ", "‌"],
    ["U+200D ZWJ", "‍"],
    ["U+200E LRM", "‎"],
    ["U+200F RLM", "‏"],
    ["U+202A LRE", "‪"],
    ["U+202D LRO", "‭"],
    ["U+202E RLO", "‮"],
    ["U+2066 LRI", "⁦"],
    ["U+2069 PDI", "⁩"],
    ["U+FEFF ZWNBSP", "﻿"],
  ];

  it.each(CONTROLS)("rejects an amount containing %s", (_name, ch) => {
    expect(normalizeOrReject(`CAD 3${ch}7.50`).kind).toBe("rejected");
  });

  it("U+FEFF specifically — the one control the downstream allowlist lets through", () => {
    // \s matches U+FEFF, so the per-character loop accepts it. If this passes
    // while the guard is gone, the guard has stopped guarding.
    expect(normalizeOrReject("CAD 3﻿7.50").kind).toBe("rejected");
  });

  it("still accepts the same amount with no control characters", () => {
    // Liveness: proves the assertions above fail for a reason, not always.
    const ok = normalizeOrReject("CAD 37.50");
    expect(ok.kind).toBe("ok");
  });
});
