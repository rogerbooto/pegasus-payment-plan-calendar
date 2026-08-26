/**
 * Observation lifecycle: the cheap pre-gate, ONE MutationObserver
 * scoped to the anchor subtree (never `document`), debounced parsing, SPA
 * route-change handling, and full teardown. This module owns no page data
 * and writes nothing to the page -- it only reads (querySelector) and
 * observes (MutationObserver), and every observer/timer/history patch it
 * creates is reversed by `teardown()`.
 *
 * "Never `document`": when a winning adapter or the generic detector finds
 * a concrete anchor element, the observer watches that element's subtree.
 * When the pre-gate passes on the URL+probe signal alone but no anchor is
 * locatable yet (e.g. a still-rendering SPA), the observer watches
 * `document.body` as the narrowest available scope -- still not the
 * `document` node itself, and re-evaluated (and potentially narrowed) on
 * the next settled mutation batch once a real anchor appears.
 *
 * "Dormant" is not the same as "silent": when the pre-gate's structural
 * signal (path or adapter) fires but its affordance probe does not, this
 * module still reports one terminal `DEGRADED("unconfirmed")` state via
 * `onState` and attaches no observer at all -- see `evaluatePreGate`. That
 * split is deliberate: it is cheap to say something once, and expensive to
 * keep watching a page that may not even be a real checkout.
 */
import type { EngineState } from "../shared/types";
import type { AnchorSet, ExtractionCore } from "./types";
import { MUTATION_DEBOUNCE_MS } from "../shared/constants";
import { cheapPreGate, looksLikeCheckoutPath } from "./pre-gate";
import { selectAdapter } from "./registry";
import { createDomPageProbe } from "./dom-page-probe";
import { runEngine } from "./engine";
import { locateByCssOrLabel, locateInstalmentCluster, locateProviderWidget } from "./extraction-helpers";
import {
  GENERIC_INSTALLMENT_PHRASE_PATTERNS,
  GENERIC_ORDER_TOTAL_LABEL_LEXICON,
  GENERIC_PROVIDER_WIDGET_CSS,
  GENERIC_PROVIDER_WIDGET_IFRAME_ORIGINS,
} from "./generic-lexicon";

export interface EngineLifecycleController {
  /** Idempotent: calling start() twice does not attach a second observer or a second history patch. */
  start(): void;
  /** Full teardown: disconnects the observer, cancels timers, restores history, drops references. */
  teardown(): void;
}

export interface EngineLifecycleDeps {
  readonly doc: Document;
  readonly core: ExtractionCore;
  readonly onState: (state: EngineState) => void;
}

type IdleCallbackWindow = Window & {
  requestIdleCallback?: (cb: () => void) => number;
  cancelIdleCallback?: (handle: number) => void;
};

