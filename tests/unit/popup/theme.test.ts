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

// §5.6 case 4 (first-run UX spec) -- the CSS-only assertion from the
// preview-behaviour spec. The DOM/behavioural cases (1, 2, 3, 6) live in
// tests/unit/overlay/confirmation-sheet-preview.test.ts, a NEW file rather
// than an edit to confirmation-sheet.test.ts (§5.5 requires that file to
// stay unmodified). §5.6 case 5 (the submit row pinned via
// position: sticky) is gone: the overlay-form-layout spec replaces the
// sticky mechanism with a real panel footer outside the scroll region --
// see "form-actions footer" below for its regression guard.
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
 * Founder-reported regression, and the overlay-form-layout spec's
 * replacement mechanism: the old pinned "Add to my calendar" / "Cancel"
 * row (`.form__actions`, `position: sticky` inside the scrolling
 * `.panel__body`) visually collided with whatever scrolled behind it --
 * an opaque row with no edge still reads as two things colliding, not a
 * layered toolbar. The fix is not a heavier edge treatment: `.form__actions`
 * is now a real panel footer OUTSIDE the form's scroll region (`.form__fields`
 * above it owns the only scrollport), so overlap is impossible by
 * construction rather than merely disguised. What's left to regression-guard
 * here is cosmetic and dimensional, not structural (the structural guarantee
 * -- "not sticky", "scrollport excludes the actions" -- lives in the
 * "overlay-form-layout" describe blocks below):
 *   (a) the row still paints a real top edge (--border-strong), visible in
 *       both colour schemes, now a genuine footer seam rather than
 *       compensation for an overlap;
 *   (b) its own padding is still built from shared tokens, not re-hardcoded
 *       pixel values, so a later edit to one can't silently drift from the
 *       other;
 *   (c) the button's own min-height is still the shared --btn-min-h token.
 */
describe("form-actions footer -- a visible top edge and token-derived sizing, in both colour schemes", () => {
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
    // Was: the old sticky declarations this rule used to carry. Updated to
    // the new (non-sticky, footer) shape minus border-top, so the sabotage
    // stays representative of what a future editor could plausibly revert to.
    const sabotaged = OVERLAY_CSS.replace(
      /\.form__actions\s*\{[^}]*\}/,
      ".form__actions { flex: 0 0 auto; margin-top: 0; background: var(--panel-bg); padding-top: 12px; padding-bottom: 12px; padding-inline: 16px; }",
    );
    const sabotagedBody = ruleBody(sabotaged, /\.form__actions\s*\{/);
    expect(sabotagedBody).not.toMatch(/border-top:/);
  });

  it(".btn's min-height is the shared --btn-min-h token, not a re-hardcoded 44px", () => {
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

  it("liveness -- reverting .btn's min-height to a re-hardcoded 44px stops it tracking --btn-min-h, caught by the assertion above", () => {
    const sabotaged = OVERLAY_CSS.replace(/\.btn\s*\{([^}]*)\}/, (_full, inner: string) =>
      `.btn {${inner.replace("min-height: var(--btn-min-h);", "min-height: 44px;")}}`,
    );
    const sabotagedBody = ruleBody(sabotaged, /\.btn\s*\{/);
    expect(sabotagedBody).not.toMatch(/min-height:\s*var\(--btn-min-h\)/);
  });
});

/*
 * overlay-form-layout spec (docs/design/bnpl-watcher/overlay-form-layout-spec.md)
 * §7.4 -- the structural guarantee that replaces the sticky mechanism
 * entirely: overlap between a form field and the actions row is impossible
 * by construction, because the actions row is no longer inside any scroll
 * container at all.
 */
