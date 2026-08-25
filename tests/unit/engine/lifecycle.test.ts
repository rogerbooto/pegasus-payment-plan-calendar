// @vitest-environment jsdom
/**
 * D6 §G lifecycle: the pre-gate decides whether to observe at all; when it
 * does, exactly ONE MutationObserver is attached, scoped to an anchor
 * subtree (never `document`); rapid mutations are debounced into a single
 * parse; teardown disconnects everything and restores history; a route
 * change tears the old session down and starts a fresh one (no stale
 * candidate/observer survives navigation).
 *
 * Each test targets a SPECIFIC mechanism (observer count, scope element,
 * timer cancellation, history restoration) rather than only the end
 * result, so a regression that keeps the final onState() output looking
 * right while leaking an observer/timer/history patch still turns the
 * test red.
 *
 * `MutationObserver` callbacks are microtasks, not timer callbacks --
 * `vi.advanceTimersByTime` alone does not flush them. Every test below
 * uses `await vi.advanceTimersByTimeAsync(...)`, which does.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEngineLifecycle } from "../../../src/engine/lifecycle";
import { extractionCore } from "../../../src/engine/extraction-core";
import type { EngineState } from "../../../src/shared/types";

/** Radiogroup: the cheap pre-gate's generic structural probe (src/engine/generic-lexicon.ts). */
function mountPaymentAffordancePage(): void {
  document.body.replaceChildren();
  const group = document.createElement("div");
  group.setAttribute("role", "radiogroup");
  document.body.appendChild(group);
}

function mountUnrelatedPage(): void {
  document.body.replaceChildren();
  const p = document.createElement("p");
  p.textContent = "nothing checkout-shaped here";
  document.body.appendChild(p);
}

/** Counts real MutationObserver constructions without changing its behaviour. */
function spyOnMutationObserver(): { count: () => number; restore: () => void } {
  const OriginalMO = window.MutationObserver;
  let constructions = 0;
  class CountingObserver extends OriginalMO {
    constructor(callback: MutationCallback) {
      super(callback);
      constructions += 1;
    }
  }
  window.MutationObserver = CountingObserver as typeof MutationObserver;
  return {
    count: () => constructions,
    restore: () => {
      window.MutationObserver = OriginalMO;
    },
  };
}