export function createEngineLifecycle(deps: EngineLifecycleDeps): EngineLifecycleController {
  const win = deps.doc.defaultView as IdleCallbackWindow | null;

  let observer: MutationObserver | null = null;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let idleHandle: number | null = null;
  let observing = false;
  let started = false;
  let lastPath = win?.location.pathname ?? "";
  let popstateHandler: (() => void) | null = null;
  let originalPushState: History["pushState"] | null = null;
  let originalReplaceState: History["replaceState"] | null = null;

  function scheduleIdle(cb: () => void): void {
    if (!win) {
      cb();
      return;
    }
    const schedule = win.requestIdleCallback ?? ((c: () => void) => win.setTimeout(c, 0) as unknown as number);
    idleHandle = schedule(() => {
      idleHandle = null;
      cb();
    });
  }

  function cancelIdle(): void {
    if (idleHandle === null || !win) return;
    const cancel = win.cancelIdleCallback ?? ((h: number) => win.clearTimeout(h));
    cancel(idleHandle);
    idleHandle = null;
  }

  function runParseOnce(): void {
    const page = createDomPageProbe(deps.doc);
    deps.onState(runEngine(page, deps.core));
  }

  function scheduleParse(): void {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      scheduleIdle(runParseOnce);
    }, MUTATION_DEBOUNCE_MS);
  }

  function pickAnchorSubtree(): Element {
    const page = createDomPageProbe(deps.doc);
    const adapter = selectAdapter(page);
    let anchors: AnchorSet | null = null;
    if (adapter) {
      try {
        anchors = adapter.locate(page);
      } catch {
        anchors = null;
      }
    } else {
      // No platform adapter covers this host -- try the generic detector's
      // OWN anchors before giving up. This keeps "never document" a real
      // narrowing, not just "never the document node while still watching
      // the whole body", for the common no-adapter-matched case.
      const totalEl = locateByCssOrLabel(page, [], GENERIC_ORDER_TOTAL_LABEL_LEXICON)?.element ?? null;
      const clusterEl = locateInstalmentCluster(page, GENERIC_INSTALLMENT_PHRASE_PATTERNS)?.element ?? null;
      const widgetEl = locateProviderWidget(page, GENERIC_PROVIDER_WIDGET_CSS, GENERIC_PROVIDER_WIDGET_IFRAME_ORIGINS);
      if (totalEl || clusterEl || widgetEl) {
        anchors = { orderTotal: totalEl, installmentCluster: clusterEl, providerWidget: widgetEl };
      }
    }
    const found = anchors?.orderTotal ?? anchors?.installmentCluster ?? anchors?.providerWidget ?? null;
    return found ?? deps.doc.body;
  }

  function attachObserver(): void {
    if (observing) return; // one observer per session, never more
    const anchor = pickAnchorSubtree();
    observer = new MutationObserver(() => scheduleParse());
    observer.observe(anchor, { childList: true, characterData: true, subtree: true });
    observing = true;
    scheduleParse(); // parse the already-settled anchor once, debounced/idle like any other tick
  }

  function detachObserver(): void {
    observer?.disconnect();
    observer = null;
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    cancelIdle();
    observing = false;
  }

  function evaluatePreGate(): void {
    const page = createDomPageProbe(deps.doc);
    if (cheapPreGate(page)) {
      attachObserver();
      return;
    }
    detachObserver(); // dormant either way below: no observer, no timers

    // The observer stays off (see pre-gate.ts on why: several path patterns
    // are loose substrings, and this codebase will not pay for continuous
    // DOM observation on every page that merely contains one). But total
    // silence is not an acceptable fallback: if the path/adapter signal
    // says this looks like a checkout, that is worth saying once, even
    // without the affordance confirmation the observer path requires.
    // This never fires twice for the same session -- evaluatePreGate runs
    // exactly once per start() and once per route change.
    if (looksLikeCheckoutPath(page)) {
      deps.onState({ kind: "DEGRADED", reason: "unconfirmed" });
    }
  }

  function onRouteChange(): void {
    const path = win?.location.pathname ?? "";
    if (path === lastPath) return;
    lastPath = path;
    // Each checkout session is a fresh engine instance -- no candidate
    // state survives navigation.
    detachObserver();
    evaluatePreGate();
  }

  return {
    start() {
      if (started || !win) return;
      started = true;
      evaluatePreGate();

      popstateHandler = () => onRouteChange();
      win.addEventListener("popstate", popstateHandler);

      // Keep the literal, UNBOUND original function references (not
      // `.bind()`'d copies) so teardown() restores exact reference
      // identity, not merely a functionally-equivalent wrapper.
      originalPushState = win.history.pushState;
      originalReplaceState = win.history.replaceState;
      win.history.pushState = function (this: History, ...args: Parameters<History["pushState"]>) {
        const result = originalPushState?.apply(this, args);
        onRouteChange();
        return result;
      } as History["pushState"];
      win.history.replaceState = function (this: History, ...args: Parameters<History["replaceState"]>) {
        const result = originalReplaceState?.apply(this, args);
        onRouteChange();
        return result;
      } as History["replaceState"];
    },
    teardown() {
      detachObserver();
      if (win && popstateHandler) {
        win.removeEventListener("popstate", popstateHandler);
        popstateHandler = null;
      }
      if (win && originalPushState) {
        win.history.pushState = originalPushState;
        originalPushState = null;
      }
      if (win && originalReplaceState) {
        win.history.replaceState = originalReplaceState;
        originalReplaceState = null;
      }
      started = false;
    },
  };
}
