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
import type { PaymentPlanRecord, Theme } from "../shared/types";
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

/**
 * Exported (unlike PLAN_FIELD_ALLOWLIST/USAGE_FIELD_ALLOWLIST above) for
 * the same reason STORAGE_KEY_ALLOWLIST is: `theme`'s addition here
 * (first-run UX spec §4.5) is a deliberate, reviewed schema change, not a
 * silent one, and a direct test against this array is what makes that
 * review visible rather than only inferable from validateSettings'
 * behaviour.
 *
 * `assertClosedFieldSet` below enforces this set in BOTH directions --
 * an unknown field is rejected, and so is a MISSING one. That second half
 * is what makes `theme`'s addition a real cost: every existing partial
 * `writeSettings({ checkoutReadingEnabled: ... })` call now throws
 * "settings is missing required field \"theme\"". `PlanLedger.updateSettings`
 * below is the fix -- a read-modify-write helper every call site routes
 * through instead of hand-rolling its own merge (see its own doc comment).
 */
export const SETTINGS_FIELD_ALLOWLIST = ["checkoutReadingEnabled", "theme"] as const;

/** The closed set of valid `Settings.theme` values (first-run UX spec §4.3):
 * exactly three states, never two -- a two-position control would have no
 * position that means "follow the OS", so the first interaction would
 * silently and permanently destroy that behaviour with no way back. */
export const THEME_VALUES = ["system", "light", "dark"] as const;

/** The safe migration target for an install that predates `theme`
 * entirely (§4.5 step 4) -- never an arbitrary light/dark, and never
 * treated as consent-shaped data. */
export const DEFAULT_THEME: Theme = "system";

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
 * `measurementEnabled` (a "count how often this is used" flag) has been
 * REMOVED from this schema, not just left unused. The UI control that
 * wrote it was already removed from the popup before this — src/telemetry/
 * sink.ts has zero call sites, so nothing was ever counted or sent — but
 * the key itself kept sitting in storage, including a possible stale
 * `true` on any record written before that removal. That is exactly the
 * kind of thing this README-verifiable, open-the-devtools-and-look product
 * cannot afford: a key named `measurementEnabled` that a user can find and
 * that means nothing.
 *
 * `PlanLedger.readSettings()` below is the migration: any existing record
 * carrying `measurementEnabled` (or any other now-unrecognized field) is
 * re-validated against the CURRENT, closed SETTINGS_FIELD_ALLOWLIST and
 * written back clean on the very next read — the stale field cannot
 * survive a second read, and it is never displayed, counted, or used to
 * gate anything on the way out. `validateSettings` below only ever
 * accepts the current field set; it has no knowledge that
 * `measurementEnabled` ever existed. If measurement ever ships for real,
 * it needs its own new opt-in flag, its own onboarding/settings copy, and
 * its own migration — never a resurrection of this name.
 */
export interface Settings {
  /**
   * The user's first-run choice on whether checkout pages may be read at
   * all (src/popup/PopupApp.ts's onboarding screen: "Turn this on" /
   * "No thanks"), and the same choice the settings screen's "Read
   * checkout pages" control shows and flips afterward. Positive polarity
   * deliberately -- a `...Disabled` boolean inverts badly at every call
   * site that guards on it. The content script
   * (src/messaging/content-script.ts) is the reader that matters: it must
   * treat anything other than a literal `true` (absent settings, an
   * old/never-onboarded install, a malformed value) as "do not start" --
   * never as consent by omission -- and must tear an already-running
   * session down the moment this flips to `false` on an open tab
   * (chrome.storage.onChanged), not merely stop starting new ones.
   */
  readonly checkoutReadingEnabled: boolean;

