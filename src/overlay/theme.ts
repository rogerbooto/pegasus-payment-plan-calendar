/**
 * The overlay's own stylesheet, scoped entirely inside the closed shadow
 * root (T12). Token values and measured contrast ratios are carried across
 * from the approved design and the design spec — this
 * file does not invent new colours or thresholds. `:host { all: initial }`
 * is the explicit reset at the boundary: nothing the host page does to
 * `*`/`body`/inherited properties reaches inside, and nothing in here is
 * ever injected as a page-level stylesheet (T12's other half — this string
 * is only ever attached to a <style> living inside this shadow root).
 *
 * LIGHT_TOKENS/DARK_TOKENS are exported (not just inlined below) so
 * src/popup/theme.ts can declare the exact same values on `:root` for the
 * popup document -- a normal extension page, not a shadow root, where
 * `:host` matches nothing at all. Re-declaring on `:root` from these same
 * constants, rather than writing a second copy of the hex values there,
 * keeps the two surfaces from ever drifting apart.
 *
 * `applyThemeAttribute`/`resolvePersistedTheme` (bottom of file) are the
 * one DOM-touching exception to this file otherwise being pure CSS text --
 * they exist here, next to the tokens and selectors they drive, so the
 * `data-theme` mechanism has exactly one place to hold the line rather
 * than being reimplemented at each of its three call sites (popup.ts,
 * welcome.ts, OverlayHost.ts).
 */
import type { PlanLedger } from "../storage/ledger";
import { DEFAULT_THEME } from "../storage/ledger";
import type { Theme } from "../shared/types";

export const LIGHT_TOKENS = `
  --panel-w: 380px;
  --page-bg: #f9f8f5;
  --panel-bg: #ffffff;
  --panel-alt: #f3f1ec;
  --border: #e9e6df;
  --border-strong: #d4d0c7;
  --text: #1e1e1e;
  --text-2: #565656;
  --text-3: #757575;
  --gold: #B8976A;
  --gold-ink: #7a603c;
  --gold-hover: #96764a;
  --control-line: #8a8a8a;
  --focus: #96764a;
  --btn-ink: #111111;
  --shadow: 0 10px 30px rgba(30,30,30,.10), 0 2px 6px rgba(30,30,30,.06);
  /*
   * Sizes, not colours -- no dark-mode variant, same reasoning as
   * --panel-w below. These back the form's own footer row (.form__actions),
   * which is now a real panel footer outside the scroll region rather than
   * a row layered over content -- see the frame rules below it.
   */
  --btn-min-h: 44px;
  --form-actions-pad-top: 12px;      /* was 10px — this is a footer now, not a hairline strip */
  --form-actions-pad-bottom: 12px;   /* was 2px  — likewise; 44 + 12 + 12 + 1 = 69px footer */
  --form-actions-border-w: 1px;
`;

/**
 * D4 (first-run UX spec, §4.1): this block used to omit `--page-bg`
 * entirely, so `html, body { background: var(--page-bg, #f9f8f5) }`
 * (popup/theme.ts) kept the LIGHT page background under a dark panel in
 * both extension pages -- a dark card floating on a near-white page. Fixed
 * here with a genuinely dark value, not a copy of the light one.
 *
 * Three other LIGHT_TOKENS entries are still absent below, and that is
 * deliberate, not an oversight (recorded per the spec's instruction so a
 * future editor does not "fix" them):
 *   --panel-w   is a size, not a colour -- there is no dark-mode variant.
 *   --gold      the on-brand accent stays identical in both schemes; the
 *               gold-on-dark contrast was measured at 6.90:1 (spec §1.10)
 *               and re-declaring it here would just repeat the same value.
 *   --btn-ink   pairs with --gold (the primary button's own text colour);
 *               it inherits from light for the same reason --gold does.
 * The form-actions footer's sizing tokens (--btn-min-h,
 * --form-actions-pad-top, --form-actions-pad-bottom, --form-actions-border-w)
 * are absent for the same reason as --panel-w -- they are dimensions, not
 * colours, and both colour schemes share one geometry for the footer row.
 * (--border-strong, which the row's top edge is drawn in, DOES vary by
 * scheme and is already declared above/below.)
 */
