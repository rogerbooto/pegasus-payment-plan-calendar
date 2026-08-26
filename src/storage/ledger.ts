/**
 * The local plan store: the ONE validated writer in front of the storage
 * seam. Minimum-necessary capture is enforced here as an allowlist, not a
 * habit — a write containing a non-allowlisted key or field (merchant, URL,
 * cart contents, DOM, tokens, free text) throws StorageSchemaError instead
 * of silently succeeding. Only user-confirmed plans (four scalars + dates),
 * the small settings record, and the small usage-flags record (UI state
 * for the popup's post-usefulness invite gate — src/popup/usage-tracking.ts)
 * persist. Every one of those three top-level keys, and every field inside
 * each of them, is validated here before it reaches chrome.storage.local —
 * usage-tracking.ts writes through validateUsageFlags rather than the raw
 * store, closing what would otherwise be a real bypass of this file's own
 * allowlist (a validator here is meaningless if a second, unvalidated
 * write path exists elsewhere for a key this file doesn't know about).
 */
import { StorageSchemaError } from "../shared/errors";
import { assertPositiveCents } from "../shared/money";
import {
  INSTALLMENT_COUNT_MAX,
  INSTALLMENT_COUNT_MIN,
  STORAGE_SCHEMA_VERSION,
} from "../shared/constants";
import type { PaymentPlanRecord } from "../shared/types";
import type { KeyValueStore } from "./store";

/** The complete set of top-level storage keys. Nothing else may persist. */
export const STORAGE_KEY_ALLOWLIST = ["schemaVersion", "plans", "settings", "usage"] as const;
export type StorageKey = (typeof STORAGE_KEY_ALLOWLIST)[number];

/** The complete, closed field set of a stored plan record. */
const PLAN_FIELD_ALLOWLIST = [
  "id",
  "createdAt",
  "source",
  "currency",
  "orderTotalCents",
  "installmentCount",
  "cadence",
  "perInstallmentCents",
  "firstPaymentDate",
] as const;

const SETTINGS_FIELD_ALLOWLIST = ["measurementEnabled"] as const;

/** The complete, closed field set of the usage-flags record (UI state only
 * — never a merchant/url/financial value, see FORBIDDEN_KEY_SUBSTRINGS
 * below, which this record is checked against too). */
const USAGE_FIELD_ALLOWLIST = ["viewedNext30", "inviteDismissed"] as const;

/**
 * Belt-and-braces on top of the allowlists: key names that must never appear
 * anywhere in persisted data, at any depth. These describe data classes the
 * extension refuses to hold, not fields it merely doesn't use yet.
 */
export const FORBIDDEN_KEY_SUBSTRINGS = [
  "merchant",
  "store",
  "url",
  "href",
  "domain",
  "host",
  "cart",
  "item",
  "sku",
  "dom",
  "html",
  "token",
  "session",
  "auth",
  "password",
  "email",
  "phone",
  "address",
] as const;

const ID_PATTERN = /^[A-Za-z0-9-]{1,64}$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const CADENCES = ["WEEKLY", "BIWEEKLY", "MONTHLY"] as const;
const CURRENCIES = ["CAD", "USD"] as const;
const SOURCES = ["manual", "checkout_confirmed"] as const;

/**
 * `measurementEnabled` is a legacy field. The UI control that wrote it (a
 * "count how often this is used" toggle) has been removed from the popup:
 * src/telemetry/sink.ts has zero call sites, so nothing was ever counted
 * or sent, and a control describing behaviour the product doesn't have is
 * a transparency failure. A persisted `true` from before that removal is
 * STALE, not consent — no future transport may read this field and start
 * sending on the strength of it. If measurement ever ships for real, it
 * needs its own new opt-in flag and its own onboarding/settings copy, not
 * a silent resurrection of this one.
 */
export interface Settings {
  readonly measurementEnabled: boolean;
}

/** UI state for the popup's post-usefulness email-invite gate — never a
 * merchant name, a URL, or any financial value (src/popup/usage-tracking.ts). */
export interface UsageFlags {
  readonly viewedNext30: boolean;
  readonly inviteDismissed: boolean;
}

function assertNoForbiddenKeys(value: unknown, path: string): void {
  if (typeof value !== "object" || value === null) return;
  for (const [key, nested] of Object.entries(value)) {
    const lower = key.toLowerCase();
    for (const forbidden of FORBIDDEN_KEY_SUBSTRINGS) {
      if (lower.includes(forbidden)) {
        throw new StorageSchemaError(
          `refusing to persist key "${path}${key}": matches forbidden class "${forbidden}"`,);
      }
    }
    assertNoForbiddenKeys(nested, `${path}${key}.`);
  }
}