  /** See the `Theme` type doc (src/shared/types.ts) for the full
   * first-run-UX-spec §4 rationale. */
  readonly theme: Theme;
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
  if (typeof record.checkoutReadingEnabled !== "boolean") {
    throw new StorageSchemaError("checkoutReadingEnabled must be a boolean");
  }
  if (!THEME_VALUES.includes(record.theme as Theme)) {
    throw new StorageSchemaError(`theme must be one of ${THEME_VALUES.join(", ")}`);
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

/**
 * True when a raw stored "settings" value already matches the current,
 * closed schema exactly — no now-removed field (measurementEnabled or any
 * future one), no missing field, right type. Used by
 * `PlanLedger.readSettings()` to decide whether a migration write-back is
 * actually needed, so an already-clean record isn't rewritten on every
 * single read.
 */
function isAlreadyCleanSettingsRecord(record: Record<string, unknown>): boolean {
  const keys = Object.keys(record);
  return (
    keys.length === SETTINGS_FIELD_ALLOWLIST.length &&
    keys.every((k) => (SETTINGS_FIELD_ALLOWLIST as readonly string[]).includes(k)) &&
    typeof record.checkoutReadingEnabled === "boolean" &&
    THEME_VALUES.includes(record.theme as Theme)
  );
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

  /**
   * Reads the "settings" key and migrates it in place if it carries a
   * now-removed field (measurementEnabled) or is otherwise not shaped
   * like the current schema -- the record is normalized to exactly
   * SETTINGS_FIELD_ALLOWLIST and written back through this same validated
   * writer so the stale field cannot resurface on a later read. Returns
   * `null` only when "settings" has never been written at all (the
   * never-onboarded case) -- that absence is meaningful (PopupApp.init()
   * uses it to decide whether to show onboarding) and is never turned
   * into a settings record of its own.
   *
   * `theme` (first-run UX spec §4.5 step 4) is migrated the same way,
   * independently of checkoutReadingEnabled: an install that predates the
   * field, or carries a corrupted value, reads back as DEFAULT_THEME
   * ("system") -- never an arbitrary light/dark, and never inferred from
   * (or mixed into) the consent field's own migration.
   */
  async readSettings(): Promise<Settings | null> {
    const result = await this.store.get(["settings"]);
    const raw = result["settings"];
    if (raw === undefined) return null;

    const record = typeof raw === "object" && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
    const checkoutReadingEnabled = record.checkoutReadingEnabled === true;
    const theme = THEME_VALUES.includes(record.theme as Theme) ? (record.theme as Theme) : DEFAULT_THEME;
    const settings = validateSettings({ checkoutReadingEnabled, theme });

    if (!isAlreadyCleanSettingsRecord(record)) {
      await this.store.set({ settings });
    }
    return settings;
  }

  async writeSettings(raw: unknown): Promise<Settings> {
    const settings = validateSettings(raw);
    await this.store.set({ settings });
    return settings;
  }

  /**
   * The read-modify-write helper the first-run UX spec (§4.5 step 5)
   * requires now that SETTINGS_FIELD_ALLOWLIST holds more than one field:
   * assertClosedFieldSet rejects a MISSING field just as loudly as an
   * unknown one, so a caller that only wants to flip `checkoutReadingEnabled`
   * (Settings' own toggle) or only `theme` (the appearance group) can no
   * longer call writeSettings() with a partial record -- it would now
   * throw `settings is missing required field "..."`. This reads the
   * current, already-migrated record (readSettings(), defaulting to
   * `{ checkoutReadingEnabled: false, theme: DEFAULT_THEME }` for a
   * never-onboarded install so a first write from either control still
   * produces a complete, valid record), applies `patch` on top, and writes
   * the full result back through the same validated writeSettings() --
   * every call site gets this for free instead of hand-rolling its own
   * merge, which is what would let a THIRD call site reintroduce the exact
   * bug this closes.
   */
  async updateSettings(patch: Partial<Settings>): Promise<Settings> {
    const current = (await this.readSettings()) ?? { checkoutReadingEnabled: false, theme: DEFAULT_THEME };
    return this.writeSettings({ ...current, ...patch });
  }
}
