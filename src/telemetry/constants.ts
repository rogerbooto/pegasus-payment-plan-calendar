/**
 * Usage measurement is opt-in, off by default, and financially blind: bare
 * event counts from a closed enum, never amounts, merchants, URLs, or page
 * content. The allowlists below are the complete measurement surface;
 * adding an event or a prop is a reviewed schema change, not a call-site
 * edit.
 */

export const EVENT_NAMES = [
  "overlay_shown",
  "overlay_degraded",
  "impact_expanded",
  "plan_added",
  "overlay_dismissed",
] as const;

export type EventName = (typeof EVENT_NAMES)[number];

/**
 * Per-event prop allowlist: prop name -> allowed values. Events absent here
 * or props absent per event are rejected at the send seam.
 */
export const EVENT_PROP_ALLOWLIST: Readonly<
  Record<EventName, Readonly<Record<string, readonly string[]>>>
> = {
  overlay_shown: {},
  overlay_degraded: {},
  impact_expanded: {},
  plan_added: { method: ["manual", "checkout_confirmed"] },
  overlay_dismissed: {},
};

/**
 * Key names that must never appear as a prop key on any event, regardless
 * of allowlist edits — a tripwire for the data classes measurement is
 * forbidden to carry.
 *
 * This set is a SUPERSET of the Pegasus app's own forbidden-key set
 * (backend/app/services/telemetry_service.py, mirrored in
 * frontend/src/lib/constants/telemetry-events.ts): it forbids everything
 * the app forbids, plus checkout-specific data classes the app has no
 * concept of (cart, sku, price, href, domain, path, host, session, ...).
 * A cross-repo parity test in the Pegasus repo asserts the superset
 * relation holds — see
 * backend/tests/unit/test_telemetry_forbidden_keys_parity.py.
 *
 * Declared in the identical shape as the app's two mirrors
 * (`ReadonlySet<string> = new Set<string>([...])`) so the same
 * text-extraction strategy that keeps those two in sync also reads this
 * file unchanged.
 */
export const FORBIDDEN_PROP_KEYS: ReadonlySet<string> = new Set<string>([
  // PII (mirrors the app's set)
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
  // Financial values (mirrors the app's set)
  "amount",
  "balance",
  "net_worth",
  "income",
  "expense",
  "credit_limit",
  "interest_rate",
  "principal",
  "transaction_amount",
  // Account / instrument identity (mirrors the app's set)
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
  // Household / entity identity (mirrors the app's set)
  "household_id",
  "household_name",
  "entity_id",
  "entity_name",
  // Not-yet-literal aliases (mirrors the app's set)
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
  // Charter keys (mirrors the app's set)
  "username",
  "name",
  "category_name",
  "tax_owed",
  "marginal_rate",
  "state",
  "country",
  // Financial-health state (mirrors the app's set)
  "status",
  "severity",
  // Extension-specific: checkout/DOM data classes the app has no concept
  // of. These are additions on top of the app's set, never removals.
  "cents",
  "price",
  "currency",
  "store",
  "url",
  "href",
  "domain",
  "host",
  "path",
  "cart",
  "item",
  "sku",
  "token",
  "session",
  "id",
]);
