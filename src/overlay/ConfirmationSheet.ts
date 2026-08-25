/**
 * The mandatory confirmation step, as a real HTML form inside the overlay's
 * shadow root. No parsed value is stored, used in the impact view, or
 * counted as a plan until the user confirms it here; every field is
 * editable; there is no auto-confirm and no "skip confirmation" setting.
 *
 * Type gate (load-bearing): `ConfirmationSheetProps.candidate` accepts ONLY
 * a complete, hard-gated `ScheduleCandidate`. PARTIAL and DEGRADED states
 * are structurally incapable of rendering through this component — they
 * route to `ManualEntrySheetProps`, whose prefills are suggestions, never
 * presented as authoritative.
 */
import type { DegradeReason, PartialCandidate, PaymentPlanRecord, ScheduleCandidate } from "../shared/types";
import { NotImplementedError } from "../shared/errors";

export interface ConfirmationSheetProps {
  /** Only a PARSED_CONFIRMABLE candidate typechecks here. */
  readonly candidate: ScheduleCandidate;
  readonly onConfirm: (confirmed: PaymentPlanRecord) => void;
  readonly onCancel: () => void;
}

export interface ManualEntrySheetProps {
  /** Hard-gated fields only, clearly labelled as suggestions; may be absent. */
  readonly prefill?: PartialCandidate;
  /** Present when arriving from the honest degraded state. */
  readonly degradeReason?: DegradeReason;
  readonly onConfirm: (confirmed: PaymentPlanRecord) => void;
  readonly onCancel: () => void;
}

export function renderConfirmationSheet(_root: ShadowRoot, _props: ConfirmationSheetProps): void {
  throw new NotImplementedError("overlay/ConfirmationSheet#renderConfirmationSheet");
}

export function renderManualEntrySheet(_root: ShadowRoot, _props: ManualEntrySheetProps): void {
  throw new NotImplementedError("overlay/ConfirmationSheet#renderManualEntrySheet");
}
