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
import { ONBOARD_PIN_HINT, ONBOARD_TURN_ON, ONBOARD_TITLE } from "../../../src/popup/copy";

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

  it("renders the same onboarding screen the popup does, plus the pin hint the popup never shows", async () => {
    vi.resetModules();
    await import("../../../src/welcome/welcome");
    document.dispatchEvent(new Event("DOMContentLoaded"));
    await flush();

    const root = document.getElementById("ppc-welcome-root");
    expect(root?.textContent).toContain(ONBOARD_TITLE);
    expect(root?.textContent).toContain(ONBOARD_TURN_ON);
    expect(root?.textContent).toContain(ONBOARD_PIN_HINT);
  });
});
