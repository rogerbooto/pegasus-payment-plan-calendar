/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPopupApp } from "../../../src/popup/PopupApp";
import { PlanLedger } from "../../../src/storage/ledger";
import { createFakeStore } from "../overlay/test-helpers";
import { markInviteDismissed, markViewedNext30 } from "../../../src/popup/usage-tracking";
import { LAUNCH_NOTIFY_URL, MARKETING_HOST } from "../../../src/popup/copy";
import type { PaymentPlanRecord } from "../../../src/shared/types";
import { assertCents } from "../../../src/shared/money";

beforeEach(() => {
  document.body.replaceChildren();
});

function root(): HTMLDivElement {
  const div = document.createElement("div");
  document.body.appendChild(div);
  return div;
}

function samplePlan(id = "11111111-1111-4111-8111-111111111111"): PaymentPlanRecord {
  return {
    id,
    createdAt: "2026-06-01",
    source: "manual",
    currency: "CAD",
    orderTotalCents: assertCents(6000, "total"),
    installmentCount: 4,
    cadence: "MONTHLY",
    perInstallmentCents: assertCents(1500, "each"),
    firstPaymentDate: "2026-06-01",
  };
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("PopupApp — first run gate", () => {
  it("shows onboarding when no settings have ever been written", async () => {
    const store = createFakeStore();
    const el = root();
    await createPopupApp(el, { store }).init();

    expect(el.textContent).toContain("Payment Plan Calendar");
    expect(el.querySelector('[data-consent-pair]')).not.toBeNull();
    expect(el.textContent).toContain("Turn this on");
  });

  it("skips onboarding once settings exist, and never re-shows it after Continue", async () => {
    const store = createFakeStore();
    const ledger = new PlanLedger(store);
    const el = root();
    await createPopupApp(el, { store, ledger }).init();

    const continueBtn = [...el.querySelectorAll("button")].find((b) => b.textContent === "Continue") as HTMLButtonElement;
    continueBtn.click();
    await flush();

    // RED if Continue stops persisting settings (onboarding would show again).
    const settings = await store.get(["settings"]);
    expect(settings.settings).toBeDefined();

    const el2 = root();
    await createPopupApp(el2, { store, ledger }).init();
    expect(el2.querySelector('[data-consent-pair]')).toBeNull();
    expect(el2.textContent).toContain("Payment plan dates");
  });
});

describe("PopupApp — hero view", () => {
  it("shows the popup empty-ledger line when there are no saved plans", async () => {
    const store = createFakeStore({ settings: { measurementEnabled: false } });
    const el = root();
    await createPopupApp(el, { store }).init();

    expect(el.textContent).toContain("No plans yet. Add one manually, or confirm one at a supported checkout.");
  });

  it("shows the Next-30 summary once a plan is saved", async () => {
    const store = createFakeStore({ settings: { measurementEnabled: false }, plans: [samplePlan()] });
    const el = root();
    await createPopupApp(el, { store, today: () => "2026-06-01" }).init();

    expect(el.querySelector(".summary")?.textContent).toContain("Your next 30 days:");
  });

  it("the counting switch is a real role=switch control wired to persisted settings", async () => {
    const store = createFakeStore({ settings: { measurementEnabled: false } });
    const el = root();
    await createPopupApp(el, { store }).init();

    const countSwitch = [...el.querySelectorAll('[role="switch"]')].find(
      (s) => s.getAttribute("aria-labelledby") && el.querySelector(`#${s.getAttribute("aria-labelledby")}`)?.textContent?.includes("Count how often"),
    ) as HTMLButtonElement;
    expect(countSwitch.getAttribute("aria-checked")).toBe("false");

    countSwitch.click();
    await flush();

    const settings = await store.get(["settings"]);
    expect(settings.settings).toEqual({ measurementEnabled: true });
  });
});

describe("PopupApp — manual entry writes to the ledger", () => {
  it("Add a plan opens a form; submitting it persists a source: manual record", async () => {
    const store = createFakeStore({ settings: { measurementEnabled: false } });
    const el = root();
    await createPopupApp(el, { store, today: () => "2026-06-01" }).init();

    const addBtn = [...el.querySelectorAll("button")].find((b) => b.textContent === "Add a plan") as HTMLButtonElement;
    addBtn.click();

    (el.querySelector("#ppc-f-total") as HTMLInputElement).value = "$60.00";
    (el.querySelector("#ppc-f-count") as HTMLInputElement).value = "4";
    (el.querySelector("#ppc-f-cadence") as HTMLSelectElement).value = "MONTHLY";
    (el.querySelector("#ppc-f-each") as HTMLInputElement).value = "$15.00";
    (el.querySelector("form") as HTMLFormElement).dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await flush();

    const stored = await store.get(["plans"]);
    const plans = stored.plans as PaymentPlanRecord[];
    expect(plans).toHaveLength(1);
    expect(plans[0]?.source).toBe("manual");
    expect(plans[0]?.orderTotalCents).toBe(6000);
  });
});

describe("PopupApp — delete all data", () => {
  it("clears plans, settings, and usage flags", async () => {
    const store = createFakeStore({ settings: { measurementEnabled: true }, plans: [samplePlan()], usage: { viewedNext30: true, inviteDismissed: false } });
    const el = root();
    await createPopupApp(el, { store }).init();

    const settingsBtn = [...el.querySelectorAll("button")].find((b) => b.getAttribute("aria-label") === "Settings") as HTMLButtonElement;
    settingsBtn.click();
    await flush();

    const deleteBtn = [...el.querySelectorAll("button")].find((b) => b.textContent === "Delete all my data") as HTMLButtonElement;
    deleteBtn.click();
    await flush();

    const result = await store.get(["plans", "settings", "usage"]);
    expect(result).toEqual({});
  });
});

describe("PopupApp — genuineness screen reachable only from Settings", () => {
  it("Settings -> How to know it's genuine renders the toolbar verification content", async () => {
    const store = createFakeStore({ settings: { measurementEnabled: false } });
    const el = root();
    await createPopupApp(el, { store }).init();

    (el.querySelector('[aria-label="Settings"]') as HTMLButtonElement).click();
    await flush();
    const verifyBtn = [...el.querySelectorAll("button")].find((b) => b.textContent === "How to know it's genuine") as HTMLButtonElement;
    verifyBtn.click();
    await flush();

    expect(el.textContent).toContain("How to know it's genuine");
    expect(el.textContent).toContain("This screen, and this screen only.");
  });
});

describe("PopupApp — email invite (link-out, never a field)", () => {
  it("does not render until a plan is saved AND the 30-day view has been opened", async () => {
    const store = createFakeStore({ settings: { measurementEnabled: false }, plans: [samplePlan()] });
    const el = root();
    await createPopupApp(el, { store, today: () => "2026-06-01" }).init();

    expect(el.querySelector(".invite")).toBeNull();
  });

  it("renders once both usefulness conditions are met, and is never an email input field", async () => {
    const store = createFakeStore({ settings: { measurementEnabled: false }, plans: [samplePlan()] });
    await markViewedNext30(store);
    const el = root();
    await createPopupApp(el, { store, today: () => "2026-06-01" }).init();

    const invite = el.querySelector(".invite");
    expect(invite).not.toBeNull();
    expect(invite?.querySelectorAll("input").length).toBe(0);
    expect(invite?.querySelector('input[type="email"]')).toBeNull();
  });

  it("'Leave an email' opens exactly the allowlisted marketing URL and never any other Pegasus-family host", async () => {
    const store = createFakeStore({ settings: { measurementEnabled: false }, plans: [samplePlan()] });
    await markViewedNext30(store);
    const el = root();
    const openUrl = vi.fn();
    await createPopupApp(el, { store, today: () => "2026-06-01", openUrl }).init();

    const leaveEmailBtn = [...el.querySelectorAll("button")].find((b) => b.textContent === "Leave an email") as HTMLButtonElement;
    leaveEmailBtn.click();

    expect(openUrl).toHaveBeenCalledTimes(1);
    expect(openUrl).toHaveBeenCalledWith(LAUNCH_NOTIFY_URL);
    expect(LAUNCH_NOTIFY_URL.startsWith(MARKETING_HOST)).toBe(true);
  });

  it("'No thanks' dismisses the invite permanently — it does not reappear on the next render", async () => {
    const store = createFakeStore({ settings: { measurementEnabled: false }, plans: [samplePlan()] });
    await markViewedNext30(store);
    const el = root();
    await createPopupApp(el, { store, today: () => "2026-06-01" }).init();

    const noThanksBtn = [...el.querySelectorAll("button")].find((b) => b.textContent === "No thanks") as HTMLButtonElement;
    noThanksBtn.click();
    await flush();

    expect(el.querySelector(".invite")).toBeNull();

    const el2 = root();
    await createPopupApp(el2, { store, today: () => "2026-06-01" }).init();
    expect(el2.querySelector(".invite")).toBeNull();
  });

  it("markInviteDismissed suppresses the invite even if it would otherwise qualify", async () => {
    const store = createFakeStore({ settings: { measurementEnabled: false }, plans: [samplePlan()] });
    await markViewedNext30(store);
    await markInviteDismissed(store);
    const el = root();
    await createPopupApp(el, { store, today: () => "2026-06-01" }).init();

    expect(el.querySelector(".invite")).toBeNull();
  });
});
