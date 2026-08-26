import { describe, expect, it } from "vitest";
import { markInviteDismissed, markViewedNext30, readUsageFlags } from "../../../src/popup/usage-tracking";
import { validateUsageFlags } from "../../../src/storage/ledger";
import { createFakeStore } from "../overlay/test-helpers";

describe("popup/usage-tracking", () => {
  it("defaults to both flags false when nothing has been written", async () => {
    const store = createFakeStore();
    expect(await readUsageFlags(store)).toEqual({ viewedNext30: false, inviteDismissed: false });
  });

  it("markViewedNext30 persists true and leaves inviteDismissed untouched", async () => {
    const store = createFakeStore();
    await markViewedNext30(store);
    expect(await readUsageFlags(store)).toEqual({ viewedNext30: true, inviteDismissed: false });
  });

  it("markInviteDismissed persists true and leaves viewedNext30 untouched", async () => {
    const store = createFakeStore();
    await markViewedNext30(store);
    await markInviteDismissed(store);
    expect(await readUsageFlags(store)).toEqual({ viewedNext30: true, inviteDismissed: true });
  });

  it("writes nothing to any other storage key (no merchant/url/financial data possible in this schema)", async () => {
    const store = createFakeStore();
    await markViewedNext30(store);
    const result = await store.get(["plans", "settings"]);
    expect(result).toEqual({});
  });
});

describe("popup/usage-tracking — writes go through the validated seam, not straight to the store", () => {
  it("the raw value markViewedNext30 persists is exactly the closed, allowlisted usage-flags shape (no extra field could ever ride along)", async () => {
    const store = createFakeStore();
    await markViewedNext30(store);

    const raw = (await store.get(["usage"])).usage;
    // The behavioural proof: validateUsageFlags accepts what production
    // code actually wrote, and the raw object carries nothing beyond the
    // two allowlisted fields. RED if markViewedNext30/markInviteDismissed
    // ever go back to writing `{ [USAGE_KEY]: { ...current, x } }`
    // straight through KeyValueStore#set without routing it through
    // validateUsageFlags first (an unvalidated write would still often
    // happen to look like this shape, so the field-set assertion below —
    // not just "did it throw" — is the part that actually catches a
    // regression that reintroduces an extra field).
    expect(() => validateUsageFlags(raw)).not.toThrow();
    expect(Object.keys(raw as Record<string, unknown>).sort()).toEqual(["inviteDismissed", "viewedNext30"]);
  });

  it("a malformed 'usage' value already in storage (e.g. from an unvalidated write, or a corrupted/legacy shape) is never trusted -- readUsageFlags degrades to the safe default rather than returning it as-is", async () => {
    const store = createFakeStore({ usage: { viewedNext30: true, extraField: "should never surface" } });
    expect(await readUsageFlags(store)).toEqual({ viewedNext30: false, inviteDismissed: false });
  });

  it("markViewedNext30 self-heals a pre-existing malformed 'usage' value: the NEXT write is still the closed, validated shape, not the malformed one merged forward", async () => {
    const store = createFakeStore({ usage: { viewedNext30: false, extraField: "junk" } });
    await markViewedNext30(store);

    const raw = (await store.get(["usage"])).usage;
    expect(() => validateUsageFlags(raw)).not.toThrow();
    expect(raw).toEqual({ viewedNext30: true, inviteDismissed: false });
  });
});