export const DARK_TOKENS = `
  --page-bg: #1a1a1a;
  --panel-bg: #262626;
  --panel-alt: #313131;
  --border: #333333;
  --border-strong: #474747;
  --text: #f0f0f0;
  --text-2: #cccccc;
  --text-3: #909090;
  --gold-ink: #c6a45e;
  --gold-hover: #a3845a;
  --control-line: #7a7a7a;
  --focus: #d4bb7c;
  --shadow: 0 12px 34px rgba(0,0,0,.55), 0 2px 8px rgba(0,0,0,.4);
`;

export const OVERLAY_CSS = `
:host {
  all: initial;
  position: fixed;
  z-index: 2147483647;
  font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  ${LIGHT_TOKENS}
  top: 20px;
  right: 20px;
}
/*
 * The manual appearance override (first-run UX spec §4): "system" (the
 * default, no attribute) keeps this exact media-query behaviour --
 * ":not([data-theme='light'])" only excludes an explicit LIGHT choice
 * from the dark-on-dark-OS rule below, it does not require the attribute
 * to be present. "dark" pins the dark tokens even on a light OS via the
 * unconditional selector beneath the media block. Both apply to the
 * overlay host too (createOverlayHost sets the same data-theme attribute
 * at mount time, from the same persisted setting) -- a checkout-page
 * panel that ignored the override while the toolbar popup honoured it
 * would be an inconsistency a user has no way to explain.
 */
@media (prefers-color-scheme: dark) {
  :host(:not([data-theme="light"])) {
    ${DARK_TOKENS}
  }
}
:host([data-theme="dark"]) {
  ${DARK_TOKENS}
}
@media (max-width: 767px) {
  :host { --panel-w: 360px; top: 12px; right: 12px; left: 12px; width: auto; }
}
@media (max-width: 599px) {
  :host { --panel-w: auto; top: 12px; right: 12px; left: 12px; width: auto; }
}
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; border-radius: 4px; }

.panel {
  width: var(--panel-w);
  max-width: calc(100vw - 24px);
  max-height: 82vh;
  display: flex;
  flex-direction: column;
  background: var(--panel-bg); color: var(--text);
  border: 1px solid var(--border); border-radius: 16px;
  box-shadow: var(--shadow); overflow: hidden; text-align: left;
  line-height: 1.5;
  container: ppcpanel / inline-size;
}
.panel__head {
  display: flex; align-items: center; gap: 10px; flex: none;
  padding: 10px 10px 10px 16px; border-bottom: 1px solid var(--border);
}
.panel--collapsed .panel__head { border-bottom: none; }
.panel__title {
  font-family: 'Playfair Display', Georgia, 'Times New Roman', serif;
  font-size: 15.5px; font-weight: 600; flex: 1; letter-spacing: -.005em;
}
.iconbtn {
  width: 24px; height: 24px; min-width: 44px; min-height: 44px;
  display: inline-flex; align-items: center; justify-content: center;
  background: none; border: 1px solid transparent; border-radius: 8px;
  color: var(--text-2); cursor: pointer; flex: 0 0 auto; font-size: 15px;
}
.iconbtn:hover { background: var(--panel-alt); color: var(--text); }

/*
 * §3 (first-run UX spec) — the Settings control passed 2.5.8 (44x44) and
 * 1.4.3 (7.34:1) while still reading as undiscoverable, because a passing
 * measurement is not the same thing as a visible affordance (D10). This
 * variant adds a RESTING border/fill (not hover-only) and a permanent text
 * label, on top of (never instead of) the min-width/min-height above.
 */
.iconbtn--labeled {
  width: auto; height: auto; padding: 0 12px 0 8px; gap: 6px;
  border-color: var(--control-line); background: var(--panel-alt);
  color: var(--text-2); font-size: 13px; font-weight: 700;
}
.iconbtn--labeled:hover { background: var(--border); color: var(--text); }
.iconbtn--labeled:active { background: var(--border-strong); }
.iconbtn__glyph { font-size: 14px; line-height: 1; }
.iconbtn__label { font: inherit; }

.tabs { display: flex; gap: 22px; padding: 0 16px; border-bottom: 1px solid var(--border); flex: none; }
.tab {
  background: none; border: none; border-bottom: 2px solid transparent;
  font: 500 13px inherit; color: var(--text-3); padding: 0 1px; min-height: 44px; cursor: pointer;
}
.tab:hover { color: var(--text-2); }
.tab[aria-selected="true"] { color: var(--gold-ink); font-weight: 700; border-bottom-color: var(--gold-ink); }

.panel__body { padding: 18px 16px 16px; overflow-y: auto; flex: 1 1 auto; }
/*
 * Form screens only. The panel body stops being the scroll container and
 * becomes a frame; the <form> owns the column and its own scroll region.
 * The submit row therefore lives OUTSIDE the scrollport, so a field can
 * never sit beneath it at any scroll offset -- which a sticky row inside
 * the scrollport cannot promise, because shifting over the content it
 * scrolls past is exactly what sticky positioning does.
 */
.panel__body:has(> form) {
  padding: 0;
  overflow: hidden;
  display: flex;
  min-height: 0;
}
.panel__body > form {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
}
.form__fields {
  flex: 1 1 auto;
  min-height: 96px;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: var(--border-strong) transparent;
  padding: 16px 16px 10px;
}
/*
 * The preview line and the arithmetic note: a fixed band at the decision
 * point, immediately above the buttons. flex: 0 1 auto rather than
 * 0 0 auto so that on a very short window this band, not the field
 * region, is what gives up space -- .form__fields keeps a 96px floor so at
 * least one whole field row is always usable.
 */
.form__derived {
  flex: 0 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: var(--border-strong) transparent;
  padding: 0 16px;
}
/* The save-failure line, inserted between .form__derived and the buttons. */
.panel__body > form > .note {
  flex: 0 0 auto;
  padding-inline: 16px;
}
.panel__foot {
  padding: 12px 16px 14px; border-top: 1px solid var(--border);
  font-size: 12px; line-height: 1.45; color: var(--text-3); flex: none;
}
.panel__foot span { display: block; }

.impact { font-size: 17px; line-height: 1.45; letter-spacing: -.004em; color: var(--text); }
.impact b { font-weight: 700; }
.impact .d { font-variant-numeric: tabular-nums; font-weight: 600; white-space: nowrap; }

.sameday, .beyond {
  margin-top: 13px; font-size: 13.5px; line-height: 1.5; color: var(--text-2);
  padding-left: 11px; border-left: 2px solid var(--border-strong);
}
.sameday b { color: var(--text); font-weight: 700; font-variant-numeric: tabular-nums; }
.summary { font-size: 15.5px; line-height: 1.45; }
.summary b { font-weight: 700; font-variant-numeric: tabular-nums; }

.rows { list-style: none; margin: 16px 0 0; border-top: 1px solid var(--border); }
.rows li { display: flex; flex-wrap: wrap; align-items: baseline; gap: 10px; padding: 10px 0; border-bottom: 1px solid var(--border); }
.rows .date { font-weight: 600; font-size: 13.5px; font-variant-numeric: tabular-nums; min-width: 52px; }
.rows .dow { font-size: 12px; color: var(--text-3); min-width: 30px; }
.rows .amt { margin-left: auto; font-weight: 600; font-size: 14px; font-variant-numeric: tabular-nums; }
/* The user-typed plan name (PlanList.ts): its own full-width line above the
   summary line. A long name truncates with an ellipsis instead of wrapping,
   so one row stays two lines tall in the 340px popup and the ~360px panel. */
.rows .name { display: block; width: 100%; font-size: 12.5px; font-weight: 600; color: var(--text); margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rows .sub { display: block; width: 100%; font-size: 12px; color: var(--text-2); font-weight: 400; margin-top: 3px; }
.tag {
  display: inline-block; font-size: 10.5px; font-weight: 700; letter-spacing: .04em;
  padding: 2px 9px; border-radius: 100px;
  border: 1px dashed var(--control-line); color: var(--text-2); white-space: nowrap;
}

.actions { display: flex; align-items: center; gap: 12px; margin-top: 18px; flex-wrap: wrap; }
/*
 * The confirmation/manual-entry form's own submit row. It is now a real
 * panel footer, outside the form's scroll region entirely (.form__fields
 * above), rather than a row layered over content -- so a border-top here
 * reads as an actual footer seam, not compensation for an overlap that
 * would otherwise happen. margin-top: 0 beats .actions's margin-top: 18px
 * (same specificity, later in the sheet), and padding-inline replaces the
 * padding .panel__body no longer supplies on this surface.
 */
.form__actions {
  flex: 0 0 auto;
  margin-top: 0;
  background: var(--panel-bg);
  border-top: var(--form-actions-border-w) solid var(--border-strong);
  padding-top: var(--form-actions-pad-top);
  padding-bottom: var(--form-actions-pad-bottom);
  padding-inline: 16px;
}
.btn {
  font: 700 14px inherit; border-radius: 100px; border: 1px solid transparent;
  min-height: var(--btn-min-h); padding: 11px 20px; cursor: pointer;
}
.btn--primary { background: var(--gold); color: var(--btn-ink); }
.btn--primary:hover { background: var(--gold-hover); }
.btn--ghost { background: none; color: var(--text); border-color: var(--control-line); }
.btn--ghost:hover { background: var(--panel-alt); }
.btn--link { background: none; border: none; color: var(--gold-ink); text-decoration: underline; text-underline-offset: 3px; padding: 11px 2px; min-height: 44px; }

.calwrap { margin-top: 16px; }
.calmonth + .calmonth { margin-top: 14px; }
.calmonth__h { font-size: 11.5px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: var(--text-3); margin-bottom: 7px; }
.cal { display: grid; grid-template-columns: repeat(7, 1fr); gap: 3px; }
.cal .dow { font-size: 9.5px; font-weight: 700; text-align: center; color: var(--text-3); padding-bottom: 3px; }
.day { min-height: 32px; border-radius: 8px; border: 1px solid transparent; padding: 4px 2px 3px; display: flex; flex-direction: column; align-items: center; gap: 1px; }
.day .n { font-size: 11px; font-weight: 500; font-variant-numeric: tabular-nums; color: var(--text); }
.day .a { font-size: 9.5px; font-weight: 500; letter-spacing: -.03em; font-variant-numeric: tabular-nums; color: var(--text); }
.day .c { font-size: 9px; font-weight: 700; color: var(--text-2); }
.day--out .n { color: var(--text-3); }
.day--pay { background: var(--panel-alt); border-color: var(--border); }
.day--cluster .n, .day--cluster .a { font-weight: 800; }
.day--pending { border: 1px dashed var(--control-line); }
.callegend { margin-top: 11px; font-size: 11.5px; color: var(--text-3); line-height: 1.5; }

.field { margin-bottom: 12px; }
.field__head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin-bottom: 4px; }
.field label { display: block; font-size: 12px; font-weight: 700; color: var(--text-2); margin-bottom: 0; letter-spacing: .01em; }
.field__flag { font-size: 11px; font-weight: 700; color: var(--text-2); letter-spacing: .02em; white-space: nowrap; }
.field input, .field select {
  width: 100%; min-height: 44px; padding: 10px 12px;
  border: 1px solid var(--control-line); border-radius: 8px;
  background: var(--panel-bg); color: var(--text);
  font: 600 15px inherit; font-variant-numeric: tabular-nums;
}
.field--missing input, .field--missing select { border-style: dashed; }
.hint { font-size: 11.5px; color: var(--text-3); margin-top: 4px; line-height: 1.4; }

/*
 * A paired row's two labels do not share a line count: one wraps to two
 * lines at this width, the sibling label does not. Each .field used to lay
 * out on its own, so the input under the two-line label started lower than
 * the one beside it -- same row, different position. Subgrid turns the
 * head line and the control line into shared rows of .grid2 itself, so
 * both fields read the same row heights: the shorter label's head row
 * stretches to match the taller one, and both inputs begin at the same
 * offset regardless of what either label does. No added height -- the row
 * was already this tall; only which field's input sat at the top of it
 * was off. The 4px row-gap replaces .field__head's own margin-bottom for
 * fields inside .grid2 (zeroed just below) so the two are not both
 * counted; the 12px stays a column-gap only.
 */
.grid2 { display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: auto auto; gap: 4px 12px; margin-bottom: 12px; }
.grid2 .field { margin-bottom: 0; display: grid; grid-row: span 2; grid-template-rows: subgrid; }
.grid2 .field__head { margin-bottom: 0; }
/*
 * Below the supported 375px floor (safety valve only -- see the layout
 * spec's responsive table), the pair stacks to one column and the two
 * fields no longer share rows, so the 4px above would otherwise read as
 * the only space between one field and the next. Restore the wider
 * spacing there; the head-to-control gap inside each stacked field simply
 * grows to match, which is harmless at a width nothing supported renders.
 */
@container ppcpanel (max-width: 319px) { .grid2 { grid-template-columns: 1fr; row-gap: 12px; } }

.form__h { font-family: 'Playfair Display', Georgia, 'Times New Roman', serif; font-size: 18px; font-weight: 600; letter-spacing: -.008em; line-height: 1.3; }
.form__sub { font-size: 13px; color: var(--text-2); margin-top: 4px; margin-bottom: 14px; }
.form__lead { font-size: 13.5px; color: var(--text-2); margin-bottom: 12px; padding-left: 11px; border-left: 2px solid var(--border-strong); }

.echo { background: var(--panel-alt); border-radius: 8px; padding: 11px 13px; font-size: 13px; line-height: 1.45; margin: 10px 0 0; color: var(--text); }
.echo .d { font-weight: 700; font-variant-numeric: tabular-nums; }
/*
 * Section 5 / D6 (first-run UX spec) -- R1: while there is nothing to
 * preview, the live region stays in the DOM (R2, so it can announce
 * reliably once filled) but occupies zero space -- no reserved ~40px
 * empty bar bought at the direct expense of the submit row below the
 * fold. R3: this is an explicit class the same code sets/clears on every
 * recompute, not an :empty selector (:empty semantics around zero-length
 * text nodes vary across engines).
 */
.echo--empty { padding: 0; margin: 0; background: none; border: none; }
.note { border-left: 2px solid var(--border-strong); padding-left: 11px; font-size: 12.5px; line-height: 1.5; color: var(--text-2); margin: 10px 0 0; }
.note b { color: var(--text); font-weight: 700; font-variant-numeric: tabular-nums; }

.status { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; font-size: 13.5px; color: var(--text); padding-bottom: 15px; margin-bottom: 3px; border-bottom: 1px solid var(--border); }
/*
 * The popup hero's generalized transient notice (edit-plan-spec §5.4): most
 * of its outcomes are text-only (no link/button beside the message), and
 * .status's own flex/gap:12px would put an unwanted 12px gap between the
 * lead text and each following date span/comma. .status--text opts those
 * notices out of that; the two per-row action controls (Edit/Remove) still
 * use plain .status when a button does sit beside the text.
 */
.status--text { display: block; }
.status .d { font-weight: 700; font-variant-numeric: tabular-nums; }
.plain { font-size: 15px; line-height: 1.5; }

/* utilities last, so they win over component margins. */
.sr-only {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
}

@media (prefers-reduced-motion: reduce) {
  * { transition-duration: 0ms !important; animation-duration: 0ms !important; }
}
.panel { animation: ppc-fade 120ms ease-out; }
@keyframes ppc-fade { from { opacity: 0; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) {
  .panel { animation: none; opacity: 1; }
}
`;

