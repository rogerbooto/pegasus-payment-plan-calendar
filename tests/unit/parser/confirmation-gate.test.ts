// @vitest-environment jsdom
/**
 * T01 (Critical) — no scraped scalar reaches the impact engine or
 * storage without a mandatory user confirmation, enforced structurally:
 * `ConfirmedPlanInput` is a distinct branded type producible only by
 * `confirmPlan({ confirmed: true, ... })`. This file proves both halves:
 *
 * (a) the type-level gate — a bare engine candidate, or `confirmed: false`,
 *     is a COMPILE error (`@ts-expect-error`), not a runtime branch someone
 *     could route around;
 * (b) the runtime gate — `computeImpact` throws if the plan under
 *     consideration disagrees with what was confirmed, and the "friendlier
 *     number" a merchant renders never reaches the engine unless a human
 *     explicitly confirmed exactly that number.
 *
 * T05 lives in this file too: the stored/computed value is the exact
 * snapshot the user confirmed, proven against a DOM node that mutates
 * after the snapshot is taken.
 */
import { describe, expect, it } from "vitest";
import { computeImpact } from "../../../src/impact/engine";
import { buildConfirmedPlanRecord, confirmPlan, type ConfirmedPlanInput } from "../../../src/parser/confirmation";
import { parseMoneyToCents } from "../../../src/parser/money";
import { assertCents } from "../../../src/shared/money";
import { ConfirmationError } from "../../../src/shared/errors";
import type { PaymentPlanRecord, ScheduleCandidate } from "../../../src/shared/types";
import { loadFixtureSidecar, mountFixture } from "../../support/dom-fixture";

function buildRecord(confirmed: ConfirmedPlanInput, overrides: Partial<PaymentPlanRecord> = {}): PaymentPlanRecord {
  return {
    ...buildConfirmedPlanRecord(confirmed, {
      id: "a1b2c3",
      createdAt: "2026-08-24",
      firstPaymentDate: "2026-09-01",
    }),
    ...overrides,
  };
}

/**
 * These two functions are declared but NEVER CALLED. `tsc --noEmit` still
 * type-checks every function body in an included file regardless of
 * whether it is invoked, so the `@ts-expect-error` comments below are real
 * compile-time proof — but calling them would also execute the (deliberately
 * invalid) runtime call, which is not what this test is proving. Referenced
 * via `typeof` in the `it()` blocks below so they aren't dead code by
 * lint's reckoning either.
 */
function confirmPlanRejectsUnconfirmedAtCompileTime(): void {
  // @ts-expect-error — `confirmed` only typechecks as the literal `true`.
  // If this stops erroring, the T01 type gate has been silently widened.
  confirmPlan({ confirmed: false, values: {} as never });
}

function computeImpactRejectsBareCandidateAtCompileTime(candidate: ScheduleCandidate): void {
  // @ts-expect-error — ScheduleCandidate carries `confidence`, which
  // ConfirmedPlanInput must never accept; it is not brand-compatible. If
  // this stops erroring, the confirmation brand has been bypassed.
  computeImpact({} as PaymentPlanRecord, candidate, [], "2026-01-01");
}

describe("T01 — the type-level gate is a compile error, not a runtime branch", () => {
  it("confirmPlan rejects confirmed: false at compile time (see the @ts-expect-error above)", () => {
    expect(typeof confirmPlanRejectsUnconfirmedAtCompileTime).toBe("function");
  });

  it("a bare ScheduleCandidate can never satisfy computeImpact's confirmation parameter (see the @ts-expect-error above)", () => {
    expect(typeof computeImpactRejectsBareCandidateAtCompileTime).toBe("function");
  });
});

