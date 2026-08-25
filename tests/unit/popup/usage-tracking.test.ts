import { describe, expect, it } from "vitest";
import { markInviteDismissed, markViewedNext30, readUsageFlags } from "../../../src/popup/usage-tracking";
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