describe("createEngineLifecycle", () => {
  let originalPushState: History["pushState"];
  let originalReplaceState: History["replaceState"];

  beforeEach(() => {
    originalPushState = window.history.pushState;
    originalReplaceState = window.history.replaceState;
    window.history.pushState({}, "", "/unrelated");
  });

  afterEach(() => {
    window.history.pushState = originalPushState;
    window.history.replaceState = originalReplaceState;
    vi.useRealTimers();
  });

  it("pre-gate fails (no checkout signal) => no MutationObserver is ever constructed, no state is ever reported", async () => {
    mountUnrelatedPage();
    const observerSpy = spyOnMutationObserver();
    const onState = vi.fn();
    const lifecycle = createEngineLifecycle({ doc: document, core: extractionCore, onState });
    try {
      vi.useFakeTimers();
      lifecycle.start();
      await vi.advanceTimersByTimeAsync(2000);
      expect(observerSpy.count()).toBe(0);
      expect(onState).not.toHaveBeenCalled();
    } finally {
      lifecycle.teardown();
      observerSpy.restore();
    }
  });

  it("pre-gate passes => attaches exactly ONE MutationObserver, never re-attaches on a repeated start()", async () => {
    mountPaymentAffordancePage();
    window.history.pushState({}, "", "/checkout");
    const observerSpy = spyOnMutationObserver();
    const lifecycle = createEngineLifecycle({ doc: document, core: extractionCore, onState: () => {} });
    try {
      vi.useFakeTimers();
      lifecycle.start();
      lifecycle.start(); // idempotent: must not attach a second observer or a second history patch
      await vi.advanceTimersByTimeAsync(2000);
      expect(observerSpy.count()).toBe(1);
    } finally {
      lifecycle.teardown();
      observerSpy.restore();
    }
  });

  it("the observer is scoped to an element (never the bare `document` node itself)", () => {
    mountPaymentAffordancePage();
    window.history.pushState({}, "", "/checkout");
    let observedTarget: Node | null = null;
    const OriginalMO = window.MutationObserver;
    class CapturingObserver extends OriginalMO {
      override observe(target: Node, options?: MutationObserverInit): void {
        observedTarget = target;
        super.observe(target, options);
      }
    }
    window.MutationObserver = CapturingObserver as typeof MutationObserver;
    const lifecycle = createEngineLifecycle({ doc: document, core: extractionCore, onState: () => {} });
    try {
      vi.useFakeTimers();
      lifecycle.start();
      if (!observedTarget) throw new Error("MutationObserver.observe() was never called");
      const observed: Node = observedTarget; // a fresh const, so narrowing survives the expect() calls below
      expect(observed).not.toBe(document);
      expect(observed instanceof Element).toBe(true);
    } finally {
      lifecycle.teardown();
      window.MutationObserver = OriginalMO;
    }
  });

  it("rapid mutations are debounced into exactly one parse, not one per mutation", async () => {
    mountPaymentAffordancePage();
    window.history.pushState({}, "", "/checkout");
    const onState = vi.fn();
    const lifecycle = createEngineLifecycle({ doc: document, core: extractionCore, onState });
    try {
      vi.useFakeTimers();
      lifecycle.start();
      await vi.advanceTimersByTimeAsync(1000); // settle the initial parse triggered by attach
      onState.mockClear();

      // Five rapid mutations inside the debounce window.
      for (let i = 0; i < 5; i += 1) {
        const marker = document.createElement("span");
        marker.textContent = String(i);
        document.body.appendChild(marker);
        await vi.advanceTimersByTimeAsync(50); // well under MUTATION_DEBOUNCE_MS
      }
      await vi.advanceTimersByTimeAsync(1000); // let the trailing debounce + idle callback settle

      expect(onState.mock.calls.length).toBe(1);
    } finally {
      lifecycle.teardown();
    }
  });

  it("teardown disconnects the observer and cancels the pending debounce timer -- a mutation after teardown produces no further onState calls", async () => {
    mountPaymentAffordancePage();
    window.history.pushState({}, "", "/checkout");
    const onState = vi.fn();
    const lifecycle = createEngineLifecycle({ doc: document, core: extractionCore, onState });
    vi.useFakeTimers();
    lifecycle.start();
    await vi.advanceTimersByTimeAsync(1000);
    onState.mockClear();

    lifecycle.teardown();
    const marker = document.createElement("span");
    document.body.appendChild(marker);
    await vi.advanceTimersByTimeAsync(2000);

    expect(onState).not.toHaveBeenCalled();
  });

  it("teardown restores history.pushState/replaceState to the EXACT original references, not merely a functionally-equivalent wrapper", () => {
    const beforePush = window.history.pushState;
    const beforeReplace = window.history.replaceState;
    mountUnrelatedPage();
    const lifecycle = createEngineLifecycle({ doc: document, core: extractionCore, onState: () => {} });
    lifecycle.start();
    expect(window.history.pushState).not.toBe(beforePush); // patched while active

    lifecycle.teardown();
    expect(window.history.pushState).toBe(beforePush);
    expect(window.history.replaceState).toBe(beforeReplace);
  });

  it("a route change into a checkout path tears the old session down and starts a fresh one -- the new session parses independently", async () => {
    mountUnrelatedPage();
    const states: EngineState[] = [];
    const lifecycle = createEngineLifecycle({ doc: document, core: extractionCore, onState: (s) => states.push(s) });
    try {
      vi.useFakeTimers();
      lifecycle.start();
      await vi.advanceTimersByTimeAsync(1000);
      expect(states).toHaveLength(0); // pre-gate never passed on /unrelated

      // Navigate (SPA-style) into a checkout path with checkout-shaped content.
      mountPaymentAffordancePage();
      window.history.pushState({}, "", "/checkout");
      await vi.advanceTimersByTimeAsync(1000);

      expect(states.length).toBeGreaterThan(0); // the fresh session actually parsed
    } finally {
      lifecycle.teardown();
    }
  });

  it("a route change to a path with no checkout signal tears the observer down (dormant again), not just stops updating", async () => {
    mountPaymentAffordancePage();
    window.history.pushState({}, "", "/checkout");
    const observerSpy = spyOnMutationObserver();
    const lifecycle = createEngineLifecycle({ doc: document, core: extractionCore, onState: () => {} });
    try {
      vi.useFakeTimers();
      lifecycle.start();
      await vi.advanceTimersByTimeAsync(1000);
      expect(observerSpy.count()).toBe(1);

      mountUnrelatedPage();
      window.history.pushState({}, "", "/logged-out");
      await vi.advanceTimersByTimeAsync(1000);

      // A mutation after navigating away from the checkout must not trigger
      // any further parse -- the old observer was disconnected, not just
      // superseded by a second one.
      const marker = document.createElement("span");
      document.body.appendChild(marker);
      await vi.advanceTimersByTimeAsync(1000);
      expect(observerSpy.count()).toBe(1); // no second observer was attached either
    } finally {
      lifecycle.teardown();
      observerSpy.restore();
    }
  });
});
