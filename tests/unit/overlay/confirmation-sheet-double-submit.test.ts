/**
 * @vitest-environment jsdom
 *
 * edit-plan-spec.md §10 F2 — double-pressing "Add to my calendar" (or
 * "Save changes") used to be able to add a plan twice, or lose one:
 * renderForm disabled nothing during the write, and PlanLedger.addPlan
 * does a plain read-then-write-whole-array with no guard against two
 * overlapping calls. This is a NEW file (never an edit to the pinned
 * tests/unit/overlay/confirmation-sheet.test.ts).
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
  (el.querySelector("#ppc-f-count") as HTMLInputElement).value = "4";
  (el.querySelector("#ppc-f-cadence") as HTMLSelectElement).value = "MONTHLY";
  (el.querySelector("#ppc-f-each") as HTMLInputElement).value = "$15.00";
}

function submit(form: HTMLFormElement): void {
  form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("F2 — a second submit while a write is still pending cannot call onConfirm again", () => {
  it("dispatching submit twice before the pending write resolves calls onConfirm exactly once, and disables the submit button meanwhile", async () => {
    let resolvePending: () => void = () => undefined;
    const pending = new Promise<void>((resolve) => {
      resolvePending = resolve;
    });
    const onConfirm = vi.fn(() => pending);
    const el = container();
    renderManualEntrySheet(el, { onConfirm, onCancel: vi.fn() });
    fillValidPlan(el);

    const form = el.querySelector("form") as HTMLFormElement;
    const submitBtn = el.querySelector('button[type="submit"]') as HTMLButtonElement;

    submit(form);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    // RED if the fix is reverted: the button stays enabled and a second
    // dispatch below reaches onConfirm a second time.
    expect(submitBtn.disabled).toBe(true);

    submit(form);
    expect(onConfirm).toHaveBeenCalledTimes(1);

    resolvePending();
    await pending;
    await flush();
  });

  it("a rejected write re-enables the submit button, so a genuine retry (a third dispatch) DOES call onConfirm again", async () => {
    let rejectPending: (err: unknown) => void = () => undefined;
    const firstAttempt = new Promise<void>((_resolve, reject) => {
      rejectPending = reject;
    });
    const onConfirm = vi.fn().mockReturnValueOnce(firstAttempt).mockResolvedValueOnce(undefined);
    const el = container();
    renderManualEntrySheet(el, { onConfirm, onCancel: vi.fn() });
    fillValidPlan(el);

    const form = el.querySelector("form") as HTMLFormElement;
    const submitBtn = el.querySelector('button[type="submit"]') as HTMLButtonElement;

    submit(form);
    expect(submitBtn.disabled).toBe(true);

    rejectPending(new Error("storage full"));
    await firstAttempt.catch(() => undefined);
    await flush();

    expect(submitBtn.disabled).toBe(false);
    expect(el.querySelector('[role="alert"]')?.textContent).toContain("didn't save");

    submit(form);
    expect(onConfirm).toHaveBeenCalledTimes(2);
  });

  it("a plain (non-Promise) onConfirm never leaves the button stuck disabled -- back-compat with a synchronous caller", () => {
    const onConfirm = vi.fn();
    const el = container();
    renderManualEntrySheet(el, { onConfirm, onCancel: vi.fn() });
    fillValidPlan(el);

    const form = el.querySelector("form") as HTMLFormElement;
    const submitBtn = el.querySelector('button[type="submit"]') as HTMLButtonElement;
    submit(form);

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(submitBtn.disabled).toBe(false);
  });
});

describe("F7 — the submit handler validates firstPaymentDate itself, not only via native constraint validation", () => {
  it("an empty first-payment value blocks submission -- onConfirm is never called with a record carrying a blank date", () => {
    const onConfirm = vi.fn();
    const el = container();
    renderManualEntrySheet(el, { onConfirm, onCancel: vi.fn() });
    fillValidPlan(el);
    (el.querySelector("#ppc-f-first") as HTMLInputElement).value = "";

    submit(el.querySelector("form") as HTMLFormElement);

    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("a partial/malformed first-payment value (jsdom does not run native date-input constraint validation on a scripted submit) also blocks submission", () => {
    const onConfirm = vi.fn();
    const el = container();
    renderManualEntrySheet(el, { onConfirm, onCancel: vi.fn() });
    fillValidPlan(el);
    (el.querySelector("#ppc-f-first") as HTMLInputElement).value = "2026-13";

    submit(el.querySelector("form") as HTMLFormElement);

    expect(onConfirm).not.toHaveBeenCalled();
  });
});