/**
 * Applies (or clears) the `data-theme` attribute the selectors above key
 * off of. "system" removes the attribute rather than writing the literal
 * (first-run UX spec §4.6: "keep the DOM honest about which mode is a
 * preference") -- that is also what hands control back to the media query
 * genuinely, rather than freezing whatever "system" last resolved to: with
 * no attribute present, `:host(:not([data-theme="light"]))` /
 * `:root:not([data-theme="light"])` match again and the plain
 * `@media (prefers-color-scheme: dark)` behaviour is exactly what runs.
 */
export function applyThemeAttribute(target: Element, theme: Theme): void {
  if (theme === "system") {
    target.removeAttribute("data-theme");
  } else {
    target.setAttribute("data-theme", theme);
  }
}

/**
 * Resolves the persisted appearance override for a bootstrap script
 * (src/popup/popup.ts, src/welcome/welcome.ts) to apply BEFORE the first
 * paint, and for the overlay host to apply at mount time
 * (src/overlay/OverlayHost.ts) -- first-run UX spec §4.6's "on any read
 * failure or absence, fall back to 'system' -- never a hardcoded scheme".
 * A never-onboarded install (readSettings() returning null) and an actual
 * storage read failure both resolve the same safe way; neither blocks the
 * caller from rendering.
 */
export async function resolvePersistedTheme(ledger: PlanLedger): Promise<Theme> {
  try {
    const settings = await ledger.readSettings();
    return settings?.theme ?? DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}
