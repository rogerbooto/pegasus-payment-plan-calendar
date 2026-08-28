/**
 * @vitest-environment jsdom
 *
 * The overlay's third tab strip entry ("Plans you've entered") and the F3
 * fix it required: a tab strip that renders all three buttons but only
 * ever swaps content behind ONE of them is worse than no tab strip, because
 * it looks operable and isn't. Every assertion below is on DOM structure
 * (element ids, aria attributes, button text, focus target) or on the
 * ledger's own stored records — jsdom performs no layout, so nothing here
 * reads a computed style or a bounding rect; a test that could only fail by
 * reading pixels would not be able to fail at all under jsdom, which is
 * exactly the "test that cannot fail" this suite avoids.
 *
 * Reaching into the panel requires the same closed-shadow-root capture
 * `overlay-host-structural.test.ts` uses (T11: `host.shadowRoot` is `null`
 * from outside by design).
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createOverlayHost, OVERLAY_HOST_TAG } from "../../../src/overlay/OverlayHost";
import { createPopupApp } from "../../../src/popup/PopupApp";
import { PlanLedger } from "../../../src/storage/ledger";
import { createFakeStore } from "./test-helpers";
import * as PlanList from "../../../src/overlay/PlanList";
import type { EngineState, PaymentPlanRecord } from "../../../src/shared/types";
import { assertCents } from "../../../src/shared/money";

const capturedShadowRoots = new WeakMap<Element, ShadowRoot>();
let originalAttachShadow: typeof Element.prototype.attachShadow;

beforeAll(() => {
  originalAttachShadow = Element.prototype.attachShadow;
  Element.prototype.attachShadow = function (init: ShadowRootInit): ShadowRoot {
    const root = originalAttachShadow.call(this, init);
    capturedShadowRoots.set(this, root);
    return root;
  };
});

afterAll(() => {
  Element.prototype.attachShadow = originalAttachShadow;
});

function getShadow(doc: Document): ShadowRoot {
  const host = doc.body.querySelector(OVERLAY_HOST_TAG);
  if (!host) throw new Error("overlay host not mounted");
  const shadow = capturedShadowRoots.get(host);
  if (!shadow) throw new Error("shadow root was not captured for this host");
  return shadow;
}

function recognizedState(): EngineState {
  return {
    kind: "PARSED_CONFIRMABLE",
    candidate: {
      orderTotalCents: assertCents(15000, "total"),
      installmentCount: 4,
      cadence: "BIWEEKLY",
      perInstallmentCents: assertCents(3750, "each"),
      currency: "CAD",
      confidence: { hardGatesPassed: true, softScore: 6, signals: [] },
    },
  };
}

function makePlan(id: string, overrides: Partial<PaymentPlanRecord> = {}): PaymentPlanRecord {
  return {
    id,
    createdAt: "2026-05-01",
    source: "manual",
    currency: "CAD",
    orderTotalCents: assertCents(6000, "total"),
    installmentCount: 4,
    cadence: "MONTHLY",
    perInstallmentCents: assertCents(1500, "each"),
    firstPaymentDate: "2026-06-01",
    customName: "",
    ...overrides,
  };
}

/** Flushes the ledger-read microtask chain OverlayHost's async body-render awaits. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function tabButton(shadow: ShadowRoot, label: string): HTMLButtonElement | undefined {
  return [...shadow.querySelectorAll('[role="tab"]')].find((b) => b.textContent === label) as HTMLButtonElement | undefined;
}

function tabPanel(shadow: ShadowRoot): HTMLElement | null {
  return shadow.querySelector('[role="tabpanel"]');
}

function rowButtons(shadow: ShadowRoot, startsWith: "Edit" | "Remove"): HTMLButtonElement[] {
  return [...shadow.querySelectorAll(".rows li button")].filter((b) => b.textContent?.startsWith(startsWith)) as HTMLButtonElement[];
}

function statusNotice(shadow: ShadowRoot): HTMLElement | null {
  return shadow.querySelector(".status[role=status]");
}

beforeEach(() => {
  document.body.replaceChildren();
  document.head.replaceChildren();
});

describe("OverlayHost — the plans tab and the F3 fix (tab strip must actually switch content)", () => {
  it("all three tabs render distinct content, and the tabpanel id/aria-labelledby track the SELECTED tab, not a hardcoded one", async () => {
    const store = createFakeStore();
    const ledger = new PlanLedger(store);
    await ledger.addPlan(makePlan("11111111-1111-4111-8111-111111111111"));
    const controller = createOverlayHost(document, { store, ledger, today: () => "2026-06-01" });
    controller.mount(recognizedState());
    await flush();

    let shadow = getShadow(document);
    // Default landing tab: "This plan" -- the live candidate preview, no
    // Edit/Remove controls, no next-30 summary line.
    expect(tabButton(shadow, "This plan")?.getAttribute("aria-selected")).toBe("true");
    expect(tabPanel(shadow)?.id).toBe("ppc-panel-plan");
    expect(tabPanel(shadow)?.getAttribute("aria-labelledby")).toBe("ppc-tab-plan");
    expect(rowButtons(shadow, "Edit")).toHaveLength(0);
    expect([...shadow.querySelectorAll("button")].some((b) => b.textContent === "Check the numbers")).toBe(true);

    // Switch to "Next 30 days" -- a RED here (same content, or the old
    // "ppc-panel-plan" id) is exactly the F3 defect this test exists for.
    tabButton(shadow, "Next 30 days")!.click();
    await flush();
    shadow = getShadow(document);
    expect(tabPanel(shadow)?.id).toBe("ppc-panel-next30");
    expect(tabPanel(shadow)?.getAttribute("aria-labelledby")).toBe("ppc-tab-next30");
    expect(rowButtons(shadow, "Edit")).toHaveLength(0);
    expect(shadow.textContent).toContain("Your next 30 days:");

    // Switch to "Plans you've entered" -- the new tab. Distinct content
    // (an Edit control per saved plan), distinct id.
    tabButton(shadow, "Plans you've entered")!.click();
    await flush();
    shadow = getShadow(document);
    expect(tabPanel(shadow)?.id).toBe("ppc-panel-plans");
    expect(tabPanel(shadow)?.getAttribute("aria-labelledby")).toBe("ppc-tab-plans");
    expect(rowButtons(shadow, "Edit")).toHaveLength(1);
    expect(shadow.textContent).not.toContain("Your next 30 days:");

    // And back to "This plan" -- proves this isn't a one-way ratchet.
    tabButton(shadow, "This plan")!.click();
    await flush();
    shadow = getShadow(document);
    expect(rowButtons(shadow, "Edit")).toHaveLength(0);
    expect([...shadow.querySelectorAll("button")].some((b) => b.textContent === "Check the numbers")).toBe(true);
  });

  it("after actually confirming a plan (the old hardcoded-id branch, OverlayHost.ts:681), the tabpanel still tracks the selected tab", async () => {
    const store = createFakeStore();
    const ledger = new PlanLedger(store);
    const controller = createOverlayHost(document, { store, ledger, today: () => "2026-06-01" });
    controller.mount(recognizedState());
    await flush();

    let shadow = getShadow(document);
    [...shadow.querySelectorAll("button")].find((b) => b.textContent === "Check the numbers")!.click();
    await flush();
    shadow = getShadow(document);
    const form = shadow.querySelector("form") as HTMLFormElement;
    expect(form).not.toBeNull();
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await flush();

    // Landed on the post-confirm "plans" screen. "This plan" must NOT be
    // offered here -- there is no live candidate left to preview.
    shadow = getShadow(document);
    expect(tabButton(shadow, "This plan")).toBeUndefined();
    expect(tabButton(shadow, "Plans you've entered")?.getAttribute("aria-selected")).toBe("true");
    expect(tabPanel(shadow)?.id).toBe("ppc-panel-plans");
    expect(shadow.textContent).toContain("Added. These dates are on your calendar now.");
    expect(rowButtons(shadow, "Edit")).toHaveLength(1);

    // The exact regression: switching tabs on THIS screen used to render
    // identical content with a hardcoded "ppc-panel-plan" id no matter
    // which tab was selected.
    tabButton(shadow, "Next 30 days")!.click();
    await flush();
    shadow = getShadow(document);
    expect(tabPanel(shadow)?.id).toBe("ppc-panel-next30");
    expect(rowButtons(shadow, "Edit")).toHaveLength(0);
    expect(shadow.textContent).toContain("Your next 30 days:");
  });
});

describe("OverlayHost — per-row Edit opens the correct plan", () => {
  it("Edit on the second row prefills THAT plan's numbers, not the first row's", async () => {
    const store = createFakeStore();
    const ledger = new PlanLedger(store);
    await ledger.addPlan(makePlan("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", { orderTotalCents: assertCents(6000, "a"), firstPaymentDate: "2026-06-01" }));
    await ledger.addPlan(makePlan("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", { orderTotalCents: assertCents(9000, "b"), firstPaymentDate: "2026-07-01" }));
    const controller = createOverlayHost(document, { store, ledger, today: () => "2026-06-01" });
    controller.mount(recognizedState());
    await flush();

    let shadow = getShadow(document);
    tabButton(shadow, "Plans you've entered")!.click();
    await flush();
    shadow = getShadow(document);
    const edits = rowButtons(shadow, "Edit");
    expect(edits).toHaveLength(2);

    edits[1]!.click(); // the later-dated (second, $90.00) plan
    await flush();
    shadow = getShadow(document);
    expect(shadow.textContent).toContain("Change these numbers");
    const totalInput = shadow.querySelector("#ppc-f-total") as HTMLInputElement;
    expect(totalInput).not.toBeNull();
    expect(totalInput.value).toContain("90.00");
    expect(totalInput.value).not.toContain("60.00");

    // Cancel returns to the plans tab with both rows intact, and moves
    // focus to the panel heading (render() otherwise drops focus on every
    // transition -- see cancelForm's own comment).
    const cancelBtn = [...shadow.querySelectorAll("button")].find((b) => b.textContent === "Cancel") as HTMLButtonElement;
    cancelBtn.click();
    await flush();
    shadow = getShadow(document);
    expect(rowButtons(shadow, "Edit")).toHaveLength(2);
    expect(shadow.activeElement?.id).toBe("ppc-title");
  });
});

describe("OverlayHost — a rename-only edit through the plans tab", () => {
  it("writes the typed name, keeps source checkout_confirmed, and lands on the plans tab with the name visible in its row", async () => {
    const store = createFakeStore();
    const ledger = new PlanLedger(store);
    await ledger.addPlan(makePlan("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", { source: "checkout_confirmed" }));
    const controller = createOverlayHost(document, { store, ledger, today: () => "2026-06-01" });
    controller.mount(recognizedState());
    await flush();

    let shadow = getShadow(document);
    tabButton(shadow, "Plans you've entered")!.click();
    await flush();
    shadow = getShadow(document);
    rowButtons(shadow, "Edit")[0]!.click();
    await flush();
    shadow = getShadow(document);

    const nameInput = shadow.querySelector("#ppc-f-name") as HTMLInputElement;
    expect(nameInput).not.toBeNull();
    nameInput.value = "Laptop";
    (shadow.querySelector("form") as HTMLFormElement).dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await flush();

    // Persisted through updatePlan -- the store, not just the screen.
    const savedPlans = (await store.get(["plans"]))["plans"] as PaymentPlanRecord[];
    expect(savedPlans[0]?.customName).toBe("Laptop");
    expect(savedPlans[0]?.source).toBe("checkout_confirmed");

    shadow = getShadow(document);
    expect(statusNotice(shadow)?.textContent).toBe("Saved. The dates on your calendar didn't change.");
    expect(shadow.querySelector(".rows li .name")?.textContent).toBe("Laptop");
  });
});

describe("OverlayHost — per-row Remove drops only that plan (the founder's named trap)", () => {
  it("removing the middle plan of three leaves the other two, shows Removed + Add it back, and moves focus to the notice", async () => {
    const store = createFakeStore();
    const ledger = new PlanLedger(store);
    await ledger.addPlan(makePlan("11111111-1111-4111-8111-111111111111", { firstPaymentDate: "2026-06-01" }));
    await ledger.addPlan(makePlan("22222222-2222-4222-8222-222222222222", { firstPaymentDate: "2026-07-01" }));
    await ledger.addPlan(makePlan("33333333-3333-4333-8333-333333333333", { firstPaymentDate: "2026-08-01" }));
    const controller = createOverlayHost(document, { store, ledger, today: () => "2026-06-01" });
    controller.mount(recognizedState());
    await flush();

    let shadow = getShadow(document);
    tabButton(shadow, "Plans you've entered")!.click();
    await flush();
    shadow = getShadow(document);
    let removeButtons = rowButtons(shadow, "Remove");
    expect(removeButtons).toHaveLength(3);

    removeButtons[1]!.click(); // the middle plan (id "22222222...")
    await flush();
    shadow = getShadow(document);

    // Not the old trap: the other two rows are still there, not a blank
    // one-line "Removed." screen with no way back to them.
    expect(rowButtons(shadow, "Edit")).toHaveLength(2);
    removeButtons = rowButtons(shadow, "Remove");
    expect(removeButtons).toHaveLength(2);

    const remaining = await ledger.listPlans();
    expect(remaining.map((p) => p.id).sort()).toEqual(["11111111-1111-4111-8111-111111111111", "33333333-3333-4333-8333-333333333333"]);

    const notice = statusNotice(shadow);
    expect(notice?.textContent).toContain("Removed.");
    const undoBtn = [...shadow.querySelectorAll("button")].find((b) => b.textContent === "Add it back") as HTMLButtonElement;
    expect(undoBtn).not.toBeUndefined();
    // The clicked row's own button was destroyed along with the row; focus
    // moves to the notice that replaces it (the founder's own call).
    expect(shadow.activeElement).toBe(notice);

    undoBtn.click();
    await flush();
    shadow = getShadow(document);
    expect(rowButtons(shadow, "Edit")).toHaveLength(3);
    expect(shadow.textContent).toContain("Added. These dates are on your calendar now.");
    const restored = await ledger.listPlans();
    expect(restored.map((p) => p.id).sort()).toEqual([
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
      "33333333-3333-4333-8333-333333333333",
    ]);
  });
});

describe("OverlayHost — the plans tab reuses src/overlay/PlanList.ts (shared with the popup)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("both the overlay's plans tab and the popup's hero call the SAME buildPlanRows/buildPlanListNotice — not a private per-surface copy", async () => {
    const buildPlanRowsSpy = vi.spyOn(PlanList, "buildPlanRows");

    const overlayStore = createFakeStore();
    const overlayLedger = new PlanLedger(overlayStore);
    await overlayLedger.addPlan(makePlan("cccccccc-cccc-4ccc-8ccc-cccccccccccc"));
    const controller = createOverlayHost(document, { store: overlayStore, ledger: overlayLedger, today: () => "2026-06-01" });
    controller.mount(recognizedState());
    await flush();
    const shadow = getShadow(document);
    tabButton(shadow, "Plans you've entered")!.click();
    await flush();
    expect(buildPlanRowsSpy).toHaveBeenCalled();
    const overlayCallCount = buildPlanRowsSpy.mock.calls.length;
    expect(overlayCallCount).toBeGreaterThan(0);
    controller.unmount();

    document.body.replaceChildren();
    // Seeded settings so init() lands on "hero" directly rather than the
    // never-onboarded "onboard" screen (PopupApp.ts's init(): `screen =
    // settings ? "hero" : "onboard"`), which renders no plan list at all.
    const popupStore = createFakeStore({ settings: { checkoutReadingEnabled: false } });
    const popupLedger = new PlanLedger(popupStore);
    await popupLedger.addPlan(makePlan("dddddddd-dddd-4ddd-8ddd-dddddddddddd"));
    const root = document.createElement("div");
    document.body.appendChild(root);
    await createPopupApp(root, { store: popupStore, ledger: popupLedger }).init();

    // A private, non-shared popup implementation would leave the spy's
    // call count exactly where the overlay left it.
    expect(buildPlanRowsSpy.mock.calls.length).toBeGreaterThan(overlayCallCount);
  });
});
