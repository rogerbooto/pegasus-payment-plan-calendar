/**
 * Toolbar popup entry point. This surface hosts:
 * - the 30-day-adjacent hero view, settings, and first-run screens
 *   (src/popup/PopupApp.ts);
 * - the genuineness affordance (src/overlay/ToolbarVerification.ts),
 *   reached from Settings;
 * - the email invite link-out (src/popup/copy.ts's LAUNCH_NOTIFY_URL).
 *
 * This popup only ever opens from the browser's own toolbar icon — no page
 * can make it appear, and no page can put anything inside it.
 */
import { createPopupApp } from "./PopupApp";
import { styleTag } from "../overlay/dom";
import { POPUP_CSS } from "./theme";

/**
 * The ONLY chrome.permissions.request call site in the codebase, invoked
 * exclusively from a user gesture on the "Enable on this store" control.
 * Before offering the persistent grant, the implementing task must probe
 * the checkout fingerprint via the activeTab grant; a page that does not
 * fingerprint as a supported checkout gets no request at all.
 */
export async function onEnableThisStoreClick(originPattern: string): Promise<boolean> {
  return chrome.permissions.request({ origins: [originPattern] });
}

function isExtensionPageContext(): boolean {
  return typeof document !== "undefined" && typeof window !== "undefined";
}

if (isExtensionPageContext() && typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", () => {
    document.head.appendChild(styleTag(POPUP_CSS));
    const root = document.getElementById("ppc-popup-root");
    if (root) void createPopupApp(root).init();
  });
}
