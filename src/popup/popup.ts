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
import { applyThemeAttribute, resolvePersistedTheme } from "../overlay/theme";
import { POPUP_CSS } from "./theme";
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
      // §4.6 (first-run UX spec) -- resolved and applied BEFORE the
      // stylesheet is attached and before the first render, so an
      // explicit override never flashes the wrong scheme. Passing the
      // same store/ledger into createPopupApp below means this is the
      // only settings read on the happy path, not a second one.
      const theme = await resolvePersistedTheme(ledger);
      applyThemeAttribute(document.documentElement, theme);
      document.head.appendChild(styleTag(POPUP_CSS));
      const root = document.getElementById("ppc-popup-root");
      if (root) void createPopupApp(root, { store, ledger }).init();
    })();
  });
}
