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
    // Message protocol lands with the overlay and engine tasks.
  });
}
