/**
 * @vitest-environment jsdom
 *
 * §5 (first-run UX spec) — the "Add a plan" preview line's intended
 * behaviour: no reserved empty bar (R1), the live-region node stays in the
 * DOM (R2), an explicit `.echo--empty` class rather than `:empty` (R3),
 * and the preview + arithmetic note share one parent, always in preview-
 * then-note order (R5).
 *
 * This is a NEW file rather than an edit to
 * tests/unit/overlay/confirmation-sheet.test.ts — §5.5 requires that file
 * to pass UNMODIFIED (the founder specifically praised the untouched
 * required-field behaviour it pins), so every new assertion in this
 * section lands here instead.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderManualEntrySheet } from "../../../src/overlay/ConfirmationSheet";

beforeEach(() => {
  document.body.replaceChildren();
});

function container(): HTMLDivElement {
  const div = document.createElement("div");
  document.body.appendChild(div);
  return div;
}

function fillValidPlan(el: HTMLElement): void {
  (el.querySelector("#ppc-f-total") as HTMLInputElement).value = "$60.00";
  (el.querySelector("#ppc-f-total") as HTMLInputElement).dispatchEvent(new Event("input", { bubbles: true }));
  (el.querySelector("#ppc-f-count") as HTMLInputElement).value = "4";
  (el.querySelector("#ppc-f-count") as HTMLInputElement).dispatchEvent(new Event("input", { bubbles: true }));
  const cadenceSelect = el.querySelector("#ppc-f-cadence") as HTMLSelectElement;
  cadenceSelect.value = "MONTHLY";
  cadenceSelect.dispatchEvent(new Event("change", { bubbles: true }));
  (el.querySelector("#ppc-f-each") as HTMLInputElement).value = "$15.00";
  (el.querySelector("#ppc-f-each") as HTMLInputElement).dispatchEvent(new Event("input", { bubbles: true }));
}

describe("§5.6 case 1 — a blank required field leaves the preview present but empty", () => {
  it("the preview element exists, carries .echo--empty, and has empty textContent (no whitespace-only text node)", () => {
    const el = container();
    renderManualEntrySheet(el, { onConfirm: vi.fn(), onCancel: vi.fn() });

    const echo = el.querySelector(".echo");
    expect(echo).not.toBeNull();
    expect(echo?.classList.contains("echo--empty")).toBe(true);
    expect(echo?.textContent).toBe("");
  });
});

describe("§5.6 case 2 — all fields valid fills the preview and drops .echo--empty", () => {
  it("shows the expected dates string and removes the empty class", async () => {
    vi.useFakeTimers();
    const el = container();
    renderManualEntrySheet(el, { onConfirm: vi.fn(), onCancel: vi.fn() });

    fillValidPlan(el);
    vi.advanceTimersByTime(500);
    vi.useRealTimers();

    const echo = el.querySelector(".echo");
    expect(echo?.classList.contains("echo--empty")).toBe(false);
    expect(echo?.textContent).toMatch(/^These dates: /);
  });
});

describe("§5.6 case 3 — clearing a field again restores .echo--empty", () => {
  it("re-empties the preview and re-adds the class", () => {
    vi.useFakeTimers();
    const el = container();
    renderManualEntrySheet(el, { onConfirm: vi.fn(), onCancel: vi.fn() });

    fillValidPlan(el);
    vi.advanceTimersByTime(500);

    const totalInput = el.querySelector("#ppc-f-total") as HTMLInputElement;
    totalInput.value = "";
    totalInput.dispatchEvent(new Event("input", { bubbles: true }));
    vi.advanceTimersByTime(500);
    vi.useRealTimers();

    const echo = el.querySelector(".echo");
    expect(echo?.classList.contains("echo--empty")).toBe(true);
    expect(echo?.textContent).toBe("");
  });
});

describe("§5.6 case 6 — the preview and the arithmetic note share one parent, the immediate previous sibling of the actions row", () => {
  it("holds regardless of which field is filled last (total last)", () => {
    vi.useFakeTimers();
    const el = container();
    renderManualEntrySheet(el, { onConfirm: vi.fn(), onCancel: vi.fn() });

    (el.querySelector("#ppc-f-count") as HTMLInputElement).value = "4";
    (el.querySelector("#ppc-f-count") as HTMLInputElement).dispatchEvent(new Event("input", { bubbles: true }));
    const cadenceSelect = el.querySelector("#ppc-f-cadence") as HTMLSelectElement;
    cadenceSelect.value = "MONTHLY";
    cadenceSelect.dispatchEvent(new Event("change", { bubbles: true }));
    (el.querySelector("#ppc-f-each") as HTMLInputElement).value = "$15.00";
    (el.querySelector("#ppc-f-each") as HTMLInputElement).dispatchEvent(new Event("input", { bubbles: true }));
    // Total last, and set to something that disagrees with count x each so
    // the arithmetic note renders too.
    const totalInput = el.querySelector("#ppc-f-total") as HTMLInputElement;
    totalInput.value = "$163.94";
    totalInput.dispatchEvent(new Event("input", { bubbles: true }));
    vi.advanceTimersByTime(500);
    vi.useRealTimers();

    const echo = el.querySelector(".echo") as HTMLElement;
    const note = el.querySelector(".note") as HTMLElement;
    expect(note).not.toBeNull();
    expect(echo.parentElement).toBe(note.parentElement);
    // preview before note, in DOM order, within their shared parent
    const parent = echo.parentElement as HTMLElement;
    const children = [...parent.children];
    expect(children.indexOf(echo)).toBeLessThan(children.indexOf(note));
    // that shared parent is the actions row's immediate previous sibling
    const actions = el.querySelector(".actions") as HTMLElement;
    expect(actions.previousElementSibling).toBe(parent);
  });

  it("holds regardless of which field is filled last (each last)", () => {
    vi.useFakeTimers();
    const el = container();
    renderManualEntrySheet(el, { onConfirm: vi.fn(), onCancel: vi.fn() });

    const totalInput = el.querySelector("#ppc-f-total") as HTMLInputElement;
    totalInput.value = "$163.94";
    totalInput.dispatchEvent(new Event("input", { bubbles: true }));
    (el.querySelector("#ppc-f-count") as HTMLInputElement).value = "4";
    (el.querySelector("#ppc-f-count") as HTMLInputElement).dispatchEvent(new Event("input", { bubbles: true }));
    const cadenceSelect = el.querySelector("#ppc-f-cadence") as HTMLSelectElement;
    cadenceSelect.value = "MONTHLY";
    cadenceSelect.dispatchEvent(new Event("change", { bubbles: true }));
    // Each last.
    const eachInput = el.querySelector("#ppc-f-each") as HTMLInputElement;
    eachInput.value = "$15.00";
    eachInput.dispatchEvent(new Event("input", { bubbles: true }));
    vi.advanceTimersByTime(500);
    vi.useRealTimers();

    const echo = el.querySelector(".echo") as HTMLElement;
    const note = el.querySelector(".note") as HTMLElement;
    expect(note).not.toBeNull();
    expect(echo.parentElement).toBe(note.parentElement);
    const parent = echo.parentElement as HTMLElement;
    const children = [...parent.children];
    expect(children.indexOf(echo)).toBeLessThan(children.indexOf(note));
    const actions = el.querySelector(".actions") as HTMLElement;
    expect(actions.previousElementSibling).toBe(parent);
  });
});
