/**
 * The mandatory confirmation gate — D3 finding T01, the Critical one.
 *
 * No scraped scalar reaches the impact engine or storage without having
 * passed a mandatory user confirmation. This is enforced structurally, not
 * conventionally: `ConfirmedPlanInput` is a branded type, and `confirmPlan`
 * below is the ONLY function in this codebase that can produce one. A
 * `ScheduleCandidate`/`PartialCandidate` (engine output, pre-confirmation)
 * is a structurally different shape — it cannot satisfy `ConfirmedPlanInput`
 * or `ConfirmedPlanValues` by assignment. Fabricating a `ConfirmedPlanInput`
 * without calling `confirmPlan` requires an explicit, greppable `as`
 * assertion past the type checker — a visible act of bypassing a gate,
 * never an ordinary function call. This mirrors the `Cents` brand in
 * src/shared/money.ts exactly.
 *
 * `confirmPlan`'s `confirmed` argument has the literal type `true` — passing
 * `confirmed: false` (or an unconfirmed boolean) is a compile error, not a
 * runtime branch, which is what makes "the engine cannot accept unconfirmed
 * input" true at the type level rather than by convention.
 *
 * T05 (no DOM re-read after confirmation): `ConfirmPlanArgs` contains no
 * DOM/Element/Node types anywhere in its shape — confirmPlan takes only
 * plain numbers/strings, so by construction it cannot re-read a page node.
 * The values it returns are the exact snapshot the caller passed in.
 */
import type { Cents } from "../shared/money";
import { assertPositiveCents } from "../shared/money";
import { MoneyError } from "../shared/errors";
import { INSTALLMENT_COUNT_MAX, INSTALLMENT_COUNT_MIN } from "../shared/constants";
import type { Cadence, Currency, PaymentPlanRecord, PlanSource } from "../shared/types";

declare const confirmedBrand: unique symbol;

export interface ConfirmedPlanValues {
  readonly orderTotalCents: Cents;
  readonly installmentCount: number;
  readonly cadence: Cadence;
  readonly perInstallmentCents: Cents;
  readonly currency: Currency;
}

/**
 * Produced only by confirmPlan(). The impact engine's "plan under
 * consideration" parameter and the checkout-confirmed record builder below
 * accept nothing else.
 */
export type ConfirmedPlanInput = ConfirmedPlanValues & { readonly [confirmedBrand]: "user-confirmed" };

export interface ConfirmPlanArgs {
  /** No default, no optional form: only the literal `true` typechecks. */
  readonly confirmed: true;
  /** The values the user confirmed — exactly what was shown, or their edit. */
  readonly values: ConfirmedPlanValues;
}

const CADENCES: readonly Cadence[] = ["WEEKLY", "BIWEEKLY", "MONTHLY"];
const CURRENCIES: readonly Currency[] = ["CAD", "USD"];

/**
 * The single constructor for ConfirmedPlanInput. Confirmation can edit a
 * number; it can never launder an invalid one through — every field is
 * re-validated here regardless of what the (untrusted, out-of-scope) UI
 * layer already checked.
 */
export function confirmPlan(args: ConfirmPlanArgs): ConfirmedPlanInput {
  const { values } = args;
  assertPositiveCents(values.orderTotalCents, "values.orderTotalCents");
  assertPositiveCents(values.perInstallmentCents, "values.perInstallmentCents");
  if (
    !Number.isSafeInteger(values.installmentCount) ||
    values.installmentCount < INSTALLMENT_COUNT_MIN ||
    values.installmentCount > INSTALLMENT_COUNT_MAX
  ) {
    throw new MoneyError(
      `values.installmentCount must be an integer between ${INSTALLMENT_COUNT_MIN} and ${INSTALLMENT_COUNT_MAX}`,
    );
  }
  if (!CADENCES.includes(values.cadence)) {
    throw new MoneyError("values.cadence must be WEEKLY, BIWEEKLY or MONTHLY");
  }
  if (!CURRENCIES.includes(values.currency)) {
    throw new MoneyError("values.currency must be CAD or USD");
  }
  return {
    orderTotalCents: values.orderTotalCents,
    installmentCount: values.installmentCount,
    cadence: values.cadence,
    perInstallmentCents: values.perInstallmentCents,
    currency: values.currency,
  } as ConfirmedPlanInput;
}

export interface ConfirmedPlanMeta {
  readonly id: string;
  readonly createdAt: string;
  readonly firstPaymentDate: string;
}

/**
 * The only sanctioned way to build a `source: "checkout_confirmed"` ledger
 * record: it requires a `ConfirmedPlanInput`, which requires `confirmPlan`,
 * which requires the literal `confirmed: true`. There is no code path from
 * a bare `ScheduleCandidate` to a storable record that skips this file.
 */
export function buildConfirmedPlanRecord(
  confirmed: ConfirmedPlanInput,
  meta: ConfirmedPlanMeta,
): PaymentPlanRecord {
  const source: PlanSource = "checkout_confirmed";
  return {
    id: meta.id,
    createdAt: meta.createdAt,
    source,
    currency: confirmed.currency,
    orderTotalCents: confirmed.orderTotalCents,
    installmentCount: confirmed.installmentCount,
    cadence: confirmed.cadence,
    perInstallmentCents: confirmed.perInstallmentCents,
    firstPaymentDate: meta.firstPaymentDate,
  };
}
