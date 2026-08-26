/**
 * The impact / next-30-days engine. Pure functions over user-confirmed
 * plans: given the plan being considered and the plans already saved, it
 * derives the dated payment rows, the same-day clusters, and the 30-day
 * totals. All arithmetic is integer cents end-to-end; nothing in this module
 * formats money (that is src/shared/format.ts, at render only).
 *
 * Inputs cross the assertCents seam on entry: a non-integer money value
 * throws before any computation happens. `computeImpact` additionally
 * requires a `ConfirmedPlanInput` (src/parser/confirmation.ts) alongside the
 * plan under consideration and throws `ConfirmationError` if the plan's
 * four scalars do not exactly match what the user confirmed — the T01
 * gate's second half ("the confirmed values are the ones the user saw"),
 * enforced here as a runtime check because `ConfirmedPlanInput` alone
 * cannot carry the plan's id/createdAt/firstPaymentDate needed for the
 * date math below.
 *
 * Dates: IsoDate is a zero-padded "YYYY-MM-DD" string, so chronological
 * order is exactly lexicographic string order — no Date-object comparison
 * is needed anywhere below. All calendar arithmetic is UTC-anchored
 * (Date.UTC / getUTC*), which makes it timezone-free by construction: this
 * module reasons about calendar dates, never moments in time, so there is
 * no "local timezone" to be wrong about. Monthly cadence clamps to the
 * target month's last day (Jan 31 + 1 month -> Feb 28/29, not Mar 2/3, the
 * native `Date` rollover) and is computed fresh from the first payment date
 * each time, not by compounding the previous month's clamped date, so a
 * plan starting Jan 31 lands on Mar 31 (not a drifted Mar 28).
 */
import { addCents, assertPositiveCents, type Cents, ZERO_CENTS } from "../shared/money";
import { ConfirmationError } from "../shared/errors";
import type { Cadence, IsoDate, PaymentPlanRecord } from "../shared/types";
import type { ConfirmedPlanInput } from "../parser/confirmation";

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
  /** Earliest payment of the plan under consideration that falls beyond the 30-day window, if any. */
  readonly planPaymentBeyondWindow: IsoDate | null;
}

export interface ImpactView {
  /** The dated rows for the plan under consideration. */
  readonly planPayments: readonly DatedPayment[];
  /** Rendered only when non-empty. */
  readonly sameDayClusters: readonly SameDayCluster[];
  readonly next30Days: Next30Days;
}

