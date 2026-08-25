/**
 * Mirror snapshot test: the extension's FORBIDDEN_PROP_KEYS must remain a
 * SUPERSET of the canonical Pegasus app forbidden-key set (never equal-by-
 * coincidence, never a subset). The app's own set is the floor — the
 * extension is free to forbid additional checkout-specific classes (cart,
 * sku, price, ...) the app has no concept of, and must never drop one of
 * the app's classes to "match" it.
 *
 * This file has no dependency on the private Pegasus repo; it checks the
 * extension's live constant against the committed snapshot in
 * tests/fixtures/canonical-forbidden-keys-snapshot.ts. Refresh the snapshot
 * via a reviewed PR when the app's canonical set changes.
 */
import { describe, expect, it } from "vitest";
import { FORBIDDEN_PROP_KEYS } from "../../src/telemetry/constants";
import { CANONICAL_FORBIDDEN_KEYS_SNAPSHOT } from "../fixtures/canonical-forbidden-keys-snapshot";

describe("extension FORBIDDEN_PROP_KEYS superset of the canonical app snapshot", () => {
  it("liveness — the snapshot itself is non-empty (a broken fixture must not pass vacuously)", () => {
    expect(CANONICAL_FORBIDDEN_KEYS_SNAPSHOT.size).toBeGreaterThan(0);
  });

  it("liveness — the extension's set is non-empty and of a plausible size (a broken extractor must not pass on nothing)", () => {
    // 62 canonical keys + at least a handful of extension-specific classes.
    // A collapse to a tiny or empty set means FORBIDDEN_PROP_KEYS stopped
    // being populated, not that the app's set shrank.
    expect(FORBIDDEN_PROP_KEYS.size).toBeGreaterThanOrEqual(70);
  });

  it("is a strict superset: every canonical app key is present in the extension's set", () => {
    const missing = [...CANONICAL_FORBIDDEN_KEYS_SNAPSHOT].filter(
      (key) => !FORBIDDEN_PROP_KEYS.has(key),
    );
    expect(
      missing,
      `extension FORBIDDEN_PROP_KEYS is missing app-forbidden keys: ${missing.join(", ")}. ` +
        "The extension must forbid everything the app forbids, plus its own additions — " +
        "never fewer.",
    ).toEqual([]);
  });

  it("liveness — the extension carries at least one class the app snapshot does not (proves this isn't equality-in-disguise)", () => {
    const extensionOnly = [...FORBIDDEN_PROP_KEYS].filter(
      (key) => !CANONICAL_FORBIDDEN_KEYS_SNAPSHOT.has(key),
    );
    expect(
      extensionOnly.length,
      "expected extension-specific forbidden classes (e.g. cart, sku, price) beyond the " +
        "app's canonical set; if this is empty, either the snapshot drifted or the " +
        "extension's own classes were deleted",
    ).toBeGreaterThan(0);
  });
});