function assertClosedFieldSet(
  record: Record<string, unknown>,
  allowlist: readonly string[],
  what: string,): void {
  for (const key of Object.keys(record)) {
    if (!allowlist.includes(key)) {
      throw new StorageSchemaError(`${what} contains non-allowlisted field "${key}"`);
    }
  }
  for (const key of allowlist) {
    if (!(key in record)) {
      throw new StorageSchemaError(`${what} is missing required field "${key}"`);
    }
  }
}

export function validatePlanRecord(raw: unknown): PaymentPlanRecord {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new StorageSchemaError("plan record must be an object");
  }
  const record = raw as Record<string, unknown>;
  assertClosedFieldSet(record, PLAN_FIELD_ALLOWLIST, "plan record");
  assertNoForbiddenKeys(record, "");

  const { id, createdAt, source, currency, installmentCount, cadence, firstPaymentDate } = record;
  if (typeof id !== "string" || !ID_PATTERN.test(id)) {
    throw new StorageSchemaError("plan id must be a short opaque identifier");
  }
  for (const [field, value] of [
    ["createdAt", createdAt],
    ["firstPaymentDate", firstPaymentDate],
  ] as const) {
    if (typeof value !== "string" || !ISO_DATE_PATTERN.test(value)) {
      throw new StorageSchemaError(`${field} must be an ISO YYYY-MM-DD date`);
    }
  }
  if (!SOURCES.includes(source as (typeof SOURCES)[number])) {
    throw new StorageSchemaError("source must be manual or checkout_confirmed");
  }
  if (!CURRENCIES.includes(currency as (typeof CURRENCIES)[number])) {
    throw new StorageSchemaError("currency must be CAD or USD");
  }
  if (!CADENCES.includes(cadence as (typeof CADENCES)[number])) {
    throw new StorageSchemaError("cadence must be WEEKLY, BIWEEKLY or MONTHLY");
  }
  if (
    typeof installmentCount !== "number" ||
    !Number.isSafeInteger(installmentCount) ||
    installmentCount < INSTALLMENT_COUNT_MIN ||
    installmentCount > INSTALLMENT_COUNT_MAX) {
    throw new StorageSchemaError(
      `installmentCount must be an integer between ${INSTALLMENT_COUNT_MIN} and ${INSTALLMENT_COUNT_MAX}`,);
  }
  assertPositiveCents(record.orderTotalCents, "orderTotalCents");
  assertPositiveCents(record.perInstallmentCents, "perInstallmentCents");
  return record as unknown as PaymentPlanRecord;
}

export function validateSettings(raw: unknown): Settings {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new StorageSchemaError("settings must be an object");
  }
  const record = raw as Record<string, unknown>;
  assertClosedFieldSet(record, SETTINGS_FIELD_ALLOWLIST, "settings");
  if (typeof record.measurementEnabled !== "boolean") {
    throw new StorageSchemaError("measurementEnabled must be a boolean");
  }
  return record as unknown as Settings;
}

/**
 * The validated seam for the "usage" top-level key, mirroring
 * validateSettings/validatePlanRecord above. Before this existed,
 * src/popup/usage-tracking.ts wrote this key straight through
 * KeyValueStore#set with no allowlist or forbidden-key check at all — the
 * same class of gap PlanLedger exists to close for plans and settings,
 * just for a key this file didn't know about yet.
 */
export function validateUsageFlags(raw: unknown): UsageFlags {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new StorageSchemaError("usage flags must be an object");
  }
  const record = raw as Record<string, unknown>;
  assertClosedFieldSet(record, USAGE_FIELD_ALLOWLIST, "usage flags");
  assertNoForbiddenKeys(record, "");
  if (typeof record.viewedNext30 !== "boolean") {
    throw new StorageSchemaError("viewedNext30 must be a boolean");
  }
  if (typeof record.inviteDismissed !== "boolean") {
    throw new StorageSchemaError("inviteDismissed must be a boolean");
  }
  return record as unknown as UsageFlags;
}

/** The single validated writer over the storage seam. */
export class PlanLedger {
  constructor(private readonly store: KeyValueStore) {}

  async listPlans(): Promise<readonly PaymentPlanRecord[]> {
    const result = await this.store.get(["plans"]);
    const raw = result["plans"];
    if (raw === undefined) return [];
    if (!Array.isArray(raw)) throw new StorageSchemaError("stored plans are not an array");
    return raw.map(validatePlanRecord);
  }

  async addPlan(raw: unknown): Promise<PaymentPlanRecord> {
    const record = validatePlanRecord(raw);
    const existing = await this.listPlans();
    await this.store.set({
      schemaVersion: STORAGE_SCHEMA_VERSION,
      plans: [...existing, record],
    });
    return record;
  }

  async removePlan(id: string): Promise<void> {
    const existing = await this.listPlans();
    await this.store.set({
      schemaVersion: STORAGE_SCHEMA_VERSION,
      plans: existing.filter((p) => p.id !== id),
    });
  }

  async writeSettings(raw: unknown): Promise<Settings> {
    const settings = validateSettings(raw);
    await this.store.set({ settings });
    return settings;
  }
}
