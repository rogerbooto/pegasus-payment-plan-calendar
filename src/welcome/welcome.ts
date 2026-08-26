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
import { applyThemeAttribute, resolvePersistedTheme } from "../overlay/theme";
import { POPUP_CSS } from "../popup/theme";
import { WELCOME_CSS } from "./theme";
import { PlanLedger } from "../storage/ledger";
import { chromeLocalStore } from "../storage/store";

function isExtensionPageContext(): boolean {
  return typeof document !== "undefined" && typeof window !== "undefined";
}

if (isExtensionPageContext() && typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", () => {
    void (async () => {
      const store = chromeLocalStore;
      const ledger = new PlanLedger(store);
      // §4.6 (first-run UX spec) -- same mechanism as src/popup/popup.ts:
      // resolved and applied before either stylesheet is attached and
      // before the first render, so a returning user's explicit override
      // never flashes the wrong scheme on this surface either. A genuinely
      // first-run install (no settings written yet) resolves to "system"
      // here -- there is nothing to override yet.
      const theme = await resolvePersistedTheme(ledger);
      applyThemeAttribute(document.documentElement, theme);
      document.head.appendChild(styleTag(POPUP_CSS));
      document.head.appendChild(styleTag(WELCOME_CSS));
      const root = document.getElementById("ppc-welcome-root");
      if (root) void createPopupApp(root, { store, ledger, surface: "tab" }).init();
    })();
  });
}