describe("T01 — the runtime gate: computeImpact only ever reflects a confirmed value", () => {
  it("throws ConfirmationError when the plan under consideration disagrees with what was confirmed", () => {
    const confirmed = confirmPlan({
      confirmed: true,
      values: {
        orderTotalCents: assertCents(8996, "total"),
        installmentCount: 4,
        cadence: "BIWEEKLY",
        perInstallmentCents: assertCents(2249, "per"),
        currency: "CAD",
      },
    });
    // A tampered plan claiming a smaller total than what was confirmed.
    const tamperedPlan = buildRecord(confirmed, { orderTotalCents: assertCents(1000, "tampered") });
    expect(() => computeImpact(tamperedPlan, confirmed, [], "2026-01-01")).toThrow(ConfirmationError);
  });

  it("a friendlier per-month figure shown on the page never reaches the engine unless confirmed as the real total", () => {
    const doc = mountFixture("friendlier-number", "per-month-shown-as-plan-total");
    const sidecar = loadFixtureSidecar<{ realOrderTotalCents: number; perInstallmentCents: number; installmentCount: number }>(
      "friendlier-number",
      "per-month-shown-as-plan-total",);
    const heroText = doc.getElementById("hero")?.textContent ?? "";
    const heroParsed = parseMoneyToCents(heroText.replace("Only ", "").replace(" today!", ""));
    // The hero figure IS the per-installment amount, not the order total —
    // exactly the T01 attack shape. Parsing it never, by itself, produces a
    // record; only an explicit confirmation of the REAL total does.
    expect(heroParsed.kind).toBe("parsed");
    if (heroParsed.kind === "parsed") expect(heroParsed.cents).toBe(sidecar.perInstallmentCents);

    const confirmed = confirmPlan({
      confirmed: true,
      values: {
        orderTotalCents: assertCents(sidecar.realOrderTotalCents, "total"),
        installmentCount: sidecar.installmentCount,
        cadence: "BIWEEKLY",
        perInstallmentCents: assertCents(sidecar.perInstallmentCents, "per"),
        currency: "CAD",
      },
    });
    const record = buildRecord(confirmed);
    const view = computeImpact(record, confirmed, [], "2026-01-01");
    expect(view.planPayments[0]?.amountCents).toBe(sidecar.perInstallmentCents);
    // The real order total, never the flattering hero figure, is what was confirmed.
    expect(confirmed.orderTotalCents).toBe(sidecar.realOrderTotalCents);
  });
});

describe("T05 — the confirmed value is a snapshot, never re-read from a mutated DOM", () => {
  it("a post-confirmation DOM mutation does not change the stored/computed value", () => {
    const doc = mountFixture("post-confirm-mutation", "price-node-mutates-after-parse");
    const sidecar = loadFixtureSidecar<{ snapshotText: string; mutatedText: string }>(
      "post-confirm-mutation",
      "price-node-mutates-after-parse",);
    const node = doc.getElementById("total");
    if (!node) throw new Error("fixture drift: expected #total node");
    expect(node.textContent).toBe(sidecar.snapshotText);

    // The snapshot is taken ONCE, before confirmation, and never re-read.
    const snapshot = parseMoneyToCents(node.textContent ?? "");
    expect(snapshot.kind).toBe("parsed");
    if (snapshot.kind !== "parsed") return;

    const confirmed = confirmPlan({
      confirmed: true,
      values: {
        orderTotalCents: snapshot.cents,
        installmentCount: 4,
        cadence: "BIWEEKLY",
        perInstallmentCents: assertCents(Math.trunc(snapshot.cents / 4), "per"),
        currency: snapshot.currency,
      },
    });

    // The setup assertion: the mutation must actually change the source
    // value (a lazy fixture whose mutation is a no-op would vacuously pass).
    function mutatePriceNode(el: Element): void {
      el.textContent = sidecar.mutatedText;
    }
    mutatePriceNode(node);
    expect(node.textContent).not.toBe(sidecar.snapshotText);
    const mutatedParsed = parseMoneyToCents(node.textContent ?? "");
    expect(mutatedParsed.kind).toBe("parsed");
    if (mutatedParsed.kind === "parsed") expect(mutatedParsed.cents).not.toBe(snapshot.cents);

    // confirmPlan/buildConfirmedPlanRecord never touch the DOM — the record
    // still carries the ORIGINAL snapshot, unaffected by the mutation above.
    const record = buildRecord(confirmed);
    expect(record.orderTotalCents).toBe(snapshot.cents);
    expect(record.orderTotalCents).not.toBe(mutatedParsed.kind === "parsed" ? mutatedParsed.cents : null);
  });
});
