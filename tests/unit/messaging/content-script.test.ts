// @vitest-environment jsdom
/**
 * Entry-point integration test.
 *
 * Every other test in this suite exercises the engine, the overlay, or
 * storage as an isolated module — none of them import
 * src/messaging/content-script.ts, the file the manifest actually injects.
 * That gap is exactly how a whole test suite can stay green while the
 * product does nothing when installed: a placeholder pre-gate that always
 * returns false leaves every other module correct and untouched.
 *
 * This file imports the REAL entry point (not a copy of its logic, not a
 * mock of createEngineLifecycle/createOverlayHost) against a jsdom page,
 * and asserts on the one thing a user can see: whether the overlay host
 * custom element ends up in the DOM.
 *
 * Sabotage-verified: reverting src/messaging/content-script.ts to a
 * placeholder `preGate() => false` (the exact defect this test exists to
 * catch) turns the first test below red; restoring the real wiring turns
 * it green again. That check was run by hand while writing this file, not
 * automated as a third test — the point is that a REAL regression here
 * fails this suite, not that the suite re-proves it on every run.
 *
 * The checkout-reading consent gate (storage/ledger.ts's
 * `checkoutReadingEnabled`) is exercised here too: every fixture below
 * that seeds `settings: { checkoutReadingEnabled: true }` is proving the
 * "onboarded and opted in" path continues to work; the dedicated
 * describe block further down proves the opposite -- that a fingerprinted
 * checkout page is left completely alone when that choice is absent or
 * `false`, which is the actual launch-blocking defect this file was
 * written against.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { OVERLAY_HOST_TAG } from "../../../src/shared/constants";
import { isCheckoutReadingEnabled, shouldTearDownOnStorageChange } from "../../../src/messaging/content-script";

const SHOPIFY_FIXTURE = join(
  process.cwd(),
  "tests",
  "fixtures",
  "dom",
  "adapters",
  "shopify-checkout",
  "full-confirmable.html",
);

type MutableLocation = Pick<Location, "host" | "hostname" | "pathname" | "href"> & Record<string, unknown>;

function setLocation(host: string, pathname: string): () => void {
  const original = window.location;
  const fake: MutableLocation = {
    ...original,
    host,
    hostname: host,
    pathname,
    href: `https://${host}${pathname}`,
  };
  Object.defineProperty(window, "location", { value: fake, writable: true, configurable: true });
  return () => {
    Object.defineProperty(window, "location", { value: original, writable: true, configurable: true });
  };
}

type StorageChangedListener = (
  changes: Record<string, { newValue?: unknown }>,
  areaName: string,
) => void;

interface ChromeMock {
  /** Restores the pre-mock global `chrome` (or its absence). */
  restore: () => void;
  /** Simulates a real chrome.storage.onChanged firing, for revocation tests. */
  fireStorageChanged: (changes: Record<string, { newValue?: unknown }>, areaName: string) => void;
  /** Current listener count -- used to prove pagehide unregisters exactly what it registered, no leak. */
  listenerCount: () => number;
  /**
   * Only set when installChromeMock is called with { deferGet: true }.
   * Resolves the single, held-open chrome.storage.local.get(["settings"])
   * call with the given result -- lets a test fire a storage.onChanged
   * event WHILE that read is still in flight, deterministically, rather
   * than hoping to win (or lose) a real microtask race.
   */
  releasePendingGet?: (result: Record<string, unknown>) => void;
}

interface InstallChromeMockOptions {
  /** When true, chrome.storage.local.get never resolves on its own -- only
   * via the returned releasePendingGet. Used to test the race between the
   * initial gate read and an onChanged revocation arriving first. */
  readonly deferGet?: boolean;
}

/** A minimal, promise-based chrome.storage.local fake, plus a fake
 * chrome.storage.onChanged event (real Chrome APIs; not a re-implementation
 * of content-script.ts's own logic) — enough for chromeLocalStore
 * (src/storage/store.ts) to resolve reads/writes without throwing, and for
 * the revocation-on-change tests below to fire a real listener the way
 * Chrome would. */
