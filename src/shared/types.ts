/**
 * Shared domain types. Every module seam (engine, parser, storage, impact,
 * overlay, telemetry) speaks these types; none defines its own copies.
 */
import type { Cents } from "./money";

export type Currency = "CAD" | "USD";
export type Cadence = "WEEKLY" | "BIWEEKLY" | "MONTHLY";

/** Calendar date as an ISO `YYYY-MM-DD` string (validated at storage seams). */
export type IsoDate = string;

export type ScalarName = "orderTotal" | "installmentCount" | "cadence" | "perInstallment";

/** Closed enum. Carries no page data by design. */
export type DegradeReason = "no_match" | "gate_failed" | "adapter_error";

export type SoftSignal =
  | "provider_widget"
  | "bound_cluster"
  | "labelled_total_row"
  | "adapter_path"
  | "stable_across_ticks"
  | "primary_anchor";

export interface ConfidenceReport {
  readonly hardGatesPassed: boolean;
  readonly softScore: number;
  readonly signals: readonly SoftSignal[];
}

/**
 * A fully hard-gated schedule candidate. This shape exists only when every
 * hard gate passed for all four scalars; the numeric confirmation UI accepts
 * exactly this type and nothing weaker.
 */
export interface ScheduleCandidate {
  readonly orderTotalCents: Cents;
  readonly installmentCount: number;
  readonly cadence: Cadence;
  readonly perInstallmentCents: Cents;
  readonly currency: Currency;
  readonly confidence: ConfidenceReport;
}

/**
 * A partial candidate: only the fields whose hard gates passed are present.
 * Structurally distinct from ScheduleCandidate so it can never flow into a
 * surface that expects a complete, confirmable schedule.
 */
export interface PartialCandidate {
  readonly orderTotalCents?: Cents;
  readonly installmentCount?: number;
  readonly cadence?: Cadence;
  readonly perInstallmentCents?: Cents;
  readonly currency?: Currency;
  readonly confidence: ConfidenceReport;
}

/**
 * The engine's only output. Every checkout session on a permitted host ends
 * in exactly one of these three states; there is no raw-number output and no
 * silent exit.
 */
export type EngineState =
  | { readonly kind: "PARSED_CONFIRMABLE"; readonly candidate: ScheduleCandidate }
  | {
      readonly kind: "PARTIAL";
      readonly candidate: PartialCandidate;
      readonly missing: readonly ScalarName[];
    }
  | { readonly kind: "DEGRADED"; readonly reason: DegradeReason };

/** How a stored plan came to exist. */
export type PlanSource = "manual" | "checkout_confirmed";

/**
 * A user-confirmed payment plan as persisted locally. The field set is
 * closed: the storage layer rejects records carrying anything else.
 */
export interface PaymentPlanRecord {
  readonly id: string;
  readonly createdAt: IsoDate;
  readonly source: PlanSource;
  readonly currency: Currency;
  readonly orderTotalCents: Cents;
  readonly installmentCount: number;
  readonly cadence: Cadence;
  readonly perInstallmentCents: Cents;
  readonly firstPaymentDate: IsoDate;
}
