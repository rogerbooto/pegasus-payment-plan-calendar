/**
 * @vitest-environment jsdom
 *
 * OverlayHost's wiring of the order-total-suggestion feature (C4/C7): the
 * one-shot DOM read happens exactly once, only from the "Add a plan" user
 * action on a DEGRADED state, never before submit does anything reach
 * storage, and the DEGRADED panel's own copy (NOT_CONFIRMED/NOT_RECOGNIZED)
 * is never altered by whether a total was found (C5).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createOverlayHost, OVERLAY_HOST_TAG } from "../../../src/overlay/OverlayHost";
import { PlanLedger } from "../../../src/storage/ledger";
import { createFakeStore } from "./test-helpers";
import * as overlayCopy from "../../../src/overlay/copy";

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

function getShadow(): ShadowRoot {
  const host = document.body.querySelector(OVERLAY_HOST_TAG);
  if (!host) throw new Error("overlay host not mounted");
  const shadow = capturedShadowRoots.get(host);
  if (!shadow) throw new Error("shadow root was not captured for this host");
  return shadow;
}

/** Appends fixture "merchant page" content directly into document.body, exactly
 * where a real content-script's overlay host would find it alongside checkout DOM. */
function mountPageFixture(html: string): void {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  for (const child of [...parsed.body.childNodes]) {
    document.body.appendChild(document.importNode(child, true));
  }
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function clickAddAPlan(): void {
  const btn = [...getShadow().querySelectorAll("button")].find((b) => b.textContent === overlayCopy.ACTION_ADD) as
    | HTMLButtonElement
    | undefined;
  if (!btn) throw new Error('fixture drift: expected an "Add a plan" button');
  btn.click();
}

function clickCancel(): void {
  const btn = [...getShadow().querySelectorAll("button")].find((b) => b.textContent === overlayCopy.FORM_CANCEL) as
    | HTMLButtonElement
    | undefined;
  if (!btn) throw new Error('fixture drift: expected a "Cancel" button');
  btn.click();
}

beforeEach(() => {
  document.body.replaceChildren();
  document.head.replaceChildren();
});

const AMAZON_LIKE_TOTAL_HTML =
  '<div><span>Items:</span><span>CAD 74.99</span></div>' +
  '<div><span>Order Total:</span><span>CAD 89.96</span></div>';

describe("OverlayHost — order-total suggestion, DEGRADED(no_match)", () => {
  it("prefills the total field only after 'Add a plan' is clicked, never before", async () => {
    mountPageFixture(AMAZON_LIKE_TOTAL_HTML);
    const controller = createOverlayHost(document, { store: createFakeStore(), ledger: new PlanLedger(createFakeStore()), today: () => "2026-06-01" });
    controller.mount({ kind: "DEGRADED", reason: "no_match" });
    await flush();

    // Before the click: the honest degraded panel, no form, no field.
    expect(getShadow().querySelector("#ppc-f-total")).toBeNull();
    expect(getShadow().querySelector(".plain")?.textContent).toBe(overlayCopy.NOT_RECOGNIZED);

    clickAddAPlan();
    await flush();

    const totalInput = getShadow().querySelector("#ppc-f-total") as HTMLInputElement;
    expect(totalInput.value).toBe("$89.96");
    expect(getShadow().querySelector(".form__lead")?.textContent).toBe(overlayCopy.FORM_ORDER_TOTAL_ONLY_LEAD);
  });

  it("the panel's own DEGRADED copy is unchanged by whether a total was found (C5)", async () => {
    mountPageFixture(AMAZON_LIKE_TOTAL_HTML);
    const controller = createOverlayHost(document, { store: createFakeStore(), ledger: new PlanLedger(createFakeStore()), today: () => "2026-06-01" });
    controller.mount({ kind: "DEGRADED", reason: "no_match" });
    await flush();
    expect(getShadow().querySelector(".plain")?.textContent).toBe(overlayCopy.NOT_RECOGNIZED);
  });

  it("DEGRADED(unconfirmed) shows NOT_CONFIRMED before the click and still reaches the same suggestion path after", async () => {
    mountPageFixture(AMAZON_LIKE_TOTAL_HTML);
    const controller = createOverlayHost(document, { store: createFakeStore(), ledger: new PlanLedger(createFakeStore()), today: () => "2026-06-01" });
    controller.mount({ kind: "DEGRADED", reason: "unconfirmed" });
    await flush();
    expect(getShadow().querySelector(".plain")?.textContent).toBe(overlayCopy.NOT_CONFIRMED);

    clickAddAPlan();
    await flush();
    expect((getShadow().querySelector("#ppc-f-total") as HTMLInputElement).value).toBe("$89.96");
  });

  it("no order-total row on the page: the total field stays missing, no lead line", async () => {
    mountPageFixture("<article><h1>Nothing here</h1></article>");
    const controller = createOverlayHost(document, { store: createFakeStore(), ledger: new PlanLedger(createFakeStore()), today: () => "2026-06-01" });
    controller.mount({ kind: "DEGRADED", reason: "no_match" });
    await flush();
    clickAddAPlan();
    await flush();

    const field = getShadow().querySelector("#ppc-f-total")?.closest(".field");
    expect(field?.className).toContain("field--missing");
    expect(getShadow().querySelector(".form__lead")).toBeNull();
  });
});

describe("OverlayHost — ONE-SHOT read (never re-reads on a later click for the same mounted state)", () => {
  it("a DOM mutation after the first 'Add a plan' click does not change what a second visit to the form shows", async () => {
    mountPageFixture(AMAZON_LIKE_TOTAL_HTML);
    const controller = createOverlayHost(document, { store: createFakeStore(), ledger: new PlanLedger(createFakeStore()), today: () => "2026-06-01" });
    controller.mount({ kind: "DEGRADED", reason: "no_match" });
    await flush();

    clickAddAPlan();
    await flush();
    expect((getShadow().querySelector("#ppc-f-total") as HTMLInputElement).value).toBe("$89.96");

    clickCancel();
    await flush();

    // Mutate the page's total AFTER the first (and only) read.
    const valueSpan = [...document.body.querySelectorAll("span")].find((s) => s.textContent === "CAD 89.96");
    if (valueSpan) valueSpan.textContent = "CAD 1.00";

    clickAddAPlan();
    await flush();
    // RED if the read were repeated per-click rather than cached per mount().
    expect((getShadow().querySelector("#ppc-f-total") as HTMLInputElement).value).toBe("$89.96");
  });

  it("a fresh mount() (a new terminal state) DOES read again", async () => {
    mountPageFixture(AMAZON_LIKE_TOTAL_HTML);
    const controller = createOverlayHost(document, { store: createFakeStore(), ledger: new PlanLedger(createFakeStore()), today: () => "2026-06-01" });
    controller.mount({ kind: "DEGRADED", reason: "unconfirmed" });
    await flush();
    clickAddAPlan();
    await flush();
    expect((getShadow().querySelector("#ppc-f-total") as HTMLInputElement).value).toBe("$89.96");
    clickCancel();
    await flush();

    const valueSpan = [...document.body.querySelectorAll("span")].find((s) => s.textContent === "CAD 89.96");
    if (valueSpan) valueSpan.textContent = "CAD 1.00";

    // A brand-new terminal state (e.g. the real detector finally ran) --
    // this is a fresh mount(), so the cached suggestion is reset.
    controller.mount({ kind: "DEGRADED", reason: "no_match" });
    await flush();
    clickAddAPlan();
    await flush();
    expect((getShadow().querySelector("#ppc-f-total") as HTMLInputElement).value).toBe("$1.00");
  });
});

describe("OverlayHost — C7: nothing persists before submit", () => {
  it("clicking 'Add a plan' on a DEGRADED page with a real total never writes to storage before the form is submitted", async () => {
    mountPageFixture(AMAZON_LIKE_TOTAL_HTML);
    const store = createFakeStore();
    const setSpy = vi.spyOn(store, "set");
    const controller = createOverlayHost(document, { store, ledger: new PlanLedger(store), today: () => "2026-06-01" });
    controller.mount({ kind: "DEGRADED", reason: "no_match" });
    await flush();

    clickAddAPlan();
    await flush();
    expect((getShadow().querySelector("#ppc-f-total") as HTMLInputElement).value).toBe("$89.96");

    // The read itself, and rendering the suggestion into the form, must
    // not have touched storage.
    expect(setSpy).not.toHaveBeenCalled();

    (getShadow().querySelector("#ppc-f-count") as HTMLInputElement).value = "4";
    (getShadow().querySelector("#ppc-f-cadence") as HTMLSelectElement).value = "MONTHLY";
    (getShadow().querySelector("#ppc-f-each") as HTMLInputElement).value = "$22.49";
    const form = getShadow().querySelector("form") as HTMLFormElement;
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await flush();

    // Only AFTER an explicit submit does a write happen.
    expect(setSpy).toHaveBeenCalled();
  });
});