interface DateParts {
  readonly y: number;
  readonly m: number; // 1-12
  readonly d: number;
}

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseIsoDate(date: IsoDate): DateParts {
  const match = ISO_DATE_PATTERN.exec(date);
  if (!match) throw new Error(`impact/engine: invalid ISO date "${date}"`);
  const [, y, m, d] = match as unknown as [string, string, string, string];
  return { y: parseInt(y, 10), m: parseInt(m, 10), d: parseInt(d, 10) };
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function formatIsoDate(p: DateParts): IsoDate {
  return `${String(p.y).padStart(4, "0")}-${pad2(p.m)}-${pad2(p.d)}`;
}

/** Days in a given proleptic-Gregorian month, computed UTC-anchored (timezone-free). */
function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Adds whole calendar days. UTC-anchored throughout: no timezone dependency. */
function addDays(p: DateParts, days: number): DateParts {
  const dt = new Date(Date.UTC(p.y, p.m - 1, p.d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

/**
 * Adds whole calendar months, clamping the day to the target month's last
 * day instead of letting the native Date roll extra days into the next
 * month. Always computed from the ORIGINAL date + n months, never by
 * compounding one month at a time, so a run of monthly payments starting
 * on the 31st does not drift onto ever-earlier days.
 */
function addMonthsClamped(p: DateParts, months: number): DateParts {
  const totalMonths = p.y * 12 + (p.m - 1) + months;
  const y = Math.trunc(totalMonths / 12);
  const m = ((totalMonths % 12) + 12) % 12 + 1;
  const d = Math.min(p.d, daysInMonth(y, m));
  return { y, m, d };
}

function stepDate(first: DateParts, cadence: Cadence, installmentIndex: number): DateParts {
  switch (cadence) {
    case "WEEKLY":
      return addDays(first, 7 * installmentIndex);
    case "BIWEEKLY":
      return addDays(first, 14 * installmentIndex);
    case "MONTHLY":
      return addMonthsClamped(first, installmentIndex);
  }
}

/**
 * Derives the payment dates of a plan from its first payment date, cadence
 * and count. Each date is computed independently from the first payment
 * date (installmentIndex steps applied once), never by compounding the
 * previous date, which is what keeps monthly month-end clamping stable.
 */
export function paymentDates(plan: PaymentPlanRecord): readonly IsoDate[] {
  const first = parseIsoDate(plan.firstPaymentDate);
  const dates: IsoDate[] = [];
  for (let i = 0; i < plan.installmentCount; i++) {
    dates.push(formatIsoDate(stepDate(first, plan.cadence, i)));
  }
  return dates;
}

function addDaysToIso(date: IsoDate, days: number): IsoDate {
  return formatIsoDate(addDays(parseIsoDate(date), days));
}

/** T01's second half: the plan reaching this engine must equal what the user confirmed. */
function assertConfirmationMatchesPlan(plan: PaymentPlanRecord, confirmation: ConfirmedPlanInput): void {
  if (
    plan.currency !== confirmation.currency ||
    plan.orderTotalCents !== confirmation.orderTotalCents ||
    plan.installmentCount !== confirmation.installmentCount ||
    plan.cadence !== confirmation.cadence ||
    plan.perInstallmentCents !== confirmation.perInstallmentCents) {
    throw new ConfirmationError(
      "plan under consideration does not match the values the user confirmed",);
  }
}

/**
 * Computes the impact view for a plan against the already-saved plans.
 * Totals never include an unconfirmed plan: `plan` must be accompanied by
 * `confirmation`, a `ConfirmedPlanInput` obtainable only via
 * src/parser/confirmation.ts#confirmPlan — there is no path from a bare
 * engine candidate to this function without passing the confirmation gate,
 * and a `plan` whose scalars disagree with `confirmation` throws rather
 * than silently computing.
 */
export function computeImpact(
  plan: PaymentPlanRecord,
  confirmation: ConfirmedPlanInput,
  existing: readonly PaymentPlanRecord[],
  today: IsoDate,): ImpactView {
  assertConfirmationMatchesPlan(plan, confirmation);
  assertPositiveCents(plan.orderTotalCents, "plan.orderTotalCents");
  assertPositiveCents(plan.perInstallmentCents, "plan.perInstallmentCents");
  for (const p of existing) {
    assertPositiveCents(p.perInstallmentCents, "existing.perInstallmentCents");
  }

  const planDates = paymentDates(plan);
  const planPayments: readonly DatedPayment[] = planDates.map((date) => ({
    date,
    amountCents: plan.perInstallmentCents,
  }));

  const existingByDate = new Map<IsoDate, DatedPayment[]>();
  for (const existingPlan of existing) {
    for (const date of paymentDates(existingPlan)) {
      const list = existingByDate.get(date) ?? [];
      list.push({ date, amountCents: existingPlan.perInstallmentCents });
      existingByDate.set(date, list);
    }
  }

  const sameDayClusters: SameDayCluster[] = [];
  for (const date of planDates) {
    const collisions = existingByDate.get(date);
    if (collisions && collisions.length > 0) {
      const existingTotalCents = collisions.reduce(
        (sum, c) => addCents(sum, c.amountCents),
        ZERO_CENTS,);
      sameDayClusters.push({ date, existingCount: collisions.length, existingTotalCents });
    }
  }

  const windowStart = today;
  const windowEnd = addDaysToIso(today, 29); // 30 calendar days inclusive of today

  const days: DayEntry[] = [...existingByDate.entries()]
    .filter(([date]) => date >= windowStart && date <= windowEnd)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, payments]) => ({
      date,
      payments,
      dayTotalCents: payments.reduce((sum, p) => addCents(sum, p.amountCents), ZERO_CENTS),
    }));
  const totalCents = days.reduce((sum, day) => addCents(sum, day.dayTotalCents), ZERO_CENTS);

  const planPaymentBeyondWindow = planDates.find((date) => date > windowEnd) ?? null;

  return {
    planPayments,
    sameDayClusters,
    next30Days: { days, totalCents, planPaymentBeyondWindow },
  };
}
