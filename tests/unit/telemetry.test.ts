import { describe, expect, it } from "vitest";
import { validateEvent } from "../../src/telemetry/sink";

describe("measurement allowlist", () => {
  it("accepts the closed event set with no props", () => {
    for (const event of [
      "overlay_shown",
      "overlay_degraded",
      "impact_expanded",
      "overlay_dismissed",
    ]) {
      expect(() => validateEvent(event)).not.toThrow();
    }
  });

  it("accepts plan_added only with the allowlisted method values", () => {
    expect(() => validateEvent("plan_added", { method: "manual" })).not.toThrow();
    expect(() => validateEvent("plan_added", { method: "checkout_confirmed" })).not.toThrow();
    expect(() => validateEvent("plan_added", { method: "auto" })).toThrow();
  });

  it("rejects unknown events and non-allowlisted props", () => {
    expect(() => validateEvent("page_view")).toThrow(/unknown measurement event/);
    expect(() => validateEvent("overlay_shown", { extra: "1" })).toThrow(/not allowlisted/);
  });

  it("rejects forbidden data classes regardless of allowlist edits", () => {
    expect(() => validateEvent("plan_added", { orderTotal: "8996" })).toThrow(/forbidden class/);
    expect(() => validateEvent("plan_added", { merchantDomain: "x" })).toThrow(/forbidden class/);
  });
});
