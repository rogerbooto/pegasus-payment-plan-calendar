/**
 * @vitest-environment jsdom
 *
 * Invariant #9 (standing, not a single per-finding regression): the
 * mission's one named worst failure mode never occurs — no scalar reaches
 * a "this is a confirmable number" render unless the engine's own terminal
 * state is `PARSED_CONFIRMABLE`. A `DEGRADED` or `PARTIAL` state must be
 * structurally incapable of rendering through the numeric-confirmation
 * screen (ConfirmationSheet + its "Check the numbers" trigger), even
 * though `OverlayHost.mount()` accepts all three EngineState kinds through
 * one function.
 *
 * Each test asserts the SPECIFIC path taken (which screen rendered, which
 * button/copy exists, which does not) — not merely "something rendered" —
 * per this task's standard: a test only counts if it turns RED when the
 * routing it protects is removed.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createOverlayHost, OVERLAY_HOST_TAG } from "../../../src/overlay/OverlayHost";
import { PlanLedger } from "../../../src/storage/ledger";
import { createFakeStore } from "./test-helpers";
import type { EngineState } from "../../../src/shared/types";
import { assertCents } from "../../../src/shared/money";
import * as copy from "../../../src/overlay/copy";

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

beforeEach(() => {
  document.body.replaceChildren();
  document.head.replaceChildren();
});

function getShadow(): ShadowRoot {
  const host = document.body.querySelector(OVERLAY_HOST_TAG);
  if (!host) throw new Error("overlay host not mounted");
  const shadow = capturedShadowRoots.get(host);
  if (!shadow) throw new Error("shadow root was not captured for this host");
  return shadow;
}

function makeDeps() {
  const store = createFakeStore();
  const ledger = new PlanLedger(store);
  return { store, ledger, today: () => "2026-06-01" };
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("OverlayHost — DEGRADED never reaches the numeric-confirmation screen (Invariant #9)", () => {
  it("renders NOT_RECOGNIZED copy and the manual-add action, never the confirmable hero/Check-the-numbers path", async () => {
    const controller = createOverlayHost(document, makeDeps());
    controller.mount({ kind: "DEGRADED", reason: "no_match" });
    await flush();
    const shadow = getShadow();

    // The specific path: NOT_RECOGNIZED copy is present.
    expect(shadow.textContent).toContain(copy.NOT_RECOGNIZED);
    // The specific absence: the confirmable-path action ("Check the
    // numbers") never renders for a DEGRADED state — RED if the dispatch
    // in populateBody() ever routes DEGRADED into renderImpactScreen or
    // renderConfirm instead of renderNotRecognized.
    expect([...shadow.querySelectorAll("button")].some((b) => b.textContent === copy.ACTION_CHECK)).toBe(false);
    // And structurally: no numeric confirmation form (the four scalar
    // fields) exists anywhere in this render.
    expect(shadow.querySelector("#ppc-f-total")).toBeNull();
    expect(shadow.querySelector("#ppc-f-count")).toBeNull();
    expect(shadow.querySelector("#ppc-f-cadence")).toBeNull();
    expect(shadow.querySelector("#ppc-f-each")).toBeNull();
  });

  it("the only action offered from a DEGRADED state routes to manual entry, never to a pre-filled numeric confirmation of unverified scalars", async () => {
    const controller = createOverlayHost(document, makeDeps());
    controller.mount({ kind: "DEGRADED", reason: "gate_failed" as never });
    await flush();
    let shadow = getShadow();

    const addBtn = [...shadow.querySelectorAll("button")].find((b) => b.textContent === copy.ACTION_ADD) as HTMLButtonElement;
    expect(addBtn).not.toBeNull();
    addBtn.click();
    await flush();

    shadow = getShadow();
    // Manual entry with NO prefill (DEGRADED carries no candidate at all —
    // there is nothing to prefill from). RED if a DEGRADED reason is ever
    // threaded into a prefilled/confirmable form instead of a blank one.
    expect(shadow.querySelector("h3")?.textContent).toBe("Add a plan");
    // The specific guard: every scalar field is honestly marked "not found
    // on this page" — none is silently pre-filled with a guessed value.
    // RED if DEGRADED is ever routed with a non-empty prefill object.
    const totalInput = shadow.querySelector("#ppc-f-total") as HTMLInputElement;
    expect(totalInput.value).toBe("");
    expect(totalInput.closest(".field")?.className).toContain("field--missing");
    expect(shadow.querySelectorAll(".field--missing").length).toBeGreaterThanOrEqual(3);
  });

  it.each(["no_match", "adapter_error"] as const)(
    "reason %s degrades identically — the reason never leaks into a different (more confident) render path",
    async (reason) => {
      const controller = createOverlayHost(document, makeDeps());
      controller.mount({ kind: "DEGRADED", reason });
      await flush();
      const shadow = getShadow();
      expect(shadow.textContent).toContain(copy.NOT_RECOGNIZED);
      expect([...shadow.querySelectorAll("button")].some((b) => b.textContent === copy.ACTION_CHECK)).toBe(false);
    },
  );
});

describe("OverlayHost — PARTIAL never reaches the numeric-confirmation screen either (Invariant #9)", () => {
  it("routes directly to the manual/prefill form, never to ConfirmationSheet's 'Check the numbers' confirmable path", async () => {
    const controller = createOverlayHost(document, makeDeps());
    const partial: EngineState = {
      kind: "PARTIAL",
      candidate: {
        orderTotalCents: assertCents(19600, "total"),
        installmentCount: 4,
        confidence: { hardGatesPassed: false, softScore: 0, signals: [] },
      },
      missing: ["cadence"],
    };
    controller.mount(partial);
    await flush();
    const shadow = getShadow();

    // The specific path: the PARTIAL lead-in copy renders (proves this went
    // through renderManualEntrySheet's prefill branch).
    expect(shadow.textContent).toContain(copy.FORM_PARTIAL_LEAD);
    // The specific absence: no "Check the numbers" trigger exists — that
    // control only exists on the fully-confirmable path (T01's gate).
    expect([...shadow.querySelectorAll("button")].some((b) => b.textContent === copy.ACTION_CHECK)).toBe(false);

    // The missing scalar is visibly marked missing, not silently filled in
    // as if it had been read from the page.
    const cadenceField = shadow.querySelector("#ppc-f-cadence")?.closest(".field");
    expect(cadenceField?.className).toContain("field--missing");
    // The present scalar carries a value the user can still see/edit —
    // never pre-submitted or confirmed on the user's behalf.
    const totalInput = shadow.querySelector("#ppc-f-total") as HTMLInputElement;
    expect(totalInput.value).not.toBe("");
    // Structural: it is a genuine <form> requiring explicit submit, not an
    // auto-applied value — no confirmed record exists until the user
    // submits, and no submit has happened here.
    expect(shadow.querySelector("form")).not.toBeNull();
  });

  it("a PARTIAL candidate's unconfirmed scalars never appear rendered as a plan's confirmed impact (no hero/date list from a partial candidate)", async () => {
    const controller = createOverlayHost(document, makeDeps());
    controller.mount({
      kind: "PARTIAL",
      candidate: { orderTotalCents: assertCents(19600, "total"), confidence: { hardGatesPassed: false, softScore: 0, signals: [] } },
      missing: ["installmentCount", "cadence", "perInstallment"],
    });
    await flush();
    const shadow = getShadow();
    // RED if a PARTIAL candidate is ever routed into renderImpactHero
    // (which requires a full ScheduleCandidate) instead of the manual form.
    expect(shadow.querySelector(".hero")).toBeNull();
    expect(shadow.querySelector(".rows")).toBeNull();
  });
});
