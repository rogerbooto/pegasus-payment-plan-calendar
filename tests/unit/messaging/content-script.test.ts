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
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { OVERLAY_HOST_TAG } from "../../../src/shared/constants";

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

/** A minimal, promise-based chrome.storage.local fake — enough for
 * chromeLocalStore (src/storage/store.ts) to resolve reads/writes without
 * throwing; this test does not assert on storage contents. */
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
  let restoreChrome: (() => void) | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.replaceChildren();
    restoreChrome = installChromeMock();
  });

  afterEach(async () => {
    // Let any pending debounce/idle timers settle before tearing the
    // fake-timer clock down, so a stray callback from one test can't fire
    // into the next test's fresh module instance.
    await vi.runAllTimersAsync().catch(() => undefined);
    vi.useRealTimers();
    restoreLocation?.();
    restoreLocation = null;
    restoreChrome?.();
    restoreChrome = null;
    document.body.replaceChildren();
  });

  it("a page that fingerprints as a supported checkout mounts the overlay host", async () => {
    restoreLocation = setLocation("checkout.shopify.com", "/checkouts/abc123");
    mountFragment(readFileSync(SHOPIFY_FIXTURE, "utf-8"));

    await loadContentScript();
    await vi.advanceTimersByTimeAsync(2000);

    const host = document.querySelector(OVERLAY_HOST_TAG);
    expect(host).not.toBeNull();
  });

  it("a page with no checkout fingerprint leaves the DOM untouched — no overlay host, ever", async () => {
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
    restoreChrome?.();
    restoreChrome = null;
    (globalThis as { chrome?: unknown }).chrome = undefined;
    restoreLocation = setLocation("checkout.shopify.com", "/checkouts/abc123");
    mountFragment(readFileSync(SHOPIFY_FIXTURE, "utf-8"));

    await loadContentScript();
    await vi.advanceTimersByTimeAsync(2000);

    expect(document.querySelector(OVERLAY_HOST_TAG)).toBeNull();
  });
});
