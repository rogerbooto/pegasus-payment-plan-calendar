/**
 * T08 — the service worker's own sender-validation function, tested
 * directly as a behavioural unit test (not "no crash happened"): a
 * `MessageSender` whose `id` disagrees with `chrome.runtime.id` must be
 * rejected, and a genuine one accepted. RED when `isTrustedSender` ever
 * accepts a mismatched sender, or is bypassed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isTrustedSender, shouldOpenWelcomeTab } from "../../../src/messaging/service-worker";

const originalChrome = (globalThis as { chrome?: unknown }).chrome;

beforeEach(() => {
  (globalThis as { chrome?: unknown }).chrome = { runtime: { id: "this-extension-id" } };
});

afterEach(() => {
  (globalThis as { chrome?: unknown }).chrome = originalChrome;
});

describe("isTrustedSender (T08)", () => {
  it("accepts a sender whose id matches this extension's own id", () => {
    expect(isTrustedSender({ id: "this-extension-id" } as chrome.runtime.MessageSender)).toBe(true);
  });

  it("rejects a sender from a different (co-installed) extension", () => {
    expect(isTrustedSender({ id: "some-other-extension-id" } as chrome.runtime.MessageSender)).toBe(false);
  });

  it("rejects a sender with no id at all (e.g. a spoofed/malformed sender object)", () => {
    expect(isTrustedSender({} as chrome.runtime.MessageSender)).toBe(false);
  });
});

/**
 * BUG 1's third piece: before this handler existed, a fresh install had no
 * onInstalled listener at all, so nothing ever opened the first-run
 * surface — an install that never happens to have its toolbar icon pinned
 * (Chrome does not pin on install, and no API can force it) could sit
 * completely, silently inert. RED if the "install" reason ever stops
 * opening the welcome tab, or if "update"/"chrome_update" starts opening
 * it (which would re-show onboarding on every browser restart).
 */
describe("shouldOpenWelcomeTab (BUG 1: fresh installs are no longer silently inert)", () => {
  it("opens on a genuine fresh install", () => {
    expect(shouldOpenWelcomeTab("install")).toBe(true);
  });

  it("does not open on an extension update", () => {
    expect(shouldOpenWelcomeTab("update")).toBe(false);
  });

  it("does not open on a browser/shared-module update", () => {
    expect(shouldOpenWelcomeTab("chrome_update")).toBe(false);
    expect(shouldOpenWelcomeTab("shared_module_update")).toBe(false);
  });
});

describe("service worker — onInstalled wiring (the real listener, not a copy of its logic)", () => {
  let restoreChrome: (() => void) | null = null;
  let tabsCreateCalls: { url: string }[] = [];
  let installedListeners: ((details: { reason: `${chrome.runtime.OnInstalledReason}` }) => void)[] = [];

  beforeEach(() => {
    restoreChrome = null;
    tabsCreateCalls = [];
    installedListeners = [];
  });

  afterEach(() => {
    restoreChrome?.();
    restoreChrome = null;
  });

  function installMock(): void {
    const original = (globalThis as { chrome?: unknown }).chrome;
    (globalThis as { chrome?: unknown }).chrome = {
      runtime: {
        id: "test-extension-id",
        getURL: (path: string) => `chrome-extension://test-extension-id/${path}`,
        onInstalled: { addListener: (cb: (details: { reason: `${chrome.runtime.OnInstalledReason}` }) => void) => installedListeners.push(cb) },
        onMessage: { addListener: () => undefined },
      },
      tabs: {
        create: (opts: { url: string }) => {
          tabsCreateCalls.push(opts);
          return Promise.resolve();
        },
      },
    };
    restoreChrome = () => {
      (globalThis as { chrome?: unknown }).chrome = original;
    };
  }

  it("opens chrome.runtime.getURL('welcome.html') as a new tab when onInstalled fires with reason 'install'", async () => {
    installMock();
    vi.resetModules();
    await import("../../../src/messaging/service-worker");
    expect(installedListeners).toHaveLength(1);

    installedListeners[0]?.({ reason: "install" });

    expect(tabsCreateCalls).toEqual([{ url: "chrome-extension://test-extension-id/welcome.html" }]);
  });

  it("does not open any tab when onInstalled fires with reason 'update'", async () => {
    installMock();
    vi.resetModules();
    await import("../../../src/messaging/service-worker");
    expect(installedListeners).toHaveLength(1);

    installedListeners[0]?.({ reason: "update" });

    expect(tabsCreateCalls).toEqual([]);
  });
});
