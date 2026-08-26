/**
 * src/popup/copy.ts's MARKETING_HOST_CONFIGURED gate, tested directly —
 * not only through PopupApp's rendering behaviour (tests/unit/popup/popup-
 * app.test.ts covers that separately). Two things this file pins:
 *
 * 1. isMarketingHostConfigured (the predicate MARKETING_HOST_CONFIGURED is
 *    built from) actually flips both ways against synthetic hosts — a
 *    constant that happens to be false right now proves nothing about
 *    whether it would ever become true.
 * 2. The real, shipped MARKETING_HOST_CONFIGURED reflects the real,
 *    shipped MARKETING_HOST's current (still-placeholder) state.
 *
 * RED when: the `.invalid` check stops being the gate, in either
 * direction, or MARKETING_HOST_CONFIGURED and MARKETING_HOST drift apart.
 */
import { describe, expect, it } from "vitest";
import { LAUNCH_NOTIFY_URL, MARKETING_HOST, MARKETING_HOST_CONFIGURED, isMarketingHostConfigured } from "../../../src/popup/copy";

describe("isMarketingHostConfigured — the `.invalid` gate, both directions", () => {
  it("is false for a host that still contains the reserved `.invalid` placeholder", () => {
    expect(isMarketingHostConfigured("https://marketing.pegasus.invalid")).toBe(false);
  });

  it("is false for ANY host containing `.invalid`, not only the exact current placeholder string — a future subdomain change must not accidentally flip this true", () => {
    expect(isMarketingHostConfigured("https://something-else.invalid/path")).toBe(false);
  });

  it("is true for a host that does not contain `.invalid` — the other reserved, non-resolving TLD `.example` stands in here so this test never writes a real hostname", () => {
    expect(isMarketingHostConfigured("https://marketing.pegasus.example")).toBe(true);
  });
});

describe("MARKETING_HOST_CONFIGURED — the real, shipped constant", () => {
  it("reflects MARKETING_HOST's current, still-placeholder state (false) — this assertion is expected to flip to true, deliberately, on the day MARKETING_HOST is assigned a real origin", () => {
    expect(MARKETING_HOST).toContain(".invalid");
    expect(MARKETING_HOST_CONFIGURED).toBe(false);
    expect(MARKETING_HOST_CONFIGURED).toBe(isMarketingHostConfigured(MARKETING_HOST));
  });

  it("LAUNCH_NOTIFY_URL is always built from MARKETING_HOST — it inherits whatever configuration state MARKETING_HOST is in, rather than carrying a second, independently-editable URL", () => {
    expect(LAUNCH_NOTIFY_URL.startsWith(MARKETING_HOST)).toBe(true);
  });
});
