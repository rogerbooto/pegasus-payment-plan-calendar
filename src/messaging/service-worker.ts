/**
 * Background service worker. Holds no page data and no financial data; its
 * jobs are message routing between extension surfaces, opening the
 * first-run welcome tab on a fresh install, and (later) bookkeeping for
 * per-origin opt-in coverage.
 *
 * Every message is validated at the boundary: anything not from this
 * extension is dropped. There is no onMessageExternal listener and no
 * externally_connectable surface, by design.
 */

/** Accept only messages originating from this extension itself. */
export function isTrustedSender(sender: chrome.runtime.MessageSender): boolean {
  return sender.id === chrome.runtime.id;
}

/**
 * Fresh installs only — never on an update or a browser/extension reload.
 * `chrome.tabs.create` needs no declared "tabs" permission for opening a
 * URL the extension already owns (src/popup/PopupApp.ts's `openUrl` does
 * the same); nothing here reads another tab's url/title.
 */
export function shouldOpenWelcomeTab(reason: `${chrome.runtime.OnInstalledReason}`): boolean {
  return reason === "install";
}

function isExtensionContext(): boolean {
  return typeof chrome !== "undefined" && Boolean(chrome.runtime?.id);
}

if (isExtensionContext()) {
  chrome.runtime.onInstalled.addListener((details) => {
    if (!shouldOpenWelcomeTab(details.reason)) return;
    // Chrome does not pin a freshly installed extension's icon to the
    // toolbar (and no extension API can force that pin) -- without this,
    // a fresh install could sit completely inert behind the puzzle-piece
    // overflow menu, with page-reading correctly defaulted off and no
    // reachable surface to ever turn it on. src/welcome/welcome.ts mounts
    // the same onboarding screen the toolbar popup does.
    void chrome.tabs.create({ url: chrome.runtime.getURL("welcome.html") });
  });

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
