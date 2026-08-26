/**
 * BUG 2 + BUG 3 (popup design tokens / selected-state indicator).
 *
 * jsdom's CSS engine does not resolve `var()` in getComputedStyle at all
 * (verified by hand while writing this file: even a trivial
 * `:root { --gold: #B8976A } .btn { background: var(--gold) }` reports
 * `backgroundColor: rgba(0,0,0,0)` and `background: "var(--gold)"`
 * regardless of whether the token is declared correctly), so a
 * computed-style assertion here would report the exact same
 * "unresolved" result whether the bug is present or fixed — a test that
 * can never go green for the right reason and can never go red for the
 * wrong one. These tests instead assert on the generated CSS text
 * directly: whether the token declarations actually exist on a selector
 * that matches in a normal (non-shadow-root) document, and whether the
 * checkmark rule reserves its box unconditionally rather than only when
 * pressed.
 */
import { describe, expect, it } from "vitest";
import { POPUP_CSS } from "../../../src/popup/theme";
import { OVERLAY_CSS, LIGHT_TOKENS, DARK_TOKENS } from "../../../src/overlay/theme";

/** Pulls out the body of the first top-level rule whose selector matches. */
function ruleBody(css: string, selectorPattern: RegExp): string | null {
  const match = selectorPattern.exec(css);
  if (!match) return null;
  const start = css.indexOf("{", match.index);
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < css.length; i++) {
    if (css[i] === "{") depth++;
    if (css[i] === "}") {
      depth--;
      if (depth === 0) return css.slice(start + 1, i);
    }
  }
  return null;
}

