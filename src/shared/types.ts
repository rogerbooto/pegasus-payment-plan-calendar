/**
 * Shared domain types. Every module seam (engine, parser, storage, impact,
 * overlay, telemetry) speaks these types; none defines its own copies.
 */
import type { Cents } from "./money";

export type Currency = "CAD" | "USD";
export type Cadence = "WEEKLY" | "BIWEEKLY" | "MONTHLY";

/**
 * The manual appearance override (first-run UX spec §4): "system" (the
 * default) genuinely follows the OS's `prefers-color-scheme`, in both
 * extension pages and the checkout overlay -- "light"/"dark" pin it
 * regardless of the OS. Persisted at `Settings.theme`
 * (src/storage/ledger.ts) and applied as a `data-theme` attribute on the
 * popup/tab document element and the overlay's host element
 * (`applyThemeAttribute`, src/overlay/theme.ts) -- never inferred, never
 * written except through `PlanLedger.updateSettings`/`writeSettings`.
 */
export type Theme = "system" | "light" | "dark";

/** Calendar date as an ISO `YYYY-MM-DD` string (validated at storage seams). */
export type IsoDate = string;

export type ScalarName = "orderTotal" | "installmentCount" | "cadence" | "perInstallment";

/**
 * Closed enum. Carries no page data by design.
 *
 * `unconfirmed` is distinct from `no_match`: `no_match` means the full
 * generic detector ran against real page content and found nothing to
 * hard-gate -- the page IS a checkout (or close enough), just not one we
 * could parse. `unconfirmed` means the engine never got that far: the
 * cheap pre-gate's structural signal (a path pattern or an adapter match)
 * fired, but its affordance probe did not, so no observer was even
 * attached and no real extraction was attempted. The overlay must not
 * describe an `unconfirmed` page as "this checkout" -- it may not be one.
 */
export type DegradeReason = "no_match" | "gate_failed" | "adapter_error" | "unconfirmed";

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

/**
 * A single order-total-only suggestion, read once from a page the engine
 * reached a terminal DEGRADED state on (it could not confirm the page is a
 * checkout at all). Structurally distinct from PartialCandidate: it carries
 * no ConfidenceReport, no missing-scalar list, and cannot be widened into
 * one by assignment. It exists to prefill exactly one field
 * (FIELD_LABEL_TOTAL, on the manual "Add a plan" form) as a correctable
 * suggestion -- nothing else reads it, and it is never itself stored.
 *
 * Count, cadence and per-payment amount have no honest source on a
 * DEGRADED page: only an installment-phrase cluster can supply them, and
 * finding one routes away from DEGRADED entirely (src/engine/engine.ts's
 * fallback rule / detectInstallmentOffer). This type is structurally
 * incapable of carrying them for that reason, not by omission.
 */
export interface OrderTotalSuggestion {
  readonly cents: Cents;
  readonly currency: Currency;
}

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
  /**
   * An optional, user-typed name for the plan ("Laptop", "Headphones") so
   * two plans starting on the same date can be told apart in the list.
   * `""` means the user left it blank — the field is always present in a
   * stored record (the closed allowlist rejects a missing field), never
   * absent.
   *
   * Provenance is the entire point of this field's design: it is typed by
   * the user in the add/edit form and NOWHERE else. It is never read,
   * suggested, or prefilled from a page — the engine's output types
   * (ScheduleCandidate, PartialCandidate, OrderTotalSuggestion) carry no
   * name-shaped field, and the confirmation gate's ConfirmedPlanValues
   * (src/parser/confirmation.ts) does not either, so the extraction path
   * is structurally unable to supply one. The merchant/product name a
   * page could offer is exactly the data class FORBIDDEN_KEY_SUBSTRINGS
   * (src/storage/ledger.ts) exists to refuse.
   * tests/static/custom-name-user-typed-only.test.ts pins all of this.
   */
  readonly customName: string;
}
