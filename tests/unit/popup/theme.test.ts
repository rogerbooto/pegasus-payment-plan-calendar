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

describe("BUG 3 — the selected-state indicator reserves its box unconditionally (no phantom label shift)", () => {
  const checkBody = ruleBody(POPUP_CSS, /\.btn__check\s*\{/);

  it("the base .btn__check rule (unpressed state) reserves real width/height/margin, not display: none", () => {
    expect(checkBody).not.toBeNull();
    expect(checkBody).toMatch(/width:\s*13px/);
    expect(checkBody).toMatch(/height:\s*13px/);
    expect(checkBody).toMatch(/margin-right:\s*6px/);
    // The old defect: `display: none` in the base rule removes the box
    // (and its width/margin) entirely in the unpressed state, so toggling
    // to the pressed rule's `display: inline-flex` re-adds 19px of width
    // that wasn't there a moment before -- the exact "text jumps" bug.
    expect(checkBody).not.toMatch(/display:\s*none/);
  });

  it("the pressed-state rule toggles visibility only, never display/width/margin", () => {
    const pressedBody = ruleBody(POPUP_CSS, /\.btn\[aria-pressed="true"\]\s+\.btn__check\s*\{/);
    expect(pressedBody).not.toBeNull();
    expect(pressedBody).toMatch(/visibility:\s*visible/);
    expect(pressedBody).not.toMatch(/display/);
    expect(pressedBody).not.toMatch(/width/);
    expect(pressedBody).not.toMatch(/margin/);
  });

  it("liveness — reverting to the old display:none/inline-flex pair is caught by the assertions above", () => {
    const sabotagedCss = POPUP_CSS
      .replace(/\.btn__check\s*\{[^}]*\}/, ".btn__check { display: none; width: 13px; height: 13px; margin-right: 6px; }")
      .replace(
        /\.btn\[aria-pressed="true"\]\s+\.btn__check\s*\{[^}]*\}/,
        '.btn[aria-pressed="true"] .btn__check { display: inline-flex; }',
      );
    const sabotagedBase = ruleBody(sabotagedCss, /\.btn__check\s*\{/);
    expect(sabotagedBase).toMatch(/display:\s*none/); // proves the sabotage actually landed
    expect(checkBody).not.toMatch(/display:\s*none/); // proves the real file does not regress to it
  });
});
