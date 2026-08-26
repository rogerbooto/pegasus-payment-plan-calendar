/**
 * The first-run welcome tab: opened once, on fresh install, by
 * src/messaging/service-worker.ts's `chrome.runtime.onInstalled` handler.
 *
 * Chrome does not pin a newly installed extension's icon to the toolbar,
 * and no extension API can force a pin (only enterprise admin policy can)
 * — so on a fresh install, the toolbar popup (the normal way to reach
 * onboarding) may sit behind the puzzle-piece overflow menu, unreached.
 * Without this tab, that install is silently inert: page-reading stays
 * off (the safe default) and the only door to turning it on may never be
 * opened.
 *
 * This page mounts src/popup/PopupApp.ts's `createPopupApp` directly —
 * the exact same onboarding screen, copy, and consent-writing logic the
 * toolbar popup uses — rather than a second implementation of either. One
 * source of truth for the disclosure and the choice, regardless of which
 * of the two surfaces a first-run user lands on first.
 */
import { createPopupApp } from "../popup/PopupApp";
import { styleTag } from "../overlay/dom";
import { POPUP_CSS } from "../popup/theme";
import { WELCOME_CSS } from "./theme";

function isExtensionPageContext(): boolean {
  return typeof document !== "undefined" && typeof window !== "undefined";
}

if (isExtensionPageContext() && typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", () => {
    document.head.appendChild(styleTag(POPUP_CSS));
    document.head.appendChild(styleTag(WELCOME_CSS));
    const root = document.getElementById("ppc-welcome-root");
    if (root) void createPopupApp(root, { surface: "tab" }).init();
  });
}