describe("BUG 2 — popup design tokens resolve in a normal-document context", () => {
  it("OVERLAY_CSS still declares every token on :host (shadow-root usage untouched)", () => {
    const hostBody = ruleBody(OVERLAY_CSS, /:host\s*\{/);
    expect(hostBody).not.toBeNull();
    for (const token of ["--gold", "--btn-ink", "--control-line", "--text", "--border", "--focus", "--page-bg"]) {
      expect(hostBody).toContain(token);
    }
  });

  it("POPUP_CSS additionally declares the same tokens on :root -- :host matches nothing in a normal document", () => {
    const rootBody = ruleBody(POPUP_CSS, /:root\s*\{/);
    expect(rootBody).not.toBeNull();
    for (const token of ["--gold", "--btn-ink", "--control-line", "--text", "--border", "--focus", "--page-bg"]) {
      expect(rootBody).toContain(token);
    }
    // Same source constant as the overlay's own light tokens -- not a
    // second, hand-copied set of hex values that could drift.
    expect(rootBody).toContain(LIGHT_TOKENS.trim());
  });

  it("POPUP_CSS's dark-mode block also re-declares tokens on :root, not just :host", () => {
    // POPUP_CSS inlines OVERLAY_CSS, which has its OWN
    // `@media (prefers-color-scheme: dark) { :host(:not(...)) {...} }`
    // block -- so this test must find the popup's OWN dark block
    // specifically (the one whose immediate child selector is `:root`,
    // not `:host`), not just the first `@media (prefers-color-scheme:
    // dark)` in the file. The selector carries the §4 (first-run UX spec)
    // `:not([data-theme="light"])` scoping -- see the dedicated §4.10
    // describe block below for why.
    const darkRootMatch = /@media \(prefers-color-scheme: dark\)\s*\{\s*:root:not\(\[data-theme="light"\]\)\s*\{/.exec(
      POPUP_CSS,);
    expect(darkRootMatch).not.toBeNull();
    const darkRootBody = ruleBody(POPUP_CSS.slice(darkRootMatch!.index), /:root:not\(\[data-theme="light"\]\)\s*\{/);
    expect(darkRootBody).not.toBeNull();
    expect(darkRootBody).toContain(DARK_TOKENS.trim());
  });

  it("liveness — a POPUP_CSS with the :root block removed (the exact defect) has no :root rule at all", () => {
    const withoutRootBlock = POPUP_CSS.replace(/:root\s*\{[\s\S]*?\}\n?/g, "");
    expect(ruleBody(withoutRootBlock, /:root\s*\{/)).toBeNull();
  });
});

// §3.5 (first-run UX spec) -- BUG 3's ".btn__check" rules (and the button
// pair they belonged to) are gone entirely (§1); the Settings-discoverability
// affordance replaces them below.
describe("§3.5 — the labelled Settings control has a RESTING (not hover-only) affordance", () => {
  it(".iconbtn--labeled declares a border/background outside any :hover block (D10's fix)", () => {
    const restingBody = ruleBody(OVERLAY_CSS, /\.iconbtn--labeled\s*\{/);
    expect(restingBody).not.toBeNull();
    // A resting boundary: either an actual border colour or a fill,
    // never `border: 1px solid transparent` alone (that would be the same
    // invisible-until-hover affordance the spec rejects).
    expect(restingBody).toMatch(/border-color:\s*var\(--control-line\)/);
    expect(restingBody).toMatch(/background:\s*var\(--panel-alt\)/);
  });

  it(".iconbtn still declares the 44x44 minimum target size (target-size regression guard)", () => {
    const iconbtnBody = ruleBody(OVERLAY_CSS, /\.iconbtn\s*\{/);
    expect(iconbtnBody).toMatch(/min-width:\s*44px/);
    expect(iconbtnBody).toMatch(/min-height:\s*44px/);
  });

  it("the glyph span is a distinct rule from the resting rule (liveness -- the selectors do not collide)", () => {
    const glyphBody = ruleBody(OVERLAY_CSS, /\.iconbtn__glyph\s*\{/);
    expect(glyphBody).not.toBeNull();
  });
});

// §4.10 case 1 (first-run UX spec) -- D4's regression guard, and a
// prerequisite for §4's manual override: layering a three-state override
// on top of an incomplete dark-mode fix would just move the founder's
// original complaint (a dark panel on a still-light page) behind a
// control instead of removing it. Pinned so a future edit cannot silently
// drop the page-bg fix.
describe("D4 — DARK_TOKENS declares --page-bg", () => {
  it("DARK_TOKENS carries a --page-bg declaration", () => {
    expect(DARK_TOKENS).toMatch(/--page-bg:\s*#[0-9a-fA-F]{3,6}/);
  });

  it("liveness — a DARK_TOKENS with --page-bg stripped is caught by the assertion above", () => {
    const sabotaged = DARK_TOKENS.replace(/--page-bg:[^;]+;/, "");
    expect(sabotaged).not.toMatch(/--page-bg:/);
    expect(DARK_TOKENS).toMatch(/--page-bg:/);
  });
});

// §4.10 cases 2-3 (first-run UX spec) -- the manual appearance override's
// CSS mechanism: a `data-theme` attribute, scoped so "system" (no
// attribute) keeps the plain media-query behaviour untouched, "light"
// excludes the dark-on-dark-OS rule, and "dark" pins the dark tokens
// unconditionally. Case 1 (POPUP_CSS's own dark block) is covered by the
// "re-declares tokens on :root" test above; these are the two other
// selector shapes plus the OVERLAY_CSS parity guard.
describe("§4.10 cases 2-3 — the data-theme override selectors exist on both :root and :host", () => {
  it('POPUP_CSS declares :root[data-theme="dark"] carrying DARK_TOKENS', () => {
    const body = ruleBody(POPUP_CSS, /:root\[data-theme="dark"\]\s*\{/);
    expect(body).not.toBeNull();
    expect(body).toContain(DARK_TOKENS.trim());
  });

  it('OVERLAY_CSS declares :host([data-theme="dark"]) carrying DARK_TOKENS -- the overlay is not silently excluded from the override', () => {
    const body = ruleBody(OVERLAY_CSS, /:host\(\[data-theme="dark"\]\)\s*\{/);
    expect(body).not.toBeNull();
    expect(body).toContain(DARK_TOKENS.trim());
  });

  it('OVERLAY_CSS\'s own dark media query is scoped with :not([data-theme="light"]), matching POPUP_CSS\'s scoping', () => {
    const darkHostMatch = /@media \(prefers-color-scheme: dark\)\s*\{\s*:host\(:not\(\[data-theme="light"\]\)\)\s*\{/.exec(
      OVERLAY_CSS,);
    expect(darkHostMatch).not.toBeNull();
    const body = ruleBody(OVERLAY_CSS.slice(darkHostMatch!.index), /:host\(:not\(\[data-theme="light"\]\)\)\s*\{/);
    expect(body).toContain(DARK_TOKENS.trim());
  });

  it("liveness -- an OVERLAY_CSS with the :host([data-theme=\"dark\"]) rule stripped is caught by the assertion above", () => {
    const sabotaged = OVERLAY_CSS.replace(/:host\(\[data-theme="dark"\]\)\s*\{[^}]*\}/, "");
    expect(ruleBody(sabotaged, /:host\(\[data-theme="dark"\]\)\s*\{/)).toBeNull();
  });

  it('liveness -- an unscoped dark media query (":host {...}" instead of ":host(:not([data-theme=light]))") is caught by the scoping assertion above', () => {
    const sabotaged = OVERLAY_CSS.replace('@media (prefers-color-scheme: dark) {\n  :host(:not([data-theme="light"])) {', '@media (prefers-color-scheme: dark) {\n  :host {');
    const stillMatches = /@media \(prefers-color-scheme: dark\)\s*\{\s*:host\(:not\(\[data-theme="light"\]\)\)\s*\{/.test(
      sabotaged,);
    expect(stillMatches).toBe(false);
  });
});

// §5.6 cases 4-5 (first-run UX spec) -- the two CSS-only assertions from
// the preview-behaviour spec. The DOM/behavioural cases (1, 2, 3, 6) live
// in tests/unit/overlay/confirmation-sheet-preview.test.ts, a NEW file
// rather than an edit to confirmation-sheet.test.ts (§5.5 requires that
// file to stay unmodified).
describe("§5.6 case 4 — .echo--empty reserves zero space", () => {
  it("OVERLAY_CSS declares zero padding/margin/background for .echo--empty", () => {
    const body = ruleBody(OVERLAY_CSS, /\.echo--empty\s*\{/);
    expect(body).not.toBeNull();
    expect(body).toMatch(/padding:\s*0\b/);
    expect(body).toMatch(/margin:\s*0\b/);
    expect(body).toMatch(/background:\s*none\b/);
  });

  it("liveness — a POPUP_CSS/OVERLAY_CSS with .echo--empty stripped is caught by the assertion above", () => {
    const sabotaged = OVERLAY_CSS.replace(/\.echo--empty\s*\{[^}]*\}/, "");
    expect(ruleBody(sabotaged, /\.echo--empty\s*\{/)).toBeNull();
  });
});

describe("§5.6 case 5 — the form's submit row is pinned to the bottom of the scrolling panel body", () => {
  it("OVERLAY_CSS declares position: sticky; bottom: 0 on .form__actions", () => {
    const body = ruleBody(OVERLAY_CSS, /\.form__actions\s*\{/);
    expect(body).not.toBeNull();
    expect(body).toMatch(/position:\s*sticky/);
    expect(body).toMatch(/bottom:\s*0\b/);
  });

  it("liveness — a .form__actions rule without position: sticky is caught by the assertion above", () => {
    const sabotaged = OVERLAY_CSS.replace(/\.form__actions\s*\{[^}]*\}/, ".form__actions { bottom: 0; }");
    const sabotagedBody = ruleBody(sabotaged, /\.form__actions\s*\{/);
    expect(sabotagedBody).not.toMatch(/position:\s*sticky/);
  });
});

// D5/D7, and the separately-diagnosed max-height leak (first-run UX spec
// §6/§8, plus the bug report that shipped alongside it) -- width/height
// regression guards on the two extension-page-only selectors.
describe("D5/D7 — the popup/welcome-tab surfaces fit at 375px and never resize between screens", () => {
  it(".popup-root .panel uses max-width: 100% (not 100vw, which ignores this document's own body padding)", () => {
    const body = ruleBody(POPUP_CSS, /\.popup-root \.panel\s*\{/);
    expect(body).not.toBeNull();
    expect(body).toMatch(/max-width:\s*100%/);
    expect(body).not.toMatch(/max-width:\s*100vw/);
  });

  it("the separately-diagnosed bug: .popup-root .panel scopes the overlay's floating-panel max-height back out (max-height: none)", () => {
    const body = ruleBody(POPUP_CSS, /\.popup-root \.panel\s*\{/);
    expect(body).toMatch(/max-height:\s*none/);
  });

  it("OVERLAY_CSS's own .panel max-height cap is untouched (the overlay must still not take over the checkout page)", () => {
    const body = ruleBody(OVERLAY_CSS, /\.panel\s*\{/);
    expect(body).toMatch(/max-height:\s*min\(72vh,\s*640px\)/);
  });

  it(".onboard defaults to 340px (matching the popup panel), and only .popup-root--tab widens it to 380px", () => {
    const onboardBody = ruleBody(POPUP_CSS, /\.onboard\s*\{/);
    expect(onboardBody).toMatch(/width:\s*340px/);
    expect(onboardBody).toMatch(/max-width:\s*100%/);
    const tabBody = ruleBody(POPUP_CSS, /\.popup-root--tab \.onboard\s*\{/);
    expect(tabBody).toMatch(/width:\s*380px/);
  });
});

/*
 * Founder-reported regression: the pinned "Add to my calendar" / "Cancel"
 * row (`.form__actions`, sticky per §5 R4 above) visually collided with
 * whatever scrolled behind it -- an opaque row with no edge still reads as
 * two things colliding, not a layered toolbar, and the shortest surface
 * (the overlay, capped by `.panel`'s own `max-height`) showed it worst.
 * Two independent fixes, both regression-guarded below:
 *   (a) the row now paints a real top edge (--border-strong), visible in
 *       both colour schemes, so overlap reads as intentional layering;
 *   (b) the scroll reservation below the last field
 *       (`.panel__body:has(form)`'s `padding-bottom`) is now DERIVED from
 *       the same custom properties the row and its buttons render with,
 *       plus an explicit safety buffer -- not a hand-picked pixel figure
 *       that silently stops matching the row's real height once a button's
 *       own padding changes.
 */
describe("pinned form-actions row -- a visible top edge, in both colour schemes", () => {
  it(".form__actions declares a border-top drawn from --border-strong (not the plainer --border, and not transparent)", () => {
    const body = ruleBody(OVERLAY_CSS, /\.form__actions\s*\{/);
    expect(body).not.toBeNull();
    expect(body).toMatch(/border-top:\s*var\(--form-actions-border-w\)\s+solid\s+var\(--border-strong\)/);
  });

  it("--border-strong actually differs between LIGHT_TOKENS and DARK_TOKENS -- a visible edge, not a value that happens to vanish in one scheme", () => {
    const lightMatch = /--border-strong:\s*(#[0-9a-fA-F]{3,6})/.exec(LIGHT_TOKENS);
    const darkMatch = /--border-strong:\s*(#[0-9a-fA-F]{3,6})/.exec(DARK_TOKENS);
    expect(lightMatch).not.toBeNull();
    expect(darkMatch).not.toBeNull();
    expect(lightMatch![1]!.toLowerCase()).not.toBe(darkMatch![1]!.toLowerCase());
  });

  it("liveness -- a .form__actions rule with the border-top declaration stripped is caught by the assertion above", () => {
    const sabotaged = OVERLAY_CSS.replace(
      /\.form__actions\s*\{[^}]*\}/,
      ".form__actions { margin-top: 2px; position: sticky; bottom: 0; z-index: 1; background: var(--panel-bg); padding-top: 10px; padding-bottom: 2px; }",
    );
    const sabotagedBody = ruleBody(sabotaged, /\.form__actions\s*\{/);
    expect(sabotagedBody).not.toMatch(/border-top:/);
  });
});

describe("pinned form-actions row -- the scroll reservation is derived from the row's own declared height, not a magic number", () => {
  /** Reads `--name: <n>px` out of LIGHT_TOKENS and returns the number of pixels. */
  function tokenPx(name: string): number {
    const match = new RegExp(`${name}:\\s*(\\d+(?:\\.\\d+)?)px`).exec(LIGHT_TOKENS);
    if (!match) throw new Error(`token ${name} not found`);
    return parseInt(match[1]!, 10);
  }

  it(".btn's min-height is the shared --btn-min-h token, not a re-hardcoded 44px (so the reservation formula tracks it)", () => {
    const body = ruleBody(OVERLAY_CSS, /\.btn\s*\{/);
    expect(body).not.toBeNull();
    expect(body).toMatch(/min-height:\s*var\(--btn-min-h\)/);
    expect(body).not.toMatch(/min-height:\s*44px/);
  });

  it(".form__actions's own padding is the shared --form-actions-pad-top/bottom tokens, not re-hardcoded pixel values", () => {
    const body = ruleBody(OVERLAY_CSS, /\.form__actions\s*\{/);
    expect(body).toMatch(/padding-top:\s*var\(--form-actions-pad-top\)/);
    expect(body).toMatch(/padding-bottom:\s*var\(--form-actions-pad-bottom\)/);
  });

  it("--form-actions-h is a calc() built from --btn-min-h, --form-actions-pad-top, --form-actions-pad-bottom, --form-actions-border-w and --form-actions-safety -- the same tokens the row and its buttons are styled with", () => {
    const match = /--form-actions-h:\s*calc\(([^;]+)\)/.exec(LIGHT_TOKENS);
    expect(match).not.toBeNull();
    const formula = match![1];
    for (const token of [
      "--btn-min-h",
      "--form-actions-pad-top",
      "--form-actions-pad-bottom",
      "--form-actions-border-w",
      "--form-actions-safety",
    ]) {
      expect(formula).toContain(`var(${token})`);
    }
  });

  it(".panel__body:has(form) reserves var(--form-actions-h), not a re-hardcoded pixel figure", () => {
    const body = ruleBody(OVERLAY_CSS, /\.panel__body:has\(form\)\s*\{/);
    expect(body).not.toBeNull();
    expect(body).toMatch(/padding-bottom:\s*var\(--form-actions-h\)/);
    expect(body).not.toMatch(/padding-bottom:\s*\d/);
  });

  it("the reserved space (--form-actions-h) is strictly greater than the row's own minimum rendered height (button + row padding + border), by exactly the declared safety margin -- the relationship is asserted, not a hardcoded 64", () => {
    const btnMinH = tokenPx("--btn-min-h");
    const padTop = tokenPx("--form-actions-pad-top");
    const padBottom = tokenPx("--form-actions-pad-bottom");
    const borderW = tokenPx("--form-actions-border-w");
    const safety = tokenPx("--form-actions-safety");

    // The row's own minimum rendered height: the tallest child (a .btn,
    // whose border-box is at least --btn-min-h since box-sizing is
    // border-box everywhere) plus the row's own padding and border-top.
    const minRenderedRowHeight = btnMinH + padTop + padBottom + borderW;
    const reserved = minRenderedRowHeight + safety;

    expect(reserved).toBeGreaterThan(minRenderedRowHeight);
    expect(reserved - minRenderedRowHeight).toBe(safety);

    // Cross-check against the actual declared --form-actions-h formula
    // (same arithmetic, read straight out of the token block) so this
    // test breaks if the calc() and the component tokens ever disagree.
    const formulaMatch = /--form-actions-h:\s*calc\(([^;]+)\)/.exec(LIGHT_TOKENS);
    const formulaTokens = formulaMatch![1]!.match(/var\((--[a-z-]+)\)/g)!.map((v) => v.slice(4, -1));
    const formulaSum = formulaTokens.reduce((sum, name) => sum + tokenPx(name), 0);
    expect(formulaSum).toBe(reserved);
  });

  it("liveness -- reverting .btn's min-height to a re-hardcoded 44px stops it tracking --btn-min-h, caught by the assertion above", () => {
    const sabotaged = OVERLAY_CSS.replace(/\.btn\s*\{([^}]*)\}/, (_full, inner: string) =>
      `.btn {${inner.replace("min-height: var(--btn-min-h);", "min-height: 44px;")}}`,
    );
    const sabotagedBody = ruleBody(sabotaged, /\.btn\s*\{/);
    expect(sabotagedBody).not.toMatch(/min-height:\s*var\(--btn-min-h\)/);
  });

  it("liveness -- reverting .panel__body:has(form) to a hardcoded 64px is caught by the assertion above", () => {
    const sabotaged = OVERLAY_CSS.replace(
      /\.panel__body:has\(form\)\s*\{[^}]*\}/,
      ".panel__body:has(form) { padding-bottom: 64px; }",
    );
    const sabotagedBody = ruleBody(sabotaged, /\.panel__body:has\(form\)\s*\{/);
    expect(sabotagedBody).not.toMatch(/padding-bottom:\s*var\(--form-actions-h\)/);
  });

  it("liveness -- dropping --form-actions-safety from the calc() (i.e. no margin above the row's own minimum height) is caught by the relationship assertion", () => {
    const sabotagedLightTokens = LIGHT_TOKENS.replace(
      /--form-actions-h:\s*calc\([^;]+\)/,
      "--form-actions-h: calc(var(--btn-min-h) + var(--form-actions-pad-top) + var(--form-actions-pad-bottom) + var(--form-actions-border-w))",
    );
    function sabotagedTokenPx(name: string): number {
      const match = new RegExp(`${name}:\\s*(\\d+(?:\\.\\d+)?)px`).exec(sabotagedLightTokens);
      if (!match) throw new Error(`token ${name} not found`);
      return parseInt(match[1]!, 10);
    }
    const btnMinH = sabotagedTokenPx("--btn-min-h");
    const padTop = sabotagedTokenPx("--form-actions-pad-top");
    const padBottom = sabotagedTokenPx("--form-actions-pad-bottom");
    const borderW = sabotagedTokenPx("--form-actions-border-w");
    const minRenderedRowHeight = btnMinH + padTop + padBottom + borderW;

    const formulaMatch = /--form-actions-h:\s*calc\(([^;]+)\)/.exec(sabotagedLightTokens);
    const formulaTokens = formulaMatch![1]!.match(/var\((--[a-z-]+)\)/g)!.map((v) => v.slice(4, -1));
    const formulaSum = formulaTokens.reduce((sum, name) => sum + sabotagedTokenPx(name), 0);

    // Without the safety token in the formula, the reservation equals the
    // row's bare minimum height exactly -- no margin at all.
    expect(formulaSum).toBe(minRenderedRowHeight);
  });
});