describe("overlay-form-layout §7.4.1 — .form__actions is not sticky", () => {
  it("declares flex: 0 0 auto and neither position: sticky nor z-index", () => {
    const body = ruleBody(OVERLAY_CSS, /\.form__actions\s*\{/);
    expect(body).not.toBeNull();
    expect(body).not.toMatch(/position:\s*sticky/);
    expect(body).not.toMatch(/z-index/);
    expect(body).toMatch(/flex:\s*0 0 auto/);
  });

  it("liveness -- an OVERLAY_CSS with position: sticky reintroduced on .form__actions is caught by the assertion above", () => {
    const sabotaged = OVERLAY_CSS.replace(
      /\.form__actions\s*\{/,
      ".form__actions { position: sticky; bottom: 0; z-index: 1;",
    );
    const body = ruleBody(sabotaged, /\.form__actions\s*\{/);
    expect(body).toMatch(/position:\s*sticky/);
    expect(body).toMatch(/z-index/);
  });
});

describe("overlay-form-layout §7.4.2 — the scrollport excludes the actions row", () => {
  it(".panel__body:has(> form) is a flex frame, .form__fields is the only scroll container, and the old reservation rule is gone", () => {
    const frameBody = ruleBody(OVERLAY_CSS, /\.panel__body:has\(> form\)\s*\{/);
    expect(frameBody).not.toBeNull();
    expect(frameBody).toMatch(/overflow:\s*hidden/);
    expect(frameBody).toMatch(/display:\s*flex/);

    const fieldsBody = ruleBody(OVERLAY_CSS, /\.form__fields\s*\{/);
    expect(fieldsBody).not.toBeNull();
    expect(fieldsBody).toMatch(/overflow-y:\s*auto/);

    expect(OVERLAY_CSS).not.toMatch(/\.panel__body:has\(form\)\s*\{/);
  });

  it("liveness -- an OVERLAY_CSS with the old .panel__body:has(form) reservation rule reintroduced is caught by the absence assertion above", () => {
    const sabotaged = `${OVERLAY_CSS}\n.panel__body:has(form) { padding-bottom: 64px; }\n`;
    expect(sabotaged).toMatch(/\.panel__body:has\(form\)\s*\{/);
  });
});

describe("overlay-form-layout §7.4.3 — no orphan tokens", () => {
  it("LIGHT_TOKENS and OVERLAY_CSS reference neither --form-actions-h nor --form-actions-safety", () => {
    expect(LIGHT_TOKENS).not.toMatch(/--form-actions-h\b/);
    expect(LIGHT_TOKENS).not.toMatch(/--form-actions-safety\b/);
    expect(OVERLAY_CSS).not.toMatch(/--form-actions-h\b/);
    expect(OVERLAY_CSS).not.toMatch(/--form-actions-safety\b/);
  });

  it("liveness -- reintroducing --form-actions-h in LIGHT_TOKENS is caught by the assertion above", () => {
    const sabotaged = `${LIGHT_TOKENS}\n --form-actions-h: 65px;\n`;
    expect(sabotaged).toMatch(/--form-actions-h\b/);
  });
});

describe("overlay-form-layout §7.4.4 — .sr-only is declared after .hint", () => {
  it("OVERLAY_CSS declares .sr-only after .hint (utilities win over component margins)", () => {
    const hintIndex = OVERLAY_CSS.indexOf(".hint {");
    const srOnlyIndex = OVERLAY_CSS.indexOf(".sr-only {");
    expect(hintIndex).toBeGreaterThan(-1);
    expect(srOnlyIndex).toBeGreaterThan(-1);
    expect(srOnlyIndex).toBeGreaterThan(hintIndex);
  });

  it("liveness -- an ordering with .sr-only before .hint is caught by the assertion above", () => {
    const sabotaged = ".sr-only { position: absolute; }\n.hint { margin-top: 4px; }\n";
    expect(sabotaged.indexOf(".sr-only {")).toBeLessThan(sabotaged.indexOf(".hint {"));
  });
});

describe("overlay-form-layout §7.4.5 — scroll does not chain to the host page", () => {
  it(".form__fields declares overscroll-behavior: contain", () => {
    const body = ruleBody(OVERLAY_CSS, /\.form__fields\s*\{/);
    expect(body).not.toBeNull();
    expect(body).toMatch(/overscroll-behavior:\s*contain/);
  });

  it("liveness -- a .form__fields rule without overscroll-behavior is caught by the assertion above", () => {
    const body = ruleBody(OVERLAY_CSS, /\.form__fields\s*\{/)!;
    const sabotaged = body.replace(/overscroll-behavior:\s*contain;\s*/, "");
    expect(sabotaged).not.toMatch(/overscroll-behavior:\s*contain/);
  });
});

describe("overlay-form-layout §7.4.6 — the grid stacks on panel width, not viewport width", () => {
  it("OVERLAY_CSS declares a container query on ppcpanel, .panel declares the container, and the old viewport media query is gone", () => {
    expect(OVERLAY_CSS).toMatch(/@container ppcpanel \(max-width:\s*319px\)/);
    const panelBody = ruleBody(OVERLAY_CSS, /\.panel\s*\{/);
    expect(panelBody).toMatch(/container:\s*ppcpanel\s*\/\s*inline-size/);
    expect(OVERLAY_CSS).not.toMatch(/@media \(max-width:\s*420px\)/);
  });

  it("liveness -- reintroducing the old @media (max-width: 420px) rule for .grid2 is caught by the absence assertion above", () => {
    const sabotaged = `${OVERLAY_CSS}\n@media (max-width: 420px) { .grid2 { grid-template-columns: 1fr; } }\n`;
    expect(sabotaged).toMatch(/@media \(max-width:\s*420px\)/);
  });
});
