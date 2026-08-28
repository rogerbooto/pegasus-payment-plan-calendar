// @vitest-environment jsdom
/**
 * The first-run welcome tab (src/welcome/welcome.ts): opened once by the
 * service worker's onInstalled handler (src/messaging/service-worker.ts),
 * because Chrome does not pin a fresh install's icon and the toolbar
 * popup may not be reachable at all until the user finds it.
 *
 * This test imports the REAL entry point against a jsdom page (same
 * pattern as tests/unit/messaging/content-script.test.ts) and asserts on
 * what a user actually sees: the same onboarding screen the toolbar popup
 * renders, PLUS the one extra line telling them where the icon lives
 * (showPinHint) — proving welcome.ts wires createPopupApp with that flag
 * rather than reimplementing onboarding a second time.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ONBOARD_PIN_HINT, ONBOARD_TITLE, INVITE_LEAVE_EMAIL, INVITE_BODY } from "../../../src/popup/copy";
import { PlanLedger } from "../../../src/storage/ledger";
import { chromeLocalStore } from "../../../src/storage/store";
import { markViewedNext30 } from "../../../src/popup/usage-tracking";

function installChromeMock(): () => void {
  const original = (globalThis as { chrome?: unknown }).chrome;
  const data: Record<string, unknown> = {};
  (globalThis as { chrome?: unknown }).chrome = {
    runtime: { id: "test-extension-id" },
    storage: {
      local: {
        get: async (keys: string[]) => Object.fromEntries(keys.filter((k) => k in data).map((k) => [k, data[k]])),
        set: async (items: Record<string, unknown>) => {
          Object.assign(data, items);
        },
        remove: async (keys: string[]) => {
          for (const k of keys) delete data[k];
        },
      },
    },
  };
  return () => {
    (globalThis as { chrome?: unknown }).chrome = original;
  };
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("welcome entry point — mounts the real onboarding screen, with the pin-location hint", () => {
  let restoreChrome: (() => void) | null = null;

  beforeEach(() => {
    document.body.replaceChildren();
    const root = document.createElement("div");
    root.id = "ppc-welcome-root";
    document.body.appendChild(root);
    restoreChrome = installChromeMock();
  });

  afterEach(() => {
    restoreChrome?.();
    restoreChrome = null;
    document.body.replaceChildren();
    document.head.querySelectorAll("style").forEach((s) => s.remove());
  });

  it("renders the same onboarding screen the popup does (a role=switch consent control, §1), plus the pin hint the popup never shows", async () => {
    vi.resetModules();
    await import("../../../src/welcome/welcome");
    document.dispatchEvent(new Event("DOMContentLoaded"));
    await flush();

    const root = document.getElementById("ppc-welcome-root");
    expect(root?.textContent).toContain(ONBOARD_TITLE);
    expect(root?.querySelectorAll('[role="switch"]').length).toBe(1);
    expect(root?.querySelector('[role="switch"]')?.getAttribute("aria-checked")).toBe("false");
    expect(root?.textContent).toContain(ONBOARD_PIN_HINT);
  });

  // §2.9 case 1 -- X1: welcome.ts wires createPopupApp with
  // { surface: "tab" }, which is what turns on the exit block on the hero
  // screen this tab eventually reaches (not just the pin hint above).
  it("wires createPopupApp with surface: tab, so its own hero screen (once reached) shows the tab-only exit block", async () => {
    const ledger = new PlanLedger(chromeLocalStore);
    await ledger.writeSettings({ checkoutReadingEnabled: false, theme: "system" });

    vi.resetModules();
    await import("../../../src/welcome/welcome");
    document.dispatchEvent(new Event("DOMContentLoaded"));
    await flush();

    const root = document.getElementById("ppc-welcome-root");
    expect([...(root?.querySelectorAll("button") ?? [])].some((b) => b.textContent === "Close this tab")).toBe(true);
  });

  /**
   * This tab mounts createPopupApp WITHOUT a
   * marketingHostConfigured override (welcome.ts passes only
   * showPinHint), so it must fall through to the same real default
   * (copy.MARKETING_HOST_CONFIGURED) the toolbar popup uses — not a
   * second, independently-set value that could silently diverge and
   * bypass the gate on this newer surface. This drives the SAME mounted
   * instance through onboarding to the hero screen (exactly how a real
   * first-run user would reach it from this tab, not a synthetic
   * "start on hero" shortcut), with both usefulness conditions met, and
   * asserts the invite still does not render.
   */
  it("does not render the email invite on its own hero screen either, even once both usefulness conditions are met — the gate was not bypassed on this newer surface", async () => {
    const ledger = new PlanLedger(chromeLocalStore);
    // Settings must already exist for init() to land on "hero" rather
    // than "onboard" -- readSettings() returning null is exactly what
    // sends a fresh install to the onboarding screen instead.
    await ledger.writeSettings({ checkoutReadingEnabled: false, theme: "system" });
    await ledger.addPlan({
      id: "22222222-2222-4222-8222-222222222222",
      createdAt: "2026-06-01",
      source: "manual",
      currency: "CAD",
      orderTotalCents: 6000,
      installmentCount: 4,
      cadence: "MONTHLY",
      perInstallmentCents: 1500,
      firstPaymentDate: "2026-06-01",
      customName: "",
    });
    await markViewedNext30(chromeLocalStore);

    vi.resetModules();
    await import("../../../src/welcome/welcome");
    document.dispatchEvent(new Event("DOMContentLoaded"));
    await flush();

    const root = document.getElementById("ppc-welcome-root");
    // A plan already exists, so init() should have skipped onboarding
    // straight to the hero screen -- confirm that before asserting on the
    // invite, so a broken skip can't quietly pass this as "invite absent
    // because we're still on the onboarding screen".
    expect(root?.textContent).not.toContain(ONBOARD_TITLE);
    expect(root?.textContent).not.toContain(INVITE_BODY);
    expect(root?.querySelector(".invite")).toBeNull();
    expect([...(root?.querySelectorAll("button") ?? [])].some((b) => b.textContent === INVITE_LEAVE_EMAIL)).toBe(false);
  });
});
