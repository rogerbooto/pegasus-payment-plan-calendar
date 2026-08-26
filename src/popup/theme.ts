/**
 * Popup-only styles, layered on top of the overlay's shared panel CSS
 * (src/overlay/theme.ts) rather than duplicating it — the popup reuses the
 * same panel/header/footer/button primitives so the surfaces read as one
 * product. This file only adds the popup-specific pieces: switch rows,
 * settings groups, the verification screen, and the first-run ("onboard")
 * screen. The popup is a normal extension page (not a shadow root), but it
 * is still built exclusively with createElement/textContent (T04) — this
 * string is CSS text, assigned via textContent, never parsed as markup.
 *
 * OVERLAY_CSS's design tokens (--gold, --text, --border, --focus, ...) are
 * declared only on `:host`, which is meaningful inside the overlay's
 * shadow root and matches NOTHING in a normal document like this popup —
 * every var() in OVERLAY_CSS would otherwise resolve to nothing here (no
 * fallback on most of them), rendering e.g. `.btn--primary` as a
 * transparent, textless-looking button. The block below re-declares the
 * exact same LIGHT_TOKENS/DARK_TOKENS constants on `:root`, which DOES
 * apply in a normal document, so every token resolves identically in both
 * contexts without a second, hand-copied set of colour values.
 */
import { OVERLAY_CSS, LIGHT_TOKENS, DARK_TOKENS } from "../overlay/theme";

export const POPUP_CSS = `
${OVERLAY_CSS}

:root {
  ${LIGHT_TOKENS}
}
/*
 * The manual appearance override (first-run UX spec §4.6) -- the same
 * :not([data-theme="light"]) scoping OVERLAY_CSS's own :host block uses,
 * re-declared on :root because :host matches nothing in this normal
 * document (see the file-header comment above). "system" (no attribute)
 * keeps this exact media-query behaviour; an explicit "light"/"dark"
 * choice overrides it either way.
 */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    ${DARK_TOKENS}
  }
}
:root[data-theme="dark"] {
  ${DARK_TOKENS}
}

html, body {
  font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  background: var(--page-bg, #f9f8f5);
  margin: 0; padding: 0;
}
/*
 * D5 (first-run UX spec, §6): max-width: 100vw ignores this document's own
 * body padding, so at narrow widths the panel's fixed width plus the
 * surrounding padding exceeded the viewport and forced a horizontal
 * scrollbar. max-width: 100% resolves against the containing block
 * instead (already padding-aware), which is what actually keeps this
 * inside the viewport at 375px.
 *
 * Bug fix independent of the spec (diagnosed separately, verified against
 * this codebase): max-height: min(72vh, 640px) on .panel (overlay/theme.ts)
 * is correct for the checkout-page overlay, which floats over a
 * merchant's page and must not take over the screen. It is NOT correct
 * here -- the toolbar popup and the full-page welcome tab are not
 * floating over anything, and inheriting that cap produced an inner
 * scrollbar plus a clipped form on an otherwise empty full-height page.
 * max-height: none scopes the cap back to the overlay context only; both
 * extension-page surfaces now grow to their content (the toolbar popup's
 * own window sizing, or the tab's ordinary page scroll, then handles
 * anything taller than the viewport).
 */
.popup-root .panel { width: 340px; max-width: 100%; max-height: none; position: static; box-shadow: none; border: none; }

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
/*
 * §4.7 (first-run UX spec) -- the appearance override is a <fieldset>/
 * <legend> pair rather than another <div>/.settings__h, so its three
 * options get native grouped announcement and arrow-key roving for free
 * (§4.8). A bare <fieldset> carries its own browser default border,
 * padding and margin that none of the other settings groups have; this
 * resets those specifically (a higher-specificity element+class selector,
 * so it wins over the plain .settings__group rule above without
 * duplicating its margin-top) so a fieldset-based group still reads as
 * "one more group on this screen", not a visually distinct box.
 */
fieldset.settings__group { border: 0; padding: 0; margin: 18px 0 0; min-width: 0; }
fieldset.settings__group:first-child { margin-top: 0; }
legend.settings__h { padding: 0; }
/*
 * Three stacked rows, never a 3-segment control (§4.9 -- a segmented
 * control at 340px would put each label under ~100px and risks
 * truncation). The <label> is the sibling anatomy §4.7 specifies (not a
 * wrapping element), stretched to fill the row's own height/width so most
 * of the row -- not just the small circle -- is a real click/tap target,
 * on top of (never instead of) the row's own 44px minimum height.
 */
.radiorow { display: flex; align-items: stretch; gap: 10px; min-height: 44px; }
.radiorow input[type="radio"] { flex: 0 0 auto; width: 18px; height: 18px; margin-top: auto; margin-bottom: auto; accent-color: var(--gold); cursor: pointer; }
.radiorow label { flex: 1; display: flex; align-items: center; font-size: 13.5px; color: var(--text); cursor: pointer; }
.sitelist { list-style: none; margin-top: 4px; }
.sitelist li { display: flex; align-items: center; justify-content: space-between; padding: 9px 0 9px 14px; border-bottom: 1px solid var(--border); font-size: 13px; }
.site { color: var(--text-2); }

.verify__mark { display: flex; align-items: center; gap: 12px; }
.verify__name { font-family: 'Playfair Display', Georgia, serif; font-weight: 600; font-size: 15px; }
.verify__by { font-size: 12px; color: var(--text-3); }
.verify__list { margin: 14px 0 0; padding-left: 18px; font-size: 12.5px; line-height: 1.6; color: var(--text-2); }
.verify__list li { margin-bottom: 6px; }
.verify__caveat { margin-top: 14px; font-size: 11.5px; line-height: 1.5; color: var(--text-3); border-top: 1px solid var(--border); padding-top: 12px; }

/*
 * D7 (first-run UX spec, §6/§8): the onboarding screen and the hero screen
 * used to render at two different widths (380px vs. the popup panel's
 * 340px), so pressing Continue visibly resized the Chrome popup window.
 * 340px is now the shared default (matching .popup-root .panel above);
 * the toolbar-popup surface never sets .popup-root--tab, so it stays at
 * 340px end to end. The welcome TAB is a full page, not an autosized
 * window, so the wider, more legible 380px box is kept there
 * (surface: "tab" adds popup-root--tab, PopupApp.ts).
 */
.onboard { width: 340px; max-width: 100%; padding: 20px 20px 22px; background: var(--panel-bg); border-radius: 16px; }
.popup-root--tab .onboard { width: 380px; }
.onboard__eyebrow { font-size: 11px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: var(--gold-ink); margin-bottom: 8px; }
.onboard h3 { font-family: 'Playfair Display', Georgia, serif; font-size: 20px; font-weight: 600; margin-bottom: 10px; }
.onboard p { font-size: 13.5px; line-height: 1.55; color: var(--text-2); }
.onboard__skipnote { font-size: 11.5px; color: var(--text-3); margin-top: 10px; }
.onboard__block { margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--border); }
.onboard__block h4 { font-size: 13px; font-weight: 700; margin-bottom: 6px; }
.onboard__row { display: flex; align-items: center; justify-content: space-between; margin-top: 12px; }
.onboard__actions { margin-top: 22px; }

/* §2 (first-run UX spec) — the tab-only "you can leave now" line, styled
   identically to the onboarding screen's other small print. */
.hero__donenote { font-size: 11.5px; color: var(--text-3); margin-bottom: 10px; }
`;
