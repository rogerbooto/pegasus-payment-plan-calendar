/**
 * @vitest-environment jsdom
 *
 * The overlay host's structural invariants (the design spec T10,
 * T11, T12, T13) and dismissal-by-keyboard. Each test asserts the specific
 * guard named in its title, not just a visible outcome, so it turns RED
 * when that exact mitigation is deleted — matching the task's sabotage-
 * probe requirement.
 *
 * Reaching into the panel's rendered content for interaction tests
 * requires capturing the ShadowRoot at creation time, because a genuinely
 * closed root (per T11) is unreachable via `element.shadowRoot` from
 * outside — that inaccessibility is exactly what's under test elsewhere in
 * this file. `beforeAll` below wraps `Element.prototype.attachShadow` to
 * record the real root into a side channel for test assertions only; it
 * does not change what `mode: "closed"` does for any other caller, so it
 * does not weaken the production guard — `host.shadowRoot === null` is
 * still asserted directly, without this wrapper's help, in the dedicated
 * "closed shadow root" test below.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createOverlayHost, OVERLAY_HOST_TAG } from "../../../src/overlay/OverlayHost";
import { PlanLedger } from "../../../src/storage/ledger";
import { createFakeStore } from "./test-helpers";
import type { EngineState } from "../../../src/shared/types";
import { assertCents } from "../../../src/shared/money";

const capturedShadowRoots = new WeakMap<Element, ShadowRoot>();
let originalAttachShadow: typeof Element.prototype.attachShadow;

beforeAll(() => {
  originalAttachShadow = Element.prototype.attachShadow;
  Element.prototype.attachShadow = function (init: ShadowRootInit): ShadowRoot {
    const root = originalAttachShadow.call(this, init);
    capturedShadowRoots.set(this, root);
    return root;
  };
});

afterAll(() => {
  Element.prototype.attachShadow = originalAttachShadow;
});

function getShadow(doc: Document): ShadowRoot {
  const host = doc.body.querySelector(OVERLAY_HOST_TAG);
  if (!host) throw new Error("overlay host not mounted");
  const shadow = capturedShadowRoots.get(host);
  if (!shadow) throw new Error("shadow root was not captured for this host");
  return shadow;
}

function recognizedState(): EngineState {
  return {
    kind: "PARSED_CONFIRMABLE",
    candidate: {
      orderTotalCents: assertCents(15000, "total"),
      installmentCount: 4,
      cadence: "BIWEEKLY",
      perInstallmentCents: assertCents(3750, "each"),
      currency: "CAD",
      confidence: { hardGatesPassed: true, softScore: 6, signals: [] },
    },
  };
}

function makeDeps() {
  const store = createFakeStore();
  const ledger = new PlanLedger(store);
  return { store, ledger, today: () => "2026-06-01" };
}

/** Flushes the ledger-read microtask chain OverlayHost's async body-render awaits. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  document.body.replaceChildren();
  document.head.replaceChildren();
});

describe("OverlayHost — closed shadow root (T11)", () => {
  it("host.shadowRoot reads back null from page context, even though content was rendered", () => {
    const controller = createOverlayHost(document, makeDeps());
    controller.mount(recognizedState());
    const host = document.body.querySelector(OVERLAY_HOST_TAG) as HTMLElement | null;
    expect(host).not.toBeNull();
    // The exact guard: RED if attachShadow's mode is ever changed from "closed" to "open".
    expect(host?.shadowRoot).toBeNull();
    // And there genuinely is rendered content — this isn't passing because
    // nothing was ever mounted.
    expect(getShadow(document).querySelector(".panel")).not.toBeNull();
  });
});

describe("OverlayHost — anchoring (T11/T13)", () => {
  it("mounts as a direct child of document.body, never inside a payment form or an iframe", () => {
    const form = document.createElement("form");
    form.id = "payment-form";
    document.body.appendChild(form);
    const iframe = document.createElement("iframe");
    document.body.appendChild(iframe);

    const controller = createOverlayHost(document, makeDeps());
    controller.mount(recognizedState());

    const host = document.body.querySelector(OVERLAY_HOST_TAG);
    expect(host).not.toBeNull();
    // The exact guard: RED if the host is ever appended into `form` or `iframe`
    // instead of `doc.body`.
    expect(host?.parentElement).toBe(document.body);
    expect(form.contains(host)).toBe(false);
    expect(iframe.contains(host)).toBe(false);
  });

  it("never modifies the checkout DOM outside the single host element (T10)", () => {
    const form = document.createElement("form");
    const cardField = document.createElement("input");
    cardField.name = "card";
    form.appendChild(cardField);
    document.body.appendChild(form);
    const formSnapshotBefore = form.outerHTML;

    const controller = createOverlayHost(document, makeDeps());
    controller.mount(recognizedState());

    // The exact guard: the page's own form markup is byte-identical after
    // mount. RED if the overlay ever writes an attribute/class/node into
    // page-owned elements instead of confining itself to its own host.
    expect(form.outerHTML).toBe(formSnapshotBefore);
  });

  it("leaves no Watcher-authored marker in page DOM after unmount (T10)", () => {
    const bodyChildCountBefore = document.body.children.length;
    const controller = createOverlayHost(document, makeDeps());
    controller.mount(recognizedState());
    expect(document.body.querySelector(OVERLAY_HOST_TAG)).not.toBeNull();

    controller.unmount();

    // The exact guard: the host element itself is gone, and body has
    // returned to its pre-mount child count. RED if unmount() stops
    // removing the host node.
    expect(document.body.querySelector(OVERLAY_HOST_TAG)).toBeNull();
    expect(document.body.children.length).toBe(bodyChildCountBefore);
  });
});

describe("OverlayHost — style isolation (T12)", () => {
  it("never injects a global stylesheet into the page; the panel's <style> lives only inside the shadow root", () => {
    const headStyleCountBefore = document.head.querySelectorAll("style,link").length;
    const controller = createOverlayHost(document, makeDeps());
    controller.mount(recognizedState());

    // The exact guard: no <style>/<link> was added to the page's own head.
    // RED if the overlay ever calls document.head.appendChild(styleTag(...)).
    expect(document.head.querySelectorAll("style,link").length).toBe(headStyleCountBefore);

    const host = document.body.querySelector(OVERLAY_HOST_TAG) as HTMLElement;
    expect(host.shadowRoot).toBeNull();
    expect(getShadow(document).querySelector("style")).not.toBeNull();
  });
});

describe("OverlayHost — dismissal", () => {
  it("clicking the dismiss control removes the host and further mount() calls are inert for the session", () => {
    const controller = createOverlayHost(document, makeDeps());
    controller.mount(recognizedState());
    const shadow = getShadow(document);
    const dismissBtn = shadow.querySelector('[aria-label="Dismiss this panel"]') as HTMLButtonElement;
    expect(dismissBtn).not.toBeNull();
    dismissBtn.click();

    expect(document.body.querySelector(OVERLAY_HOST_TAG)).toBeNull();

    // RED if dismissal is not "final for this session": a later
    // mount() call must not resurrect the panel.
    controller.mount(recognizedState());
    expect(document.body.querySelector(OVERLAY_HOST_TAG)).toBeNull();
  });

  it("dismisses via Escape when focus is not inside an open form", () => {
    const controller = createOverlayHost(document, makeDeps());
    controller.mount(recognizedState());
    const host = document.body.querySelector(OVERLAY_HOST_TAG) as HTMLElement;
    expect(host).not.toBeNull();

    const shadow = getShadow(document);
    const titleHeading = shadow.querySelector("#ppc-title") as HTMLElement;
    // Escape is bound on the shadow root itself (not `document`), so we
    // dispatch a bubbling keydown from inside the shadow tree — the exact
    // scope the guard claims to cover.
    titleHeading.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, composed: true }));

    expect(document.body.querySelector(OVERLAY_HOST_TAG)).toBeNull();
  });

  it("Escape inside the confirmation form cancels the form (returns to the previous view) instead of dismissing the whole panel", async () => {
    const controller = createOverlayHost(document, makeDeps());
    controller.mount(recognizedState());
    await flush();
    let shadow = getShadow(document);
    const checkBtn = [...shadow.querySelectorAll("button")].find((b) => b.textContent === "Check the numbers") as HTMLButtonElement;
    checkBtn.click();

    shadow = getShadow(document);
    const totalInput = shadow.querySelector("#ppc-f-total") as HTMLInputElement;
    expect(totalInput).not.toBeNull();
    totalInput.focus();
    expect(shadow.activeElement).toBe(totalInput);

    totalInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, composed: true }));
    await flush();

    // The panel is still mounted (Escape cancelled the form, not the panel).
    expect(document.body.querySelector(OVERLAY_HOST_TAG)).not.toBeNull();
    shadow = getShadow(document);
    expect(shadow.querySelector("#ppc-f-total")).toBeNull();
    expect([...shadow.querySelectorAll("button")].some((b) => b.textContent === "Check the numbers")).toBe(true);
  });
});
