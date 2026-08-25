/**
 * The impact / next-30-days engine. Pure functions over user-confirmed
 * plans: given the plan being considered and the plans already saved, it
 * derives the dated payment rows, the same-day clusters, and the 30-day
 * totals. All arithmetic is integer cents end-to-end; nothing in this module
 * formats money (that is src/shared/format.ts, at render only).
 *
 * Inputs cross the assertCents seam on entry: a non-integer money value
 * throws before any computation happens.
 */
import { assertPositiveCents, type Cents } from "../shared/money";
import { NotImplementedError } from "../shared/errors";
import type { IsoDate, PaymentPlanRecord } from "../shared/types";

export interface DatedPayment {
  readonly date: IsoDate;
  readonly amountCents: Cents;
}

/** Existing payments that fall on the same day as one of the new plan's. */
export interface SameDayCluster {
  readonly date: IsoDate;
  readonly existingCount: number;
  readonly existingTotalCents: Cents;
}

export interface DayEntry {
  readonly date: IsoDate;
  readonly payments: readonly DatedPayment[];
  readonly dayTotalCents: Cents;
}

export interface Next30Days {
  readonly days: readonly DayEntry[];
  readonly totalCents: Cents;
}

export interface ImpactView {
  /** The dated rows for the plan under consideration. */
  readonly planPayments: readonly DatedPayment[];
  /** Rendered only when non-empty. */
  readonly sameDayClusters: readonly SameDayCluster[];
  readonly next30Days: Next30Days;
}

/**
 * Derives the payment dates of a plan from its first payment date, cadence
 * and count.
 */
export function paymentDates(_plan: PaymentPlanRecord): readonly IsoDate[] {
  throw new NotImplementedError("impact/engine#paymentDates");
}

/**
 * Computes the impact view for a plan against the already-saved plans.
 * Totals never include an unconfirmed plan: `plan` here is always a
 * user-confirmed record — the type system offers no path from an engine
 * candidate to this function without passing the confirmation flow.
 */
export function computeImpact(
  plan: PaymentPlanRecord,
  existing: readonly PaymentPlanRecord[],
  _today: IsoDate,
): ImpactView {
  assertPositiveCents(plan.orderTotalCents, "plan.orderTotalCents");
  assertPositiveCents(plan.perInstallmentCents, "plan.perInstallmentCents");
  for (const p of existing) {
    assertPositiveCents(p.perInstallmentCents, "existing.perInstallmentCents");
  }
  throw new NotImplementedError("impact/engine#computeImpact");
}
