/**
 * Popup-only styles, layered on top of the overlay's shared panel CSS
 * (src/overlay/theme.ts) rather than duplicating it — the popup reuses the
 * same panel/header/footer/button primitives so the surfaces read as one
 * product. This file only adds the popup-specific pieces: switch rows,
 * settings groups, the verification screen, and the first-run ("onboard")
 * screen. The popup is a normal extension page (not a shadow root), but it
 * is still built exclusively with createElement/textContent (T04) — this
 * string is CSS text, assigned via textContent, never parsed as markup.
 */
import { OVERLAY_CSS } from "../overlay/theme";

export const POPUP_CSS = `
${OVERLAY_CSS}

html, body {
  font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  background: var(--page-bg, #f9f8f5);
  margin: 0; padding: 0;
}
.popup-root .panel { width: 340px; max-width: 100vw; position: static; box-shadow: none; border: none; }

.popup__row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 11px 0; border-bottom: 1px solid var(--border); font-size: 13.5px; }
.popup__row:last-of-type { border-bottom: none; }
.popup__row-text { flex: 1; }
.popup__row-desc { font-size: 11.5px; color: var(--text-3); margin-top: 3px; line-height: 1.4; }

.switch { width: 40px; height: 23px; border-radius: 100px; background: var(--gold); border: 1px solid var(--control-line); position: relative; flex: 0 0 auto; display: inline-block; }
.switch::after { content: ""; position: absolute; top: 3px; right: 3px; width: 17px; height: 17px; border-radius: 50%; background: var(--btn-ink); }
.switch--off { background: var(--panel-alt); }
.switch--off::after { right: auto; left: 3px; background: var(--text-2); }
.switchbtn { background: none; border: none; padding: 11px 3px; margin: -11px -3px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; border-radius: 100px; min-width: 44px; min-height: 44px; }

.mention { font-size: 12px; line-height: 1.5; color: var(--text-3); }

.invite { margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--border); }
.invite p { font-size: 12.5px; line-height: 1.5; color: var(--text-2); }
.btn--sm { padding: 8px 14px; min-height: 36px; font-size: 12.5px; }

.settings__group { margin-top: 18px; }
.settings__group:first-child { margin-top: 0; }
.settings__h { font-size: 12px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--text-3); margin-bottom: 8px; }
.settings__note { font-size: 11.5px; color: var(--text-3); margin-top: 8px; line-height: 1.4; }
.sitelist { list-style: none; margin-top: 4px; }
.sitelist li { display: flex; align-items: center; justify-content: space-between; padding: 9px 0 9px 14px; border-bottom: 1px solid var(--border); font-size: 13px; }
.site { color: var(--text-2); }

.verify__mark { display: flex; align-items: center; gap: 12px; }
.verify__name { font-family: 'Playfair Display', Georgia, serif; font-weight: 600; font-size: 15px; }
.verify__by { font-size: 12px; color: var(--text-3); }
.verify__list { margin: 14px 0 0; padding-left: 18px; font-size: 12.5px; line-height: 1.6; color: var(--text-2); }
.verify__list li { margin-bottom: 6px; }
.verify__caveat { margin-top: 14px; font-size: 11.5px; line-height: 1.5; color: var(--text-3); border-top: 1px solid var(--border); padding-top: 12px; }

.onboard { width: 380px; max-width: 100vw; padding: 20px 20px 22px; background: var(--panel-bg); border-radius: 16px; }
.onboard__eyebrow { font-size: 11px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: var(--gold-ink); margin-bottom: 8px; }
.onboard h3 { font-family: 'Playfair Display', Georgia, serif; font-size: 20px; font-weight: 600; margin-bottom: 10px; }
.onboard p { font-size: 13.5px; line-height: 1.55; color: var(--text-2); }
.onboard__skipnote { font-size: 11.5px; color: var(--text-3); margin-top: 10px; }
.onboard__block { margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--border); }
.onboard__block h4 { font-size: 13px; font-weight: 700; margin-bottom: 6px; }
.onboard__row { display: flex; align-items: center; justify-content: space-between; margin-top: 12px; }
.btn__check { display: none; width: 13px; height: 13px; margin-right: 6px; }
.btn[aria-pressed="true"] .btn__check { display: inline-flex; }
.btn[aria-pressed="true"] { box-shadow: 0 0 0 4px var(--focus); }
`;
