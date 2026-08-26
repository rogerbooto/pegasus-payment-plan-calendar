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
    // `@media (prefers-color-scheme: dark) { :host {...} }` block -- so
    // this test must find the popup's OWN dark block specifically (the
    // one whose immediate child selector is `:root`, not `:host`), not
    // just the first `@media (prefers-color-scheme: dark)` in the file.
    const darkRootMatch = /@media \(prefers-color-scheme: dark\)\s*\{\s*:root\s*\{/.exec(POPUP_CSS);
    expect(darkRootMatch).not.toBeNull();
    const darkRootBody = ruleBody(POPUP_CSS.slice(darkRootMatch!.index), /:root\s*\{/);
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

// §4.10 case 1 (first-run UX spec) -- D4's regression guard. Only the
// token fix ships in this build (the three-state manual override in §4 is
// deferred); this still needs its own pinned test so a future edit cannot
// silently drop the page-bg fix that resolved the founder's actual
// complaint (a dark panel on a still-light page in both extension pages).
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
