/**
 * Content-script entry point (declared for the permitted checkout hosts
 * only, injected at document_idle).
 *
 * Lifecycle:
 * 0. Read the user's first-run choice (src/storage/ledger.ts's
 *    `checkoutReadingEnabled`, written by src/popup/PopupApp.ts's
 *    onboarding screen, and flippable afterward from its Settings
 *    screen). Anything other than a literal `true` -- no settings at all
 *    (never onboarded), an old install predating this field, or a
 *    malformed value -- means DO NOT START. This is the one and only gate
 *    between "checkout pages you visit get read" and "they don't"; there
 *    is no separate consent surface anywhere else.
 * 0.5. Once running, keep watching that same setting via
 *    chrome.storage.onChanged: if it flips to anything other than `true`
 *    (the user opened Settings and turned it off, on this exact open
 *    tab), tear the session down immediately. Revocation must be as fast
 *    as consent was to grant -- an already-open checkout tab that keeps
 *    reading the page after the user turned the setting off, just because
 *    it hasn't navigated yet, would be the exact same defect this file
 *    exists to close, one step later.
 * 1. Run the cheap pre-gate once (URL path pattern + one structural probe).
 *    No checkout fingerprint at all => go fully dormant: no observer, no
 *    timers, no state reported. A path/adapter match with no affordance
 *    confirmation still goes observer-less, but is not silent: it reports
 *    one honest DEGRADED("unconfirmed") state instead (src/engine/pre-gate.ts,
 *    src/engine/lifecycle.ts's evaluatePreGate).
 * 2. On a match, select the winning adapter (src/engine/registry.ts),
 *    attach ONE MutationObserver scoped to the anchor subtree (never
 *    document), debounced, parse work in idle callbacks.
 * 3. Route the terminal EngineState into the overlay host.
 * 4. Teardown on navigation away / dismissal / revocation: disconnect
 *    observers, cancel timers, remove the shadow host, drop references,
 *    and unregister the onChanged listener. Each checkout session is a
 *    fresh engine instance.
 *
 * This file is composition only. Steps 1-2 are src/engine/lifecycle.ts's
 * createEngineLifecycle (already built and tested on its own — observer
 * count, debounce, route-change teardown, history-patch restoration); step
 * 3 is src/overlay/OverlayHost.ts's createOverlayHost. Nothing here
 * re-implements either.
 *
 * The storage read in step 0 is asynchronous, unlike everything after it.
 * The `pagehide` listener is registered synchronously, before that read
 * resolves, and a `hidden` flag closes the race where the page is torn
 * down while the gate decision is still pending: if that happens, the
 * async continuation sees `hidden` and never starts the lifecycle at all,
 * rather than starting an engine on a page that has already gone away with
 * nothing left to call its teardown. The onChanged listener is likewise
 * registered synchronously (not only after the session starts), removed
 * on `pagehide`, and is the only chrome.storage.onChanged subscriber in
 * this file -- one listener added, one listener ever removed.
 *
 * The SAME race exists on the revocation path and is closed the same way,
 * with a second flag (`revoked`): the initial gate read is in flight,
 * `session` is still `null`, and the user turns the setting off in
 * Settings before that read resolves. `handleStorageChanged`'s own
 * teardown (`if (session) ...`) is a no-op in that instant -- there is no
 * session yet to tear down -- so without a flag the pending read would go
 * on to read a stale `true` and call `startLifecycle()` on a page whose
 * consent was just withdrawn. `revoked` is set the moment
 * `handleStorageChanged` observes a revoking change, checked alongside
 * `hidden` before `startLifecycle()` runs, and this is a correctness fix,
 * not a best-effort one: it does not depend on winning any race against
 * chrome.storage's internal ordering, because the read's continuation
 * checks the flag rather than re-reading storage.
 *
 * Known simplification (documented, not hidden): one OverlayHost instance
 * is reused for the lifetime of this content-script injection. A full
 * page navigation destroys and re-injects the whole content script, which
 * gets a fresh overlay for free; an in-page (SPA) route change that
 * carries a DISMISSED overlay from one checkout session into a brand new
 * one leaves it dismissed rather than resetting it. createEngineLifecycle
 * exposes "a terminal state was produced" (onState), not "a new session
 * started" as a distinct signal, so this file cannot draw that line
 * without extending that module's contract — a follow-up, not a silent
 * gap. `pagehide` teardown below is belt-and-braces cleanup for the common
 * case, not a fix for that edge case.
 *
 * Turning the setting back ON while a tab is already open is deliberately
 * NOT handled here: only revocation needs to be instant. Re-enabling takes
 * effect on the next fresh injection (reload/navigation), the same as it
 * always did before this setting could be flipped from Settings at all.
 *
 * The page is never a control channel: this script registers no
 * window.postMessage-based handlers for page messages, and ignores DOM
 * events as instructions.
 */
