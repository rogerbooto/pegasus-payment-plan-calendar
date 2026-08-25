/**
 * @vitest-environment jsdom
 *
 * The toolbar's genuineness surface (T14). It is the ONLY place this
 * codebase is allowed to make a genuineness claim — and it must never
 * contain a credential/PII input of any kind.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToolbarVerification } from "../../../src/overlay/ToolbarVerification";

beforeEach(() => {
  document.body.replaceChildren();
});

describe("ToolbarVerification — T14", () => {
  it("renders genuineness copy and contains no input element of any kind", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    renderToolbarVerification(el, { onBack: vi.fn() });

    expect(el.textContent).toContain("How to know it's genuine");
    expect(el.textContent).toContain("This screen, and this screen only.");
    // The exact guard: RED if any <input> (password, email, or otherwise)
    // is ever added to this surface.
    expect(el.querySelectorAll("input").length).toBe(0);
    expect(el.querySelector('input[type="password"]')).toBeNull();
    expect(el.querySelector('input[type="email"]')).toBeNull();
  });

  it("the back control calls onBack", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const onBack = vi.fn();
    renderToolbarVerification(el, { onBack });

    const back = el.querySelector('[aria-label="Back to settings"]') as HTMLButtonElement;
    expect(back).not.toBeNull();
    back.click();
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
