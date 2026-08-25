/**
 * Content-script entry point (declared for the permitted checkout hosts
 * only, injected at document_idle).
 *
 * Lifecycle contract for the implementing task:
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
 * The page is never a control channel: this script registers no
 * window.postMessage-based handlers for page messages, and ignores DOM
 * events as instructions.
 */

/** Cheap structural pre-gate. Implementation lands with the adapter-engine task. */
export function preGate(_host: string, _path: string): boolean {
  return false;
}

function isExtensionContext(): boolean {
  return typeof chrome !== "undefined" && Boolean(chrome.runtime?.id);
}

if (isExtensionContext()) {
  if (!preGate(window.location.host, window.location.pathname)) {
    // Dormant by design: no observer, no timers, nothing scheduled.
  }
}