import { createEngineLifecycle } from "../engine/lifecycle";
import { extractionCore } from "../engine/extraction-core";
import { createOverlayHost, type OverlayController } from "../overlay/OverlayHost";
import { chromeLocalStore } from "../storage/store";
import type { EngineState } from "../shared/types";

function isExtensionContext(): boolean {
  return typeof chrome !== "undefined" && Boolean(chrome.runtime?.id);
}

/**
 * The gate decision, factored out as a pure function so it is unit-testable
 * without mocking chrome.storage or fake timers. Fail-closed by
 * construction: anything other than a settings object carrying a literal
 * `checkoutReadingEnabled: true` returns false -- missing settings,
 * missing field, wrong type, `null`, a string, whatever a corrupt or
 * pre-this-feature record might hold. This is deliberately more lenient to
 * read than storage/ledger.ts's writer-side `validateSettings` (which
 * requires the full closed field set and throws otherwise): a gate check
 * must never throw and must never be read as "started" by default.
 */
export function isCheckoutReadingEnabled(rawSettings: unknown): boolean {
  if (typeof rawSettings !== "object" || rawSettings === null) return false;
  return (rawSettings as Record<string, unknown>).checkoutReadingEnabled === true;
}

/**
 * The revocation decision, also factored out as a pure function: given a
 * chrome.storage.onChanged event's (changes, areaName) pair, should a
 * currently-running session be torn down? True only when the change is in
 * the "local" area AND it touched "settings" AND the settings value it
 * changed TO no longer satisfies isCheckoutReadingEnabled. A change to any
 * other key (e.g. "plans"), or a change in "sync"/"managed"/"session", or
 * a settings change that leaves checkoutReadingEnabled true, is a no-op.
 */
export function shouldTearDownOnStorageChange(
  areaName: string,
  changes: Readonly<Record<string, { newValue?: unknown }>>,
): boolean {
  if (areaName !== "local") return false;
  if (!("settings" in changes)) return false;
  return !isCheckoutReadingEnabled(changes["settings"]?.newValue);
}

function startLifecycle(): { teardown: () => void } {
  let overlay: OverlayController | null = null;

  const lifecycle = createEngineLifecycle({
    doc: document,
    core: extractionCore,
    onState(state: EngineState) {
      if (!overlay) overlay = createOverlayHost(document);
      overlay.mount(state);
    },
  });

  lifecycle.start();

  return {
    teardown: () => {
      lifecycle.teardown();
      overlay?.unmount();
      overlay = null;
    },
  };
}

if (isExtensionContext()) {
  let session: { teardown: () => void } | null = null;
  let hidden = false;
  let revoked = false;

  function handleStorageChanged(
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: chrome.storage.AreaName,
  ): void {
    if (!shouldTearDownOnStorageChange(areaName, changes)) return;
    revoked = true;
    if (session) {
      session.teardown();
      session = null;
    }
  }

  chrome.storage.onChanged.addListener(handleStorageChanged);

  window.addEventListener("pagehide", () => {
    hidden = true;
    chrome.storage.onChanged.removeListener(handleStorageChanged);
    session?.teardown();
    session = null;
  });

  void chromeLocalStore.get(["settings"]).then((result) => {
    if (hidden || revoked) return;
    if (!isCheckoutReadingEnabled(result["settings"])) return;
    session = startLifecycle();
  });
}