function installChromeMock(initial: Record<string, unknown> = {}, options: InstallChromeMockOptions = {}): ChromeMock {
  const original = (globalThis as { chrome?: unknown }).chrome;
  const data: Record<string, unknown> = { ...initial };
  const listeners: StorageChangedListener[] = [];
  let releasePendingGet: ((result: Record<string, unknown>) => void) | undefined;
  const get = options.deferGet
    ? (_keys: string[]) =>
        new Promise<Record<string, unknown>>((resolve) => {
          releasePendingGet = resolve;
        })
    : async (keys: string[]) => Object.fromEntries(keys.filter((k) => k in data).map((k) => [k, data[k]]));
  (globalThis as { chrome?: unknown }).chrome = {
    runtime: { id: "test-extension-id" },
    storage: {
      local: {
        get,
        set: async (items: Record<string, unknown>) => {
          Object.assign(data, items);
        },
        remove: async (keys: string[]) => {
          for (const k of keys) delete data[k];
        },
      },
      onChanged: {
        addListener: (cb: StorageChangedListener) => listeners.push(cb),
        removeListener: (cb: StorageChangedListener) => {
          const i = listeners.indexOf(cb);
          if (i >= 0) listeners.splice(i, 1);
        },
      },
    },
  };
  return {
    restore: () => {
      (globalThis as { chrome?: unknown }).chrome = original;
    },
    fireStorageChanged: (changes, areaName) => {
      for (const listener of [...listeners]) listener(changes, areaName);
    },
    listenerCount: () => listeners.length,
    releasePendingGet: options.deferGet ? (result) => releasePendingGet?.(result) : undefined,
  };
}

function mountFragment(html: string): void {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  document.body.replaceChildren();
  for (const child of [...parsed.body.childNodes]) {
    document.body.appendChild(document.importNode(child, true));
  }
}

async function loadContentScript(): Promise<void> {
  vi.resetModules();
  await import("../../../src/messaging/content-script");
}

describe("content-script entry point — the real wiring, imported directly", () => {
  let restoreLocation: (() => void) | null = null;
  let chromeMock: ChromeMock | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.replaceChildren();
  });

  afterEach(async () => {
    // Let any pending debounce/idle timers settle before tearing the
    // fake-timer clock down, so a stray callback from one test can't fire
    // into the next test's fresh module instance.
    await vi.runAllTimersAsync().catch(() => undefined);
    vi.useRealTimers();
    restoreLocation?.();
    restoreLocation = null;
    chromeMock?.restore();
    chromeMock = null;
    document.body.replaceChildren();
  });

  it("an onboarded, opted-in page that fingerprints as a supported checkout mounts the overlay host", async () => {
    chromeMock = installChromeMock({ settings: { checkoutReadingEnabled: true } });
    restoreLocation = setLocation("checkout.shopify.com", "/checkouts/abc123");
    mountFragment(readFileSync(SHOPIFY_FIXTURE, "utf-8"));

    await loadContentScript();
    await vi.advanceTimersByTimeAsync(2000);

    const host = document.querySelector(OVERLAY_HOST_TAG);
    expect(host).not.toBeNull();
  });

  it("an onboarded, opted-in page with no checkout fingerprint leaves the DOM untouched — no overlay host, ever", async () => {
    chromeMock = installChromeMock({ settings: { checkoutReadingEnabled: true } });
    restoreLocation = setLocation("example.com", "/blog/some-article");
    mountFragment("<article><h1>Not a checkout</h1><p>Nothing checkout-shaped here.</p></article>");

    await loadContentScript();
    await vi.advanceTimersByTimeAsync(2000);

    const host = document.querySelector(OVERLAY_HOST_TAG);
    expect(host).toBeNull();
    // Not just the host element — nothing at all was added beside the
    // fixture's own two elements (T10: the extension never modifies
    // checkout DOM outside its single host element).
    expect(document.body.children).toHaveLength(1); // the <article> fixture root
  });

  it("outside an extension context (no chrome.runtime.id), the entry point does nothing at all", async () => {
    (globalThis as { chrome?: unknown }).chrome = undefined;
    restoreLocation = setLocation("checkout.shopify.com", "/checkouts/abc123");
    mountFragment(readFileSync(SHOPIFY_FIXTURE, "utf-8"));

    await loadContentScript();
    await vi.advanceTimersByTimeAsync(2000);

    expect(document.querySelector(OVERLAY_HOST_TAG)).toBeNull();
  });
});

