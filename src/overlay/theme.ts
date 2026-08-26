/**
 * The overlay's own stylesheet, scoped entirely inside the closed shadow
 * root (T12). Token values and measured contrast ratios are carried across
 * from the approved design and the design spec — this
 * file does not invent new colours or thresholds. `:host { all: initial }`
 * is the explicit reset at the boundary: nothing the host page does to
 * `*`/`body`/inherited properties reaches inside, and nothing in here is
 * ever injected as a page-level stylesheet (T12's other half — this string
 * is only ever attached to a <style> living inside this shadow root).
 */

export const OVERLAY_CSS = `
:host {
  all: initial;
  position: fixed;
  z-index: 2147483647;
  font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
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
  top: 20px;
  right: 20px;
}
@media (prefers-color-scheme: dark) {
  :host {
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
  }
}
@media (max-width: 767px) {
  :host { --panel-w: 360px; top: 12px; right: 12px; left: 12px; width: auto; }
}
@media (max-width: 599px) {
  :host { --panel-w: auto; top: 12px; right: 12px; left: 12px; width: auto; }
}
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; border-radius: 4px; }
.sr-only {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
}

.panel {
  width: var(--panel-w);
  max-width: calc(100vw - 24px);
  max-height: min(72vh, 640px);
  display: flex;
  flex-direction: column;
  background: var(--panel-bg); color: var(--text);
  border: 1px solid var(--border); border-radius: 16px;
  box-shadow: var(--shadow); overflow: hidden; text-align: left;
  line-height: 1.5;
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

.tabs { display: flex; gap: 22px; padding: 0 16px; border-bottom: 1px solid var(--border); flex: none; }
.tab {
  background: none; border: none; border-bottom: 2px solid transparent;
  font: 500 13px inherit; color: var(--text-3); padding: 0 1px; min-height: 44px; cursor: pointer;
}
.tab:hover { color: var(--text-2); }
.tab[aria-selected="true"] { color: var(--gold-ink); font-weight: 700; border-bottom-color: var(--gold-ink); }

.panel__body { padding: 18px 16px 16px; overflow-y: auto; flex: 1 1 auto; }
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
.rows .sub { display: block; width: 100%; font-size: 12px; color: var(--text-2); font-weight: 400; margin-top: 3px; }
.tag {
  display: inline-block; font-size: 10.5px; font-weight: 700; letter-spacing: .04em;
  padding: 2px 9px; border-radius: 100px;
  border: 1px dashed var(--control-line); color: var(--text-2); white-space: nowrap;
}

.actions { display: flex; align-items: center; gap: 12px; margin-top: 18px; flex-wrap: wrap; }
.btn {
  font: 700 14px inherit; border-radius: 100px; border: 1px solid transparent;
  min-height: 44px; padding: 11px 20px; cursor: pointer;
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

.form__h { font-family: 'Playfair Display', Georgia, 'Times New Roman', serif; font-size: 18px; font-weight: 600; letter-spacing: -.008em; }
.form__sub { font-size: 13px; color: var(--text-2); margin-top: 5px; margin-bottom: 17px; }
.form__lead { font-size: 13.5px; color: var(--text-2); margin-bottom: 15px; padding-left: 11px; border-left: 2px solid var(--border-strong); }
.field { margin-bottom: 14px; }
.field label { display: block; font-size: 12px; font-weight: 700; color: var(--text-2); margin-bottom: 5px; letter-spacing: .01em; }
.field input, .field select {
  width: 100%; min-height: 44px; padding: 10px 12px;
  border: 1px solid var(--control-line); border-radius: 8px;
  background: var(--panel-bg); color: var(--text);
  font: 600 15px inherit; font-variant-numeric: tabular-nums;
}
.field--missing input, .field--missing select { border-style: dashed; }
.hint { font-size: 11.5px; color: var(--text-3); margin-top: 5px; line-height: 1.4; }
.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
@media (max-width: 420px) { .grid2 { grid-template-columns: 1fr; } }
.echo { background: var(--panel-alt); border-radius: 8px; padding: 11px 13px; font-size: 13px; line-height: 1.45; margin: 4px 0 15px; color: var(--text); }
.echo .d { font-weight: 700; font-variant-numeric: tabular-nums; }
.note { border-left: 2px solid var(--border-strong); padding-left: 11px; font-size: 12.5px; line-height: 1.5; color: var(--text-2); margin-bottom: 15px; }
.note b { color: var(--text); font-weight: 700; font-variant-numeric: tabular-nums; }

.status { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; font-size: 13.5px; color: var(--text); padding-bottom: 15px; margin-bottom: 3px; border-bottom: 1px solid var(--border); }
.plain { font-size: 15px; line-height: 1.5; }

@media (prefers-reduced-motion: reduce) {
  * { transition-duration: 0ms !important; animation-duration: 0ms !important; }
}
.panel { animation: ppc-fade 120ms ease-out; }
@keyframes ppc-fade { from { opacity: 0; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) {
  .panel { animation: none; opacity: 1; }
}
`;
