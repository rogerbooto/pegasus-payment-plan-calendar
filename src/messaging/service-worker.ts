/**
 * Background service worker. Holds no page data and no financial data; its
 * only jobs are message routing between extension surfaces and (later)
 * bookkeeping for per-origin opt-in coverage.
 *
 * Every message is validated at the boundary: anything not from this
 * extension is dropped. There is no onMessageExternal listener and no
 * externally_connectable surface, by design.
 */

/** Accept only messages originating from this extension itself. */
export function isTrustedSender(sender: chrome.runtime.MessageSender): boolean {
  return sender.id === chrome.runtime.id;
}

function isExtensionContext(): boolean {
  return typeof chrome !== "undefined" && Boolean(chrome.runtime?.id);
}

if (isExtensionContext()) {
  chrome.runtime.onMessage.addListener((_message, sender, _sendResponse) => {
    if (!isTrustedSender(sender)) return;
    // No message protocol exists, by design: the content script and the
    // toolbar popup both talk to storage directly through
    // src/storage/store.ts, so there is nothing for this worker to route
    // between them. Keep the listener (and its sender check) rather than
    // remove it — a future per-origin permission feature (the deferred
    // "enable on this store" affordance) is the first plausible reason a
    // real message would ever need to reach this worker, and this is
    // where that reviewed protocol lands.
  });
}