describe("content-script — the checkout-reading consent gate (launch-blocking fix: the choice used to be ignored entirely)", () => {
  let restoreLocation: (() => void) | null = null;
  let chromeMock: ChromeMock | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.replaceChildren();
    restoreLocation = setLocation("checkout.shopify.com", "/checkouts/abc123");
  });

  afterEach(async () => {
    await vi.runAllTimersAsync().catch(() => undefined);
    vi.useRealTimers();
    restoreLocation?.();
    restoreLocation = null;
    chromeMock?.restore();
    chromeMock = null;
    document.body.replaceChildren();
  });

  it("settings never written (never onboarded) -- a fingerprinted checkout page is left completely alone", async () => {
    chromeMock = installChromeMock(); // no "settings" key at all
    mountFragment(readFileSync(SHOPIFY_FIXTURE, "utf-8"));

    await loadContentScript();
    await vi.advanceTimersByTimeAsync(2000);

    expect(document.querySelector(OVERLAY_HOST_TAG)).toBeNull();
  });

  it("checkoutReadingEnabled: false (user chose 'No thanks', or never chose and Continue defaulted to it) -- no overlay host, ever", async () => {
    chromeMock = installChromeMock({ settings: { checkoutReadingEnabled: false } });
    mountFragment(readFileSync(SHOPIFY_FIXTURE, "utf-8"));

    await loadContentScript();
    await vi.advanceTimersByTimeAsync(2000);

    expect(document.querySelector(OVERLAY_HOST_TAG)).toBeNull();
  });

  it("a malformed settings value (not an object) fails closed rather than throwing or starting", async () => {
    chromeMock = installChromeMock({ settings: "not-an-object" });
    mountFragment(readFileSync(SHOPIFY_FIXTURE, "utf-8"));

    await expect(loadContentScript()).resolves.toBeUndefined();
    await vi.advanceTimersByTimeAsync(2000);

    expect(document.querySelector(OVERLAY_HOST_TAG)).toBeNull();
  });
});

describe("content-script — instant revocation via chrome.storage.onChanged (guardian review 2026-08-26, item 2)", () => {
  let restoreLocation: (() => void) | null = null;
  let chromeMock: ChromeMock | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.replaceChildren();
    restoreLocation = setLocation("checkout.shopify.com", "/checkouts/abc123");
  });

  afterEach(async () => {
    await vi.runAllTimersAsync().catch(() => undefined);
    vi.useRealTimers();
    restoreLocation?.();
    restoreLocation = null;
    chromeMock?.restore();
    chromeMock = null;
    document.body.replaceChildren();
  });

  it("a running session tears down the moment checkoutReadingEnabled flips to false on this open tab -- no navigation needed", async () => {
    chromeMock = installChromeMock({ settings: { checkoutReadingEnabled: true } });
    mountFragment(readFileSync(SHOPIFY_FIXTURE, "utf-8"));

    await loadContentScript();
    await vi.advanceTimersByTimeAsync(2000);
    expect(document.querySelector(OVERLAY_HOST_TAG)).not.toBeNull();

    // The user opened Settings (in the toolbar popup, a separate
    // extension surface) and turned "Read checkout pages" off. Chrome
    // delivers that as a real storage.onChanged event to every open page
    // this content script is injected into -- simulated here via the
    // exact same listener contract the real chrome.storage.onChanged API
    // uses, not a call into content-script.ts's internals.
    chromeMock.fireStorageChanged({ settings: { newValue: { checkoutReadingEnabled: false } } }, "local");
    await vi.advanceTimersByTimeAsync(0);

    expect(document.querySelector(OVERLAY_HOST_TAG)).toBeNull();
  });

  it("a change to an unrelated key (e.g. 'plans') does not tear a running session down", async () => {
    chromeMock = installChromeMock({ settings: { checkoutReadingEnabled: true } });
    mountFragment(readFileSync(SHOPIFY_FIXTURE, "utf-8"));

    await loadContentScript();
    await vi.advanceTimersByTimeAsync(2000);
    expect(document.querySelector(OVERLAY_HOST_TAG)).not.toBeNull();

    chromeMock.fireStorageChanged({ plans: { newValue: [] } }, "local");
    await vi.advanceTimersByTimeAsync(0);

    expect(document.querySelector(OVERLAY_HOST_TAG)).not.toBeNull();
  });

  it("a settings change in a non-local area (sync/managed/session) is ignored", async () => {
    chromeMock = installChromeMock({ settings: { checkoutReadingEnabled: true } });
    mountFragment(readFileSync(SHOPIFY_FIXTURE, "utf-8"));

    await loadContentScript();
    await vi.advanceTimersByTimeAsync(2000);
    expect(document.querySelector(OVERLAY_HOST_TAG)).not.toBeNull();

    chromeMock.fireStorageChanged({ settings: { newValue: { checkoutReadingEnabled: false } } }, "sync");
    await vi.advanceTimersByTimeAsync(0);

    expect(document.querySelector(OVERLAY_HOST_TAG)).not.toBeNull();
  });

  it("registers exactly one onChanged listener, and removes exactly that one on pagehide -- no leak", async () => {
    chromeMock = installChromeMock({ settings: { checkoutReadingEnabled: true } });
    mountFragment(readFileSync(SHOPIFY_FIXTURE, "utf-8"));

    await loadContentScript();
    await vi.advanceTimersByTimeAsync(2000);
    expect(chromeMock.listenerCount()).toBe(1);

    window.dispatchEvent(new Event("pagehide"));
    expect(chromeMock.listenerCount()).toBe(0);
  });

  // The fail-OPEN race: injection issues the initial get(["settings"]) ->
  // user revokes in Settings while that read is still in flight -> the
  // read resolves anyway, carrying a STALE `true`. At the moment the
  // revocation arrives, `session` is still `null`, so
  // handleStorageChanged's own teardown branch is a no-op -- there is
  // nothing yet to tear down. Deferring the get's resolution (rather than
  // relying on real microtask ordering, which the fix must not depend on
  // winning either way) makes this interleaving deterministic instead of
  // hoping to reproduce it.
  it("a revocation that arrives before the initial gate read resolves still prevents the lifecycle from starting, even though the read later resolves with a stale 'true'", async () => {
    chromeMock = installChromeMock({}, { deferGet: true });
    mountFragment(readFileSync(SHOPIFY_FIXTURE, "utf-8"));

    await loadContentScript(); // registers the onChanged listener and issues the still-pending get(["settings"])

    // The revoking change arrives WHILE the read is in flight -- `session`
    // is still null at this instant.
    chromeMock.fireStorageChanged({ settings: { newValue: { checkoutReadingEnabled: false } } }, "local");

    // The pending read now resolves, carrying the stale enabling value --
    // the exact interleaving described above. Correct code must not start
    // the lifecycle on the strength of it.
    chromeMock.releasePendingGet?.({ settings: { checkoutReadingEnabled: true } });
    await vi.advanceTimersByTimeAsync(2000);

    expect(document.querySelector(OVERLAY_HOST_TAG)).toBeNull();
  });
});

