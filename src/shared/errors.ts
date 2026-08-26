/** Thrown when a value that must be integer cents is anything else. Loud, never coerced. */
export class MoneyError extends Error {
  override name = "MoneyError";
}

/** Thrown when a storage write contains a key or field outside the allowlisted schema. */
export class StorageSchemaError extends Error {
  override name = "StorageSchemaError";
}

/** Thrown when the bundled selector config fails validation. */
export class ConfigValidationError extends Error {
  override name = "ConfigValidationError";
}

/**
 * Thrown when a value reaching the impact engine or the checkout-confirmed
 * ledger writer does not match what the user confirmed (T01, the Critical
 * threat-model finding). A confidently wrong number must never compute.
 */
export class ConfirmationError extends Error {
  override name = "ConfirmationError";
}

/** Thrown when PlanLedger.updatePlan names a plan id the ledger does not hold. */
export class PlanNotFoundError extends Error {
  override name = "PlanNotFoundError";
  constructor(id: string) {
    super(`no stored plan with id "${id}"`);
  }
}

/** Thrown by scaffolded seams whose implementation has not landed yet. */
export class NotImplementedError extends Error {
  override name = "NotImplementedError";
  constructor(seam: string) {
    super(`Not implemented yet: ${seam}`);
  }
}
