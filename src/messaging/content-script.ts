/**
 * Content-script entry point (declared for the permitted checkout hosts
 * only, injected at document_idle).
 *
 * Lifecycle:
 * 1. Run the cheap pre-gate once (URL path pattern + one structural probe).
 *    No checkout fingerprint => go dormant: no observer, no timers.
 * 2. On a match, select the winning adapter (src/engine/registry.ts),
 *    attach ONE MutationObserver scoped to the anchor subtree (never
 *    document), debounced, parse work in idle callbacks.
 * 3. Route the terminal EngineState into the overlay host.
 * 4. Teardown on navigation away / dismissal: disconnect observers, cancel
 *    timers, remove the shadow host, drop references. Each checkout session
 *    is a fresh engine instance.
 *
 * This file is composition only. Steps 1-2 are src/engine/lifecycle.ts's
 * createEngineLifecycle (already built and tested on its own — observer
 * count, debounce, route-change teardown, history-patch restoration); step
 * 3 is src/overlay/OverlayHost.ts's createOverlayHost. Nothing here
 * re-implements either.
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
 * The page is never a control channel: this script registers no
 * window.postMessage-based handlers for page messages, and ignores DOM
 * events as instructions.
 */
import { createEngineLifecycle } from "../engine/lifecycle";
import { extractionCore } from "../engine/extraction-core";
import { createOverlayHost, type OverlayController } from "../overlay/OverlayHost";
import type { EngineState } from "../shared/types";

function isExtensionContext(): boolean {
  return typeof chrome !== "undefined" && Boolean(chrome.runtime?.id);
}

if (isExtensionContext()) {
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

  window.addEventListener("pagehide", () => {
    lifecycle.teardown();
    overlay?.unmount();
    overlay = null;
  });
}
