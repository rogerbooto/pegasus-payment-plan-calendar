/**
 * Committed snapshot of the canonical Pegasus app forbidden-prop-key set
 * (backend/app/services/telemetry_service.py `FORBIDDEN_PROP_KEYS`, kept in
 * lockstep with frontend/src/lib/constants/telemetry-events.ts by the
 * Pegasus repo's own parity test). Captured 2026-08-25, 62 keys.
 *
 * This is a SNAPSHOT, not a live import — the extension repo has no
 * dependency on the private Pegasus repo. It exists so a public-repo-only
 * contributor can verify, without checking out anything private, that
 * src/telemetry/constants.ts's FORBIDDEN_PROP_KEYS is a superset of what
 * the app forbids. Refresh this file only via a reviewed PR when the app's
 * canonical set changes (see the Pegasus repo's
 * backend/tests/unit/test_telemetry_forbidden_keys_parity.py for the
 * three-surface parity mechanics that keep this snapshot honest from the
 * other side).
 */
export const CANONICAL_FORBIDDEN_KEYS_SNAPSHOT: ReadonlySet<string> = new Set<string>([
  // PII
  "email",
  "user_id",
  "session_id",
  "auth_token",
  "first_name",
  "last_name",
  "full_name",
  "phone",
  "address",
  "ip",
  "ip_address",
  // Financial values
  "amount",
  "balance",
  "net_worth",
  "income",
  "expense",
  "credit_limit",
  "interest_rate",
  "principal",
  "transaction_amount",
  // Account / instrument identity
  "account_id",
  "account_name",
  "account_number",
  "iban",
  "card_number",
  "card_last4",
  "routing_number",
  "transaction_id",
  "merchant",
  "merchant_name",
  "vendor",
  "vendor_name",
  "description",
  "notes",
  "memo",
  // Household / entity identity
  "household_id",
  "household_name",
  "entity_id",
  "entity_name",
  // Not-yet-literal aliases
  "value",
  "total",
  "subtotal",
  "salary",
  "apr",
  "rate",
  "interest",
  "limit",
  "province",
  "jurisdiction",
  "payee",
  "connection_id",
  "device_id",
  "fingerprint",
  // Charter keys
  "username",
  "name",
  "category_name",
  "tax_owed",
  "marginal_rate",
  "state",
  "country",
  // Financial-health state
  "status",
  "severity",
]);
