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

/** Thrown by scaffolded seams whose implementation has not landed yet. */
export class NotImplementedError extends Error {
  override name = "NotImplementedError";
  constructor(seam: string) {
    super(`Not implemented yet: ${seam}`);
  }
}