describe("isCheckoutReadingEnabled — the gate decision as a pure, synchronous unit", () => {
  it("true only for a literal checkoutReadingEnabled: true", () => {
    expect(isCheckoutReadingEnabled({ checkoutReadingEnabled: true })).toBe(true);
  });

  it("false for every other shape: absent, false, wrong type, null, non-object", () => {
    expect(isCheckoutReadingEnabled(undefined)).toBe(false);
    expect(isCheckoutReadingEnabled(null)).toBe(false);
    expect(isCheckoutReadingEnabled({})).toBe(false);
    expect(isCheckoutReadingEnabled({ checkoutReadingEnabled: false })).toBe(false);
    expect(isCheckoutReadingEnabled({ checkoutReadingEnabled: "true" })).toBe(false);
    expect(isCheckoutReadingEnabled("checkoutReadingEnabled")).toBe(false);
    expect(isCheckoutReadingEnabled(42)).toBe(false);
  });
});

describe("shouldTearDownOnStorageChange — the revocation decision as a pure, synchronous unit", () => {
  it("true when settings changed in the local area and the new value no longer enables reading", () => {
    expect(
      shouldTearDownOnStorageChange("local", { settings: { newValue: { checkoutReadingEnabled: false } } }),
    ).toBe(true);
    expect(shouldTearDownOnStorageChange("local", { settings: { newValue: {} } })).toBe(true);
    expect(shouldTearDownOnStorageChange("local", { settings: { newValue: undefined } })).toBe(true);
  });

  it("false when the new settings value still enables reading", () => {
    expect(
      shouldTearDownOnStorageChange("local", { settings: { newValue: { checkoutReadingEnabled: true } } }),
    ).toBe(false);
  });

  it("false when the change did not touch 'settings' at all", () => {
    expect(shouldTearDownOnStorageChange("local", { plans: { newValue: [] } })).toBe(false);
    expect(shouldTearDownOnStorageChange("local", {})).toBe(false);
  });

  it("false for any area other than 'local', even if settings itself looks revoking", () => {
    expect(
      shouldTearDownOnStorageChange("sync", { settings: { newValue: { checkoutReadingEnabled: false } } }),
    ).toBe(false);
    expect(
      shouldTearDownOnStorageChange("managed", { settings: { newValue: { checkoutReadingEnabled: false } } }),
    ).toBe(false);
  });
});
