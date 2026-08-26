/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPopupApp } from "../../../src/popup/PopupApp";
import { PlanLedger } from "../../../src/storage/ledger";
import { createFakeStore } from "../overlay/test-helpers";
import { markInviteDismissed, markViewedNext30 } from "../../../src/popup/usage-tracking";
import { LAUNCH_NOTIFY_URL, MARKETING_HOST } from "../../../src/popup/copy";
import * as overlayCopy from "../../../src/overlay/copy";
import { PlanNotFoundError } from "../../../src/shared/errors";
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

function planWith(overrides: Partial<PaymentPlanRecord> = {}): PaymentPlanRecord {
  return { ...samplePlan(), ...overrides };
}

function fillEditForm(el: HTMLElement, values: Partial<{ total: string; count: string; cadence: string; each: string; first: string }>): void {
  if (values.total !== undefined) {
    const input = el.querySelector("#ppc-f-total") as HTMLInputElement;
    input.value = values.total;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }
  if (values.count !== undefined) {
    const input = el.querySelector("#ppc-f-count") as HTMLInputElement;
    input.value = values.count;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }
  if (values.cadence !== undefined) {
    const select = el.querySelector("#ppc-f-cadence") as HTMLSelectElement;
    select.value = values.cadence;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }
  if (values.each !== undefined) {
    const input = el.querySelector("#ppc-f-each") as HTMLInputElement;
    input.value = values.each;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }
  if (values.first !== undefined) {
    const input = el.querySelector("#ppc-f-first") as HTMLInputElement;
    input.value = values.first;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

function submitForm(el: HTMLElement): void {
  (el.querySelector("form") as HTMLFormElement).dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
}

function editButtons(el: HTMLElement): HTMLButtonElement[] {
  return [...el.querySelectorAll(".rows li button")].filter(
    (b) => b.textContent?.startsWith(overlayCopy.EDIT_ACTION_SHORT),) as HTMLButtonElement[];
}

function removeButtons(el: HTMLElement): HTMLButtonElement[] {
  return [...el.querySelectorAll(".rows li button")].filter(
    (b) => b.textContent?.startsWith(overlayCopy.REMOVE_ACTION_SHORT),) as HTMLButtonElement[];
}

describe("PopupApp — first run gate", () => {
  it("shows onboarding when no settings have ever been written", async () => {
    const store = createFakeStore();
    const el = root();
    await createPopupApp(el, { store }).init();

    expect(el.textContent).toContain("Payment Plan Calendar");
    // §1 (first-run UX spec): the "Turn this on" / "No thanks" button pair
    // is gone, replaced by a single role="switch" row, off by default.
    const row = el.querySelector("[data-consent-switch]");
    expect(row).not.toBeNull();
    const sw = row?.querySelector('[role="switch"]');
    expect(sw).not.toBeNull();
    expect(sw?.getAttribute("aria-checked")).toBe("false");
    // §1.7: Continue is the ONLY primary button on this screen.
    expect(el.querySelectorAll(".btn--primary").length).toBe(1);
    expect(el.querySelector(".btn--primary")?.textContent).toBe("Continue");
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
    expect(el2.querySelector('[data-consent-switch]')).toBeNull();
    expect(el2.textContent).toContain("Payment plan dates");
  });

  // D1 (launch-blocking, first-run UX spec §1.2): the consent choice used
  // to be ignored entirely -- Continue always wrote measurementEnabled:
  // false and nothing else, regardless of which button was clicked. These
  // cases pin the fix on the SWITCH: whichever position it was left in is
  // what persists, and leaving it untouched defaults to the safe
  // (not-reading) choice, never the enabling one.
  it("toggling the switch on, then Continue, persists checkoutReadingEnabled: true", async () => {
    const store = createFakeStore();
    const el = root();
    await createPopupApp(el, { store }).init();

    const sw = el.querySelector('[data-consent-switch] [role="switch"]') as HTMLButtonElement;
    sw.click();
    expect(sw.getAttribute("aria-checked")).toBe("true");

    const continueBtn = [...el.querySelectorAll("button")].find((b) => b.textContent === "Continue") as HTMLButtonElement;
    continueBtn.click();
    await flush();

    const settings = await store.get(["settings"]);
    expect((settings.settings as { checkoutReadingEnabled: boolean }).checkoutReadingEnabled).toBe(true);
  });

  it("toggling the switch on then back off, then Continue, persists checkoutReadingEnabled: false", async () => {
    const store = createFakeStore();
    const el = root();
    await createPopupApp(el, { store }).init();

    const sw = el.querySelector('[data-consent-switch] [role="switch"]') as HTMLButtonElement;
    sw.click();
    sw.click();
    expect(sw.getAttribute("aria-checked")).toBe("false");

    const continueBtn = [...el.querySelectorAll("button")].find((b) => b.textContent === "Continue") as HTMLButtonElement;
    continueBtn.click();
    await flush();

    const settings = await store.get(["settings"]);
    expect((settings.settings as { checkoutReadingEnabled: boolean }).checkoutReadingEnabled).toBe(false);
  });

  // §1.12 case 4 -- the regression guard for §1.4: the first-run switch is
  // local UI state until Continue is pressed. Replaces the old
  // ".btn__check carries real content" case, which pinned DOM the removed
  // button pair no longer has.
  it("toggling the first-run switch writes nothing to storage before Continue is pressed", async () => {
    const store = createFakeStore();
    const el = root();
    await createPopupApp(el, { store }).init();

    const sw = el.querySelector('[data-consent-switch] [role="switch"]') as HTMLButtonElement;
    sw.click();
    await flush();

    const mid = await store.get(["settings"]);
    expect(mid).toEqual({});
  });

  it("Continue without touching the switch defaults to checkoutReadingEnabled: false -- the safe, not-reading default, never an implicit yes", async () => {
    const store = createFakeStore();
    const el = root();
    await createPopupApp(el, { store }).init();

    const continueBtn = [...el.querySelectorAll("button")].find((b) => b.textContent === "Continue") as HTMLButtonElement;
    continueBtn.click();
    await flush();

    const settings = await store.get(["settings"]);
    expect((settings.settings as { checkoutReadingEnabled: boolean }).checkoutReadingEnabled).toBe(false);
  });

  // §1.9 -- the switch's accessible name resolves through aria-labelledby
  // to the visible label text (jsdom has no accname computation, so this
  // asserts the id/aria-labelledby linkage directly).
  it("the switch's aria-labelledby points at an element whose text is the visible label", async () => {
    const el = root();
    await createPopupApp(el, { store: createFakeStore() }).init();

    const sw = el.querySelector('[data-consent-switch] [role="switch"]') as HTMLButtonElement;
    const labelledby = sw.getAttribute("aria-labelledby");
    expect(labelledby).toBeTruthy();
    const labelNode = document.getElementById(labelledby as string);
    expect(labelNode?.textContent).toBe("Read checkout pages");
  });

  // §2.9 case 8 -- the consent screen carries no close/skip/dismiss
  // control of its own (§2.3's considered rejection): Continue is the
  // only way off this screen.
  it("the consent screen renders no close/skip/dismiss control", async () => {
    const el = root();
    await createPopupApp(el, { store: createFakeStore() }).init();

    expect([...el.querySelectorAll("button")].some((b) => /close|skip|dismiss/i.test(b.textContent ?? ""))).toBe(
      false,);
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

  it("the hero screen renders no switch, and no counting/site-scope copy -- the controls this build does not implement never render there", async () => {
    const store = createFakeStore({ settings: { checkoutReadingEnabled: false } });
    const el = root();
    await createPopupApp(el, { store }).init();

    expect(el.querySelectorAll('[role="switch"]').length).toBe(0);
    expect(el.textContent).not.toContain("Count how often");
    expect(el.textContent).not.toContain("On this site");
    expect(el.textContent).not.toContain("Everywhere");
  });

  // Guardian review (2026-08-26): the settings screen used to offer no way
  // to see or change checkoutReadingEnabled at all -- a consent switch
  // with no off position. It now shows exactly one real switch (the
  // checkout-reading control), and still nothing for the two controls
  // this build genuinely does not implement (usage counting, per-origin
  // site scope).
  it("the settings screen renders exactly one real switch (checkout-reading), and still no counting/site-scope copy", async () => {
    const store = createFakeStore({ settings: { checkoutReadingEnabled: false } });
    const el = root();
    await createPopupApp(el, { store }).init();

    (el.querySelector('[aria-label="Settings"]') as HTMLButtonElement).click();
    await flush();

    const switches = el.querySelectorAll('[role="switch"]');
    expect(switches.length).toBe(1);
    // §1.5: the switch's accessible name comes from aria-labelledby now,
    // not a duplicated aria-label (WCAG 2.5.3 -- the visible label and the
    // accessible name cannot drift from one another).
    const labelledby = switches[0]?.getAttribute("aria-labelledby");
    expect(labelledby).toBeTruthy();
    expect(document.getElementById(labelledby as string)?.textContent).toBe("Read checkout pages");
    expect(el.textContent).not.toContain("Count how often");
    expect(el.textContent).not.toContain("On this site");
    expect(el.textContent).not.toContain("Everywhere");
    // The settings screen still exists and still offers real, honored
    // controls (the ones the rest of this file exercises) -- this is a
    // targeted absence, not a broken screen.
    expect(el.textContent).toContain("Delete all my data");
  });

  it("a stale persisted measurementEnabled: true from before that toggle was removed is migrated away and never surfaced as an active control on the hero screen", async () => {
    const store = createFakeStore({ settings: { measurementEnabled: true } });
    const el = root();
    await createPopupApp(el, { store }).init();

    expect(el.querySelectorAll('[role="switch"]').length).toBe(0);
    expect(el.textContent).not.toContain("Count how often");

    // The migration (PlanLedger.readSettings()) ran during init() and
    // wrote the cleaned record back -- measurementEnabled cannot be read
    // back from storage after this.
    const settings = await store.get(["settings"]);
    expect((settings.settings as Record<string, unknown>).measurementEnabled).toBeUndefined();
    expect((settings.settings as Record<string, unknown>).checkoutReadingEnabled).toBe(false);
  });
});

describe("PopupApp — the Settings consent toggle actually flips the stored value (guardian review 2026-08-26, item 1)", () => {
  function findCheckoutReadingSwitch(el: HTMLElement): HTMLButtonElement {
    return el.querySelector('[data-consent-switch] [role="switch"]') as HTMLButtonElement;
  }

  it("shows the current OFF state, and clicking it writes checkoutReadingEnabled: true through ledger.writeSettings", async () => {
    const store = createFakeStore({ settings: { checkoutReadingEnabled: false } });
    const el = root();
    await createPopupApp(el, { store }).init();

    (el.querySelector('[aria-label="Settings"]') as HTMLButtonElement).click();
    await flush();

    const toggle = findCheckoutReadingSwitch(el);
    expect(toggle.getAttribute("aria-checked")).toBe("false");

    toggle.click();
    await flush();

    const settings = await store.get(["settings"]);
    expect((settings.settings as { checkoutReadingEnabled: boolean }).checkoutReadingEnabled).toBe(true);
    // RED if the click stops re-rendering the real, current value.
    const toggleAfter = findCheckoutReadingSwitch(el);
    expect(toggleAfter.getAttribute("aria-checked")).toBe("true");
  });

  // §1.12 case 5 -- the X2 guard, and it fails against the old
  // `render()` -> `clear(container)` implementation: a keyboard user who
  // toggles this switch must not lose focus to <body>.
  it("clicking the switch does not lose focus -- document.activeElement is still the switch afterwards (X2)", async () => {
    const store = createFakeStore({ settings: { checkoutReadingEnabled: false } });
    const el = root();
    await createPopupApp(el, { store }).init();

    (el.querySelector('[aria-label="Settings"]') as HTMLButtonElement).click();
    await flush();

    const toggle = findCheckoutReadingSwitch(el);
    toggle.focus();
    toggle.click();
    await flush();

    expect(document.activeElement).toBe(toggle);
  });

  // §1.12 case 6 -- a rejecting writeSettings must never move the switch:
  // a consent control must never display a state that is not stored.
  it("a rejected write leaves aria-checked unchanged and renders SETTINGS_TOGGLE_FAILED with role=alert", async () => {
    const store = createFakeStore({ settings: { checkoutReadingEnabled: false } });
    const ledger = new PlanLedger(store);
    vi.spyOn(ledger, "writeSettings").mockRejectedValueOnce(new Error("storage full"));
    const el = root();
    await createPopupApp(el, { store, ledger }).init();

    (el.querySelector('[aria-label="Settings"]') as HTMLButtonElement).click();
    await flush();

    const toggle = findCheckoutReadingSwitch(el);
    toggle.click();
    await flush();

    expect(toggle.getAttribute("aria-checked")).toBe("false");
    const alert = el.querySelector('[role="alert"]');
    expect(alert?.textContent).toBe("That didn't save. Your browser storage may be full. Try again.");
  });

  it("shows the current ON state, and clicking it writes checkoutReadingEnabled: false -- revocation from Settings, not just deletion", async () => {
    const store = createFakeStore({ settings: { checkoutReadingEnabled: true }, plans: [samplePlan()] });
    const el = root();
    await createPopupApp(el, { store }).init();

    (el.querySelector('[aria-label="Settings"]') as HTMLButtonElement).click();
    await flush();

    const toggle = findCheckoutReadingSwitch(el);
    expect(toggle.getAttribute("aria-checked")).toBe("true");

    toggle.click();
    await flush();

    const settings = await store.get(["settings"]);
    expect((settings.settings as { checkoutReadingEnabled: boolean }).checkoutReadingEnabled).toBe(false);
  });

  // Item 3: revoking must NOT require deleting plans. Granting was two
  // clicks; withdrawing used to mean "Delete all my data" or nothing --
  // that asymmetry is the dark pattern the guardian flagged. The toggle
  // must be a clean, separate action from deletion.
  it("turning the toggle off does not touch any saved plan -- revoking consent and deleting data are two separate, honestly-labeled actions", async () => {
    const store = createFakeStore({ settings: { checkoutReadingEnabled: true }, plans: [samplePlan()] });
    const el = root();
    await createPopupApp(el, { store }).init();

    (el.querySelector('[aria-label="Settings"]') as HTMLButtonElement).click();
    await flush();
    findCheckoutReadingSwitch(el).click();
    await flush();

    const stored = await store.get(["plans", "settings"]);
    expect((stored.plans as unknown[]).length).toBe(1);
    expect((stored.settings as { checkoutReadingEnabled: boolean }).checkoutReadingEnabled).toBe(false);
  });
});

// §4 (first-run UX spec) -- the manual appearance override, Settings only.
describe("PopupApp — appearance override (§4)", () => {
  function openSettings(el: HTMLElement): void {
    (el.querySelector('[aria-label="Settings"]') as HTMLButtonElement).click();
  }

  function radios(el: HTMLElement): HTMLInputElement[] {
    return [...el.querySelectorAll('[data-theme-choice] input[type="radio"]')] as HTMLInputElement[];
  }

  function checkedValue(el: HTMLElement): string | undefined {
    return radios(el).find((r) => r.checked)?.value;
  }

  afterEach(() => {
    document.documentElement.removeAttribute("data-theme");
  });

  it("renders exactly three radio options -- Follow system, Light, Dark -- inside a single data-theme-choice group", async () => {
    const store = createFakeStore({ settings: { checkoutReadingEnabled: false, theme: "system" } });
    const el = root();
    await createPopupApp(el, { store }).init();
    openSettings(el);
    await flush();

    const group = radios(el);
    expect(group).toHaveLength(3);
    expect(group.map((r) => r.value).sort()).toEqual(["dark", "light", "system"]);
    expect(el.textContent).toContain("Appearance");
    expect(el.textContent).toContain("Follow system");
    expect(el.textContent).toContain("Light");
    expect(el.textContent).toContain("Dark");
  });

  it("pre-checks the persisted value", async () => {
    const store = createFakeStore({ settings: { checkoutReadingEnabled: false, theme: "dark" } });
    const el = root();
    await createPopupApp(el, { store }).init();
    openSettings(el);
    await flush();

    expect(checkedValue(el)).toBe("dark");
  });

  // The migration case surfacing in the UI: a store predating `theme`
  // entirely (PlanLedger.readSettings()'s own migration, exercised here
  // through the real screen rather than only at the storage layer).
  it("an install with no theme field at all shows 'Follow system' checked, not an arbitrary light/dark", async () => {
    const store = createFakeStore({ settings: { checkoutReadingEnabled: true } });
    const el = root();
    await createPopupApp(el, { store }).init();
    openSettings(el);
    await flush();

    expect(checkedValue(el)).toBe("system");
  });

  it("selecting Dark writes theme: 'dark' through the ledger and sets data-theme=\"dark\" on the document element", async () => {
    const store = createFakeStore({ settings: { checkoutReadingEnabled: false, theme: "system" } });
    const el = root();
    await createPopupApp(el, { store }).init();
    openSettings(el);
    await flush();

    const dark = radios(el).find((r) => r.value === "dark") as HTMLInputElement;
    dark.checked = true;
    dark.dispatchEvent(new Event("change", { bubbles: true }));
    await flush();

    const settings = await store.get(["settings"]);
    expect((settings.settings as { theme: string }).theme).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  // The mechanism regression guard: "system" must REMOVE the attribute
  // entirely (not write the literal "system"), which is what hands control
  // back to the `prefers-color-scheme` media query genuinely rather than
  // freezing whatever it last resolved to (§4.6).
  it("selecting Follow system after Dark removes the data-theme attribute entirely", async () => {
    const store = createFakeStore({ settings: { checkoutReadingEnabled: false, theme: "dark" } });
    document.documentElement.setAttribute("data-theme", "dark");
    const el = root();
    await createPopupApp(el, { store }).init();
    openSettings(el);
    await flush();

    const system = radios(el).find((r) => r.value === "system") as HTMLInputElement;
    system.checked = true;
    system.dispatchEvent(new Event("change", { bubbles: true }));
    await flush();

    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
    const settings = await store.get(["settings"]);
    expect((settings.settings as { theme: string }).theme).toBe("system");
  });

  it("selecting a theme does not disturb the already-stored checkoutReadingEnabled value (the partial-write guard, §4.5 step 5)", async () => {
    const store = createFakeStore({ settings: { checkoutReadingEnabled: true, theme: "system" } });
    const el = root();
    await createPopupApp(el, { store }).init();
    openSettings(el);
    await flush();

    const light = radios(el).find((r) => r.value === "light") as HTMLInputElement;
    light.checked = true;
    light.dispatchEvent(new Event("change", { bubbles: true }));
    await flush();

    const settings = await store.get(["settings"]);
    expect(settings.settings).toEqual({ checkoutReadingEnabled: true, theme: "light" });
  });

  it("a rejected write reverts the selection and renders SETTINGS_TOGGLE_FAILED with role=alert", async () => {
    const store = createFakeStore({ settings: { checkoutReadingEnabled: false, theme: "light" } });
    const ledger = new PlanLedger(store);
    vi.spyOn(ledger, "writeSettings").mockRejectedValueOnce(new Error("storage full"));
    const el = root();
    await createPopupApp(el, { store, ledger }).init();
    openSettings(el);
    await flush();

    const dark = radios(el).find((r) => r.value === "dark") as HTMLInputElement;
    dark.checked = true;
    dark.dispatchEvent(new Event("change", { bubbles: true }));
    await flush();

    expect(checkedValue(el)).toBe("light");
    const alert = el.querySelector('[data-theme-choice] ~ [role="alert"], [role="alert"]');
    expect(alert?.textContent).toBe("That didn't save. Your browser storage may be full. Try again.");
  });

  it("a fresh createPopupApp(...).init() against the same store shows the persisted choice (round-trip)", async () => {
    const store = createFakeStore({ settings: { checkoutReadingEnabled: false, theme: "system" } });
    const el = root();
    await createPopupApp(el, { store }).init();
    openSettings(el);
    await flush();
    const light = radios(el).find((r) => r.value === "light") as HTMLInputElement;
    light.checked = true;
    light.dispatchEvent(new Event("change", { bubbles: true }));
    await flush();

    const el2 = root();
    await createPopupApp(el2, { store }).init();
    openSettings(el2);
    await flush();
    expect(checkedValue(el2)).toBe("light");
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

// §2 (first-run UX spec) -- getting out of the welcome tab. surface: "tab"
// is the one flag (X1) that turns on the pin hint, the exit block, and the
// tab-only done note; the toolbar popup surface never sets it.
describe("PopupApp — surface-aware tab exit block (§2)", () => {
  async function addPlanViaManualEntry(el: HTMLElement): Promise<void> {
    const addBtn = [...el.querySelectorAll("button")].find((b) => b.textContent === "Add a plan") as HTMLButtonElement;
    addBtn.click();
    await flush();
    (el.querySelector("#ppc-f-total") as HTMLInputElement).value = "$60.00";
    (el.querySelector("#ppc-f-count") as HTMLInputElement).value = "4";
    (el.querySelector("#ppc-f-cadence") as HTMLSelectElement).value = "MONTHLY";
    (el.querySelector("#ppc-f-each") as HTMLInputElement).value = "$15.00";
    (el.querySelector("form") as HTMLFormElement).dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await flush();
  }

  it("surface: tab renders a Close this tab button; surface: popup renders none", async () => {
    const tabEl = root();
    await createPopupApp(tabEl, { store: createFakeStore({ settings: { checkoutReadingEnabled: false } }), surface: "tab" }).init();
    expect([...tabEl.querySelectorAll("button")].some((b) => b.textContent === "Close this tab")).toBe(true);

    const popupEl = root();
    await createPopupApp(popupEl, { store: createFakeStore({ settings: { checkoutReadingEnabled: false } }) }).init();
    expect([...popupEl.querySelectorAll("button")].some((b) => b.textContent === "Close this tab")).toBe(false);
  });

  it("clicking Close this tab calls the injected closeSurface exactly once", async () => {
    const closeSurface = vi.fn();
    const el = root();
    await createPopupApp(el, { store: createFakeStore({ settings: { checkoutReadingEnabled: false } }), surface: "tab", closeSurface }).init();

    const closeBtn = [...el.querySelectorAll("button")].find((b) => b.textContent === "Close this tab") as HTMLButtonElement;
    closeBtn.click();

    expect(closeSurface).toHaveBeenCalledTimes(1);
  });

  it("surface: tab renders TAB_DONE_NOTE; the popup hero does not", async () => {
    const tabEl = root();
    await createPopupApp(tabEl, { store: createFakeStore({ settings: { checkoutReadingEnabled: false } }) , surface: "tab" }).init();
    expect(tabEl.textContent).toContain("You're set. This lives in your browser toolbar from now on.");

    const popupEl = root();
    await createPopupApp(popupEl, { store: createFakeStore({ settings: { checkoutReadingEnabled: false } }) }).init();
    expect(popupEl.textContent).not.toContain("You're set. This lives in your browser toolbar from now on.");
  });

  it("after a successful manual add, the hero shows SAVED_STATUS on both surfaces, and focus moves to the status line", async () => {
    for (const surface of ["popup", "tab"] as const) {
      const el = root();
      await createPopupApp(el, { store: createFakeStore({ settings: { checkoutReadingEnabled: false } }), surface, today: () => "2026-06-01" }).init();
      await addPlanViaManualEntry(el);

      const status = el.querySelector('[role="status"]');
      expect(status?.textContent).toBe("Added. These dates are on your calendar now.");
      expect(document.activeElement).toBe(status);
    }
  });

  it("on the tab, post-add, Close this tab carries btn--primary and Add a plan carries btn--ghost; exactly one .btn--primary exists in every hero state on both surfaces", async () => {
    for (const surface of ["popup", "tab"] as const) {
      const el = root();
      await createPopupApp(el, { store: createFakeStore({ settings: { checkoutReadingEnabled: false } }), surface, today: () => "2026-06-01" }).init();
      expect(el.querySelectorAll(".btn--primary").length).toBe(1);

      await addPlanViaManualEntry(el);
      expect(el.querySelectorAll(".btn--primary").length).toBe(1);

      if (surface === "tab") {
        const closeBtn = [...el.querySelectorAll("button")].find((b) => b.textContent === "Close this tab");
        const addBtn = [...el.querySelectorAll("button")].find((b) => b.textContent === "Add a plan");
        expect(closeBtn?.className).toContain("btn--primary");
        expect(addBtn?.className).toContain("btn--ghost");
      }
    }
  });

  it("justAdded does not survive a fresh createPopupApp(...).init() against the same store", async () => {
    const store = createFakeStore({ settings: { checkoutReadingEnabled: false } });
    const el = root();
    await createPopupApp(el, { store, today: () => "2026-06-01" }).init();
    await addPlanViaManualEntry(el);
    expect(el.querySelector('[role="status"]')?.textContent).toBe("Added. These dates are on your calendar now.");

    const el2 = root();
    await createPopupApp(el2, { store, today: () => "2026-06-01" }).init();
    expect(el2.querySelector('[role="status"]')).toBeNull();
  });
});

describe("PopupApp — labelled Settings control (§3)", () => {
  it("the hero header's Settings control exposes a visible text label, identical to its aria-label, with the glyph hidden from the accessible name", async () => {
    const el = root();
    await createPopupApp(el, { store: createFakeStore({ settings: { checkoutReadingEnabled: false } }) }).init();

    const gear = el.querySelector('[aria-label="Settings"]') as HTMLButtonElement;
    expect(gear.textContent).toContain("Settings");
    expect(gear.getAttribute("aria-label")).toBe("Settings");
    const glyph = gear.querySelector(".iconbtn__glyph");
    expect(glyph?.getAttribute("aria-hidden")).toBe("true");
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

describe("PopupApp — data note makes no claim the product doesn't honor", () => {
  it("does not claim a plan is removed on its own after any number of days -- there is no sweep, no scheduled job, and no alarms permission behind that claim", async () => {
    const store = createFakeStore({ settings: { measurementEnabled: false } });
    const el = root();
    await createPopupApp(el, { store }).init();

    (el.querySelector('[aria-label="Settings"]') as HTMLButtonElement).click();
    await flush();

    expect(el.textContent).not.toMatch(/removed on its own/i);
    expect(el.textContent).not.toMatch(/\d+\s*days/i);
    // The one part of that claim that IS true stays.
    expect(el.textContent).toContain("Delete all my data");
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
    await createPopupApp(el, { store, today: () => "2026-06-01", marketingHostConfigured: true }).init();

    expect(el.querySelector(".invite")).toBeNull();
  });

  it("never renders while MARKETING_HOST is the unconfigured placeholder, even once both usefulness conditions are met (a link-out to nowhere is worse than no invite)", async () => {
    const store = createFakeStore({ settings: { measurementEnabled: false }, plans: [samplePlan()] });
    await markViewedNext30(store);
    const el = root();
    // No marketingHostConfigured override -- this is the real, shipped
    // default (copy.MARKETING_HOST_CONFIGURED), which is false as long as
    // MARKETING_HOST is the reserved `.invalid` placeholder.
    await createPopupApp(el, { store, today: () => "2026-06-01" }).init();

    expect(el.querySelector(".invite")).toBeNull();
  });

  it("renders once both usefulness conditions are met AND the marketing host is configured, and is never an email input field", async () => {
    const store = createFakeStore({ settings: { measurementEnabled: false }, plans: [samplePlan()] });
    await markViewedNext30(store);
    const el = root();
    await createPopupApp(el, { store, today: () => "2026-06-01", marketingHostConfigured: true }).init();

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
    await createPopupApp(el, { store, today: () => "2026-06-01", openUrl, marketingHostConfigured: true }).init();

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
    await createPopupApp(el, { store, today: () => "2026-06-01", marketingHostConfigured: true }).init();

    const noThanksBtn = [...el.querySelectorAll("button")].find((b) => b.textContent === "No thanks") as HTMLButtonElement;
    noThanksBtn.click();
    await flush();

    expect(el.querySelector(".invite")).toBeNull();

    const el2 = root();
    await createPopupApp(el2, { store, today: () => "2026-06-01", marketingHostConfigured: true }).init();
    expect(el2.querySelector(".invite")).toBeNull();
  });

  it("markInviteDismissed suppresses the invite even if it would otherwise qualify", async () => {
    const store = createFakeStore({ settings: { measurementEnabled: false }, plans: [samplePlan()] });
    await markViewedNext30(store);
    await markInviteDismissed(store);
    const el = root();
    await createPopupApp(el, { store, today: () => "2026-06-01", marketingHostConfigured: true }).init();

    expect(el.querySelector(".invite")).toBeNull();
  });
});

// edit-plan-spec.md §9.5 — the popup plan list, the edit screen, and the
// generalized hero notice.
describe("PopupApp — the plan list (edit-plan-spec §3)", () => {
  it("item 26 — zero plans: no list heading, no Edit control, POPUP_EMPTY_LEDGER still renders", async () => {
    const store = createFakeStore({ settings: { checkoutReadingEnabled: false } });
    const el = root();
    await createPopupApp(el, { store }).init();

    expect(el.textContent).not.toContain(overlayCopy.PLANS_LIST_HEADING);
    expect(editButtons(el)).toHaveLength(0);
    expect(el.textContent).toContain(overlayCopy.POPUP_EMPTY_LEDGER);
  });

  it("item 27 — two plans render two rows, ordered by firstPaymentDate ascending, each Edit's accessible name carries its own date and amount", async () => {
    const later = planWith({ id: "later", firstPaymentDate: "2026-09-02", perInstallmentCents: assertCents(5000, "each") });
    const earlier = planWith({ id: "earlier", firstPaymentDate: "2026-08-26", perInstallmentCents: assertCents(3750, "each") });
    // Stored later-first, on purpose -- the row order must come from the
    // date, not from storage order.
    const store = createFakeStore({ settings: { checkoutReadingEnabled: false }, plans: [later, earlier] });
    const el = root();
    await createPopupApp(el, { store, today: () => "2026-06-01" }).init();

    const rows = [...el.querySelectorAll(".rows li")];
    expect(rows).toHaveLength(2);
    expect(rows[0]?.querySelector(".date")?.textContent).toBe("Aug 26");
    expect(rows[1]?.querySelector(".date")?.textContent).toBe("Sep 2");

    const edits = editButtons(el);
    expect(edits).toHaveLength(2);
    expect(edits[0]?.textContent).toContain("Aug 26");
    expect(edits[0]?.textContent).toContain("$37.50");
    expect(edits[1]?.textContent).toContain("Sep 2");
    expect(edits[1]?.textContent).toContain("$50.00");
  });

  it("item 28 — two plans sharing a first-payment date both render, in stable storage order, and their Edit names differ by amount", async () => {
    const first = planWith({ id: "first-stored", firstPaymentDate: "2026-08-26", perInstallmentCents: assertCents(3750, "each") });
    const second = planWith({ id: "second-stored", firstPaymentDate: "2026-08-26", perInstallmentCents: assertCents(5000, "each") });
    const store = createFakeStore({ settings: { checkoutReadingEnabled: false }, plans: [first, second] });
    const el = root();
    await createPopupApp(el, { store, today: () => "2026-06-01" }).init();

    const rows = [...el.querySelectorAll(".rows li")];
    expect(rows).toHaveLength(2);
    expect(rows[0]?.querySelector(".date")?.textContent).toBe("Aug 26");
    expect(rows[1]?.querySelector(".date")?.textContent).toBe("Aug 26");

    const edits = editButtons(el);
    expect(edits[0]?.textContent).toContain("$37.50");
    expect(edits[1]?.textContent).toContain("$50.00");
  });

  it("item 29 — clicking the SECOND row's Edit opens the form prefilled with the SECOND plan's values (targeting)", async () => {
    const firstPlan = planWith({ id: "first-id", firstPaymentDate: "2026-08-01", orderTotalCents: assertCents(6000, "t"), perInstallmentCents: assertCents(1500, "e") });
    const secondPlan = planWith({ id: "second-id", firstPaymentDate: "2026-09-01", orderTotalCents: assertCents(9000, "t"), perInstallmentCents: assertCents(2250, "e") });
    const store = createFakeStore({ settings: { checkoutReadingEnabled: false }, plans: [firstPlan, secondPlan] });
    const el = root();
    await createPopupApp(el, { store, today: () => "2026-06-01" }).init();

    const edits = editButtons(el);
    expect(edits).toHaveLength(2);
    edits[1]?.click();
    await flush();

    expect((el.querySelector("#ppc-f-total") as HTMLInputElement).value).toBe("$90.00");
    expect((el.querySelector("#ppc-f-each") as HTMLInputElement).value).toBe("$22.50");
    expect((el.querySelector("#ppc-f-first") as HTMLInputElement).value).toBe("2026-09-01");
  });
});

describe("PopupApp — the edit screen and the hero notice (edit-plan-spec §4/§5)", () => {
  it("item 30 — Cancel returns to the hero, storage is bit-identical, and no notice is rendered", async () => {
    const plan = planWith();
    const store = createFakeStore({ settings: { checkoutReadingEnabled: false }, plans: [plan] });
    const el = root();
    await createPopupApp(el, { store, today: () => "2026-06-01" }).init();

    editButtons(el)[0]?.click();
    await flush();
    fillEditForm(el, { total: "$999.00" });

    const cancelBtn = [...el.querySelectorAll("button")].find((b) => b.textContent === "Cancel") as HTMLButtonElement;
    cancelBtn.click();
    await flush();

    expect(el.querySelector('[role="status"]')).toBeNull();
    const stored = await store.get(["plans"]);
    expect(stored.plans).toEqual([plan]);
  });

  it("item 31 — saving a date change: storage holds the new date + same id/createdAt + source: manual; the hero renders EDIT_SAVED_DATES + the new dates; the notice is document.activeElement", async () => {
    const plan = planWith({ source: "checkout_confirmed", firstPaymentDate: "2026-08-01" });
    const store = createFakeStore({ settings: { checkoutReadingEnabled: false }, plans: [plan] });
    const el = root();
    await createPopupApp(el, { store, today: () => "2026-06-01" }).init();

    editButtons(el)[0]?.click();
    await flush();
    fillEditForm(el, { first: "2026-09-01" });
    submitForm(el);
    await flush();

    const stored = await store.get(["plans"]);
    const savedPlans = stored.plans as PaymentPlanRecord[];
    expect(savedPlans).toHaveLength(1);
    expect(savedPlans[0]?.firstPaymentDate).toBe("2026-09-01");
    expect(savedPlans[0]?.id).toBe(plan.id);
    expect(savedPlans[0]?.createdAt).toBe(plan.createdAt);
    expect(savedPlans[0]?.source).toBe("manual");

    const status = el.querySelector('[role="status"]');
    expect(status?.textContent).toContain(overlayCopy.EDIT_SAVED_DATES);
    expect(document.activeElement).toBe(status);
  });

  it("item 32 — saving an amount-only change that moves no date renders EDIT_SAVED_NO_DATE_CHANGE", async () => {
    // count x each = 4 x 1500 = 6000 = orderTotalCents already -- editing
    // the total alone changes no computed payment date.
    const plan = planWith({ orderTotalCents: assertCents(6000, "t"), installmentCount: 4, perInstallmentCents: assertCents(1500, "e") });
    const store = createFakeStore({ settings: { checkoutReadingEnabled: false }, plans: [plan] });
    const el = root();
    await createPopupApp(el, { store, today: () => "2026-06-01" }).init();

    editButtons(el)[0]?.click();
    await flush();
    fillEditForm(el, { total: "$120.00" });
    submitForm(el);
    await flush();

    const status = el.querySelector('[role="status"]');
    expect(status?.textContent).toBe(overlayCopy.EDIT_SAVED_NO_DATE_CHANGE);
  });

  it("item 33 — saving with nothing changed renders EDIT_NO_CHANGE and calls store.set zero times", async () => {
    const plan = planWith();
    const store = createFakeStore({ settings: { checkoutReadingEnabled: false }, plans: [plan] });
    const setSpy = vi.spyOn(store, "set");
    const el = root();
    await createPopupApp(el, { store, today: () => "2026-06-01" }).init();

    setSpy.mockClear();
    editButtons(el)[0]?.click();
    await flush();
    submitForm(el);
    await flush();

    expect(el.querySelector('[role="status"]')?.textContent).toBe(overlayCopy.EDIT_NO_CHANGE);
    expect(setSpy).not.toHaveBeenCalled();
  });

  it("item 34 — the notice is transient: navigating to Settings and back clears it, and a fresh init() against the same store never shows it", async () => {
    const plan = planWith();
    const store = createFakeStore({ settings: { checkoutReadingEnabled: false }, plans: [plan] });
    const el = root();
    await createPopupApp(el, { store, today: () => "2026-06-01" }).init();

    editButtons(el)[0]?.click();
    await flush();
    fillEditForm(el, { first: "2026-09-05" });
    submitForm(el);
    await flush();
    expect(el.querySelector('[role="status"]')).not.toBeNull();

    (el.querySelector('[aria-label="Settings"]') as HTMLButtonElement).click();
    await flush();
    (el.querySelector('[aria-label="Close settings"]') as HTMLButtonElement).click();
    await flush();
    expect(el.querySelector('[role="status"]')).toBeNull();

    const el2 = root();
    await createPopupApp(el2, { store, today: () => "2026-06-01" }).init();
    expect(el2.querySelector('[role="status"]')).toBeNull();
  });

  it("item 35 — the founder's same-day case: editing one of two same-day plans off that date changes the Next-30 count/total, and both rows still render", async () => {
    const a = planWith({ id: "plan-a", firstPaymentDate: "2026-08-26", perInstallmentCents: assertCents(3750, "e"), orderTotalCents: assertCents(15000, "t"), installmentCount: 4, cadence: "BIWEEKLY" });
    const b = planWith({ id: "plan-b", firstPaymentDate: "2026-08-26", perInstallmentCents: assertCents(5000, "e"), orderTotalCents: assertCents(20000, "t"), installmentCount: 4, cadence: "BIWEEKLY" });
    const store = createFakeStore({ settings: { checkoutReadingEnabled: false }, plans: [a, b] });
    const el = root();
    await createPopupApp(el, { store, today: () => "2026-08-01" }).init();

    const summaryBefore = el.querySelector(".summary")?.textContent;

    editButtons(el)[1]?.click(); // plan-b, the second row
    await flush();
    fillEditForm(el, { first: "2026-09-10" });
    submitForm(el);
    await flush();

    const summaryAfter = el.querySelector(".summary")?.textContent;
    expect(summaryAfter).not.toBe(summaryBefore);
    expect([...el.querySelectorAll(".rows li")]).toHaveLength(2);
  });

  it("item 36 — updatePlan rejecting with PlanNotFoundError renders EDIT_TARGET_GONE on the hero, and the list re-reads from storage", async () => {
    const plan = planWith();
    const store = createFakeStore({ settings: { checkoutReadingEnabled: false }, plans: [plan] });
    const ledger = new PlanLedger(store);
    vi.spyOn(ledger, "updatePlan").mockRejectedValueOnce(new PlanNotFoundError(plan.id));
    const el = root();
    await createPopupApp(el, { store, ledger, today: () => "2026-06-01" }).init();

    editButtons(el)[0]?.click();
    await flush();
    fillEditForm(el, { first: "2026-09-05" });
    submitForm(el);
    await flush();

    expect(el.querySelector('[role="status"]')?.textContent).toBe(overlayCopy.EDIT_TARGET_GONE);
  });

  it("item 37 — a rejection for any other reason leaves the user ON THE FORM with SAVE_FAILED, and their typing intact", async () => {
    const plan = planWith();
    const store = createFakeStore({ settings: { checkoutReadingEnabled: false }, plans: [plan] });
    const ledger = new PlanLedger(store);
    vi.spyOn(ledger, "updatePlan").mockRejectedValueOnce(new Error("storage full"));
    const el = root();
    await createPopupApp(el, { store, ledger, today: () => "2026-06-01" }).init();

    editButtons(el)[0]?.click();
    await flush();
    fillEditForm(el, { first: "2026-09-05" });
    submitForm(el);
    await flush();

    expect(el.querySelector('[role="alert"]')?.textContent).toContain("didn't save");
    expect((el.querySelector("#ppc-f-first") as HTMLInputElement).value).toBe("2026-09-05");
    // Still on the form, not back on the hero.
    expect(el.querySelector("h3")?.textContent).toBe(overlayCopy.FORM_TITLE_EDIT);
  });

  it("item 38 — the tab-surface primary-button flip does NOT fire for an edit", async () => {
    const plan = planWith();
    const store = createFakeStore({ settings: { checkoutReadingEnabled: false }, plans: [plan] });
    const el = root();
    await createPopupApp(el, { store, surface: "tab", today: () => "2026-06-01" }).init();

    editButtons(el)[0]?.click();
    await flush();
    fillEditForm(el, { first: "2026-09-05" });
    submitForm(el);
    await flush();

    const addBtn = [...el.querySelectorAll("button")].find((b) => b.textContent === "Add a plan");
    expect(addBtn?.className).toContain("btn--primary");
    expect(el.querySelectorAll(".btn--primary").length).toBe(1);
  });
});

// Per-row Remove: founder-decided (§11.1 revisited), not in the spec's own
// pre-cleared build. Designed to mirror the spec's own §3.4 disambiguation
// pattern and the overlay's existing REMOVED_STATUS/REMOVED_UNDO undo.
describe("PopupApp — per-row Remove (founder-decided; edit-plan-spec §11.1 revisited)", () => {
  it("removes the RIGHT plan when two rows exist (targeting)", async () => {
    const keep = planWith({ id: "keep-me", firstPaymentDate: "2026-08-01" });
    const drop = planWith({ id: "drop-me", firstPaymentDate: "2026-09-01" });
    const store = createFakeStore({ settings: { checkoutReadingEnabled: false }, plans: [keep, drop] });
    const el = root();
    await createPopupApp(el, { store, today: () => "2026-06-01" }).init();

    const removes = removeButtons(el);
    expect(removes).toHaveLength(2);
    removes[1]?.click(); // "drop-me" is the second row (later date)
    await flush();

    const stored = await store.get(["plans"]);
    const remaining = stored.plans as PaymentPlanRecord[];
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.id).toBe("keep-me");
  });

  it("renders REMOVED_STATUS with an 'Add it back' undo, focuses the notice, and the undo re-adds the SAME plan (same id)", async () => {
    const plan = planWith({ id: "removable" });
    const store = createFakeStore({ settings: { checkoutReadingEnabled: false }, plans: [plan] });
    const el = root();
    await createPopupApp(el, { store, today: () => "2026-06-01" }).init();

    removeButtons(el)[0]?.click();
    await flush();

    const status = el.querySelector('[role="status"]');
    expect(status?.textContent).toContain(overlayCopy.REMOVED_STATUS);
    expect(document.activeElement).toBe(status);
    expect((await store.get(["plans"])).plans).toEqual([]);

    const undoBtn = [...el.querySelectorAll("button")].find((b) => b.textContent === overlayCopy.REMOVED_UNDO) as HTMLButtonElement;
    undoBtn.click();
    await flush();

    const restored = (await store.get(["plans"])).plans as PaymentPlanRecord[];
    expect(restored).toHaveLength(1);
    expect(restored[0]?.id).toBe("removable");
  });

  it("the Remove control's accessible name carries the row's own date and amount, disambiguating two same-day plans the same way Edit's does", async () => {
    const a = planWith({ id: "a", firstPaymentDate: "2026-08-26", perInstallmentCents: assertCents(3750, "e") });
    const b = planWith({ id: "b", firstPaymentDate: "2026-08-26", perInstallmentCents: assertCents(5000, "e") });
    const store = createFakeStore({ settings: { checkoutReadingEnabled: false }, plans: [a, b] });
    const el = root();
    await createPopupApp(el, { store, today: () => "2026-06-01" }).init();

    const removes = removeButtons(el);
    expect(removes[0]?.textContent).toContain("$37.50");
    expect(removes[1]?.textContent).toContain("$50.00");
  });

  it("a rendered plan row's Remove targets are all 44px-minimum .btn--link controls (WCAG 2.5.8 / the codebase's existing target-size convention)", async () => {
    const store = createFakeStore({ settings: { checkoutReadingEnabled: false }, plans: [planWith()] });
    const el = root();
    await createPopupApp(el, { store, today: () => "2026-06-01" }).init();

    for (const btn of [...editButtons(el), ...removeButtons(el)]) {
      expect(btn.className).toContain("btn--link");
    }
  });
});
