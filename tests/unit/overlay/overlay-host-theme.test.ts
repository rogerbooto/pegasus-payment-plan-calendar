/**
 * @vitest-environment jsdom
 *
 * The manual appearance override applied to the checkout-page overlay
 * (first-run UX spec §4.6): "the host element gets the same attribute at
 * mount time ... on any read failure or absence, fall back to 'system' --
 * never a hardcoded scheme". A NEW file (not an addition to
 * overlay-host-structural.test.ts) so it can assert on the host element's
 * own `data-theme` attribute -- light DOM, not the closed shadow root --
 * without disturbing that file's existing shadow-root-capture setup.
 */
import { describe, expect, it } from "vitest";
import { createOverlayHost, OVERLAY_HOST_TAG } from "../../../src/overlay/OverlayHost";
import { PlanLedger } from "../../../src/storage/ledger";
import { createFakeStore } from "./test-helpers";
import type { EngineState } from "../../../src/shared/types";
import { assertCents } from "../../../src/shared/money";

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
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

function hostEl(doc: Document): HTMLElement {
  const host = doc.body.querySelector(OVERLAY_HOST_TAG);
  if (!host) throw new Error("overlay host not mounted");
  return host as HTMLElement;
}

describe("OverlayHost — the appearance override applies to the checkout-page panel too (§4.6)", () => {
  it("a persisted theme: 'dark' is applied to the host element as data-theme=\"dark\"", async () => {
    const store = createFakeStore({ settings: { checkoutReadingEnabled: true, theme: "dark" } });
    const ledger = new PlanLedger(store);
    const controller = createOverlayHost(document, { store, ledger, today: () => "2026-06-01" });

    controller.mount(recognizedState());
    await flush();

    expect(hostEl(document).getAttribute("data-theme")).toBe("dark");
    controller.unmount();
  });

  it("a persisted theme: 'light' is applied to the host element as data-theme=\"light\"", async () => {
    const store = createFakeStore({ settings: { checkoutReadingEnabled: true, theme: "light" } });
    const ledger = new PlanLedger(store);
    const controller = createOverlayHost(document, { store, ledger, today: () => "2026-06-01" });

    controller.mount(recognizedState());
    await flush();

    expect(hostEl(document).getAttribute("data-theme")).toBe("light");
    controller.unmount();
  });

  it("a never-onboarded install (no settings at all) leaves the host with no data-theme attribute -- 'system', never a hardcoded scheme", async () => {
    const store = createFakeStore();
    const ledger = new PlanLedger(store);
    const controller = createOverlayHost(document, { store, ledger, today: () => "2026-06-01" });

    controller.mount(recognizedState());
    await flush();

    expect(hostEl(document).hasAttribute("data-theme")).toBe(false);
    controller.unmount();
  });

  it("an install predating the theme field (checkoutReadingEnabled only) leaves the host with no data-theme attribute, matching the storage-layer migration to 'system'", async () => {
    const store = createFakeStore({ settings: { checkoutReadingEnabled: true } });
    const ledger = new PlanLedger(store);
    const controller = createOverlayHost(document, { store, ledger, today: () => "2026-06-01" });

    controller.mount(recognizedState());
    await flush();

    expect(hostEl(document).hasAttribute("data-theme")).toBe(false);
    controller.unmount();
  });

  // §4.6's own instruction: "on any read failure ... fall back to
  // 'system' -- never a hardcoded scheme". A rejecting readSettings() must
  // not throw out of ensureHost()/mount(), and must not leave a stale
  // attribute from a previous mount either.
  it("a rejecting ledger.readSettings() leaves the host with no data-theme attribute, and does not throw", async () => {
    const store = createFakeStore();
    const ledger = new PlanLedger(store);
    ledger.readSettings = () => Promise.reject(new Error("storage unavailable"));
    const controller = createOverlayHost(document, { store, ledger, today: () => "2026-06-01" });

    expect(() => controller.mount(recognizedState())).not.toThrow();
    await flush();

    expect(hostEl(document).hasAttribute("data-theme")).toBe(false);
    controller.unmount();
  });

  it("liveness -- dismissing before the persisted read resolves does not apply the attribute to the now-detached host", async () => {
    const store = createFakeStore({ settings: { checkoutReadingEnabled: true, theme: "dark" } });
    const ledger = new PlanLedger(store);
    // A readSettings() that stays pending until this test resolves it --
    // simulates a read still in flight when the panel is dismissed.
    let resolveRead: (() => void) | null = null;
    ledger.readSettings = () =>
      new Promise((resolve) => {
        resolveRead = () => resolve({ checkoutReadingEnabled: true, theme: "dark" });
      });

    const controller = createOverlayHost(document, { store, ledger, today: () => "2026-06-01" });
    controller.mount(recognizedState());
    // Captured BEFORE unmount(), while the host is still the live one --
    // this is the same object reference the in-flight read closed over,
    // so it is what a broken staleness check would still mutate.
    const detachedHost = hostEl(document);
    controller.unmount();
    expect(document.body.querySelector(OVERLAY_HOST_TAG)).toBeNull();

    // Resolve the delayed read AFTER unmount -- the stale promise
    // continuation must recognize the host it captured is no longer the
    // live one and must not apply the attribute to it (querying the live
    // DOM alone would not catch a bug here: a detached element is
    // unreachable via document.body.querySelector regardless of whether
    // its own attribute was mutated, which is exactly why this asserts on
    // the captured object reference directly).
    expect(resolveRead).not.toBeNull();
    (resolveRead as unknown as () => void)();
    await flush();

    expect(detachedHost.hasAttribute("data-theme")).toBe(false);
    expect(document.body.querySelector(OVERLAY_HOST_TAG)).toBeNull();
  });
});
