import { describe, expect, it } from "vitest";
import {
  FORBIDDEN_KEY_SUBSTRINGS,
  PlanLedger,
  STORAGE_KEY_ALLOWLIST,
  validatePlanRecord,
  validateSettings,
  validateUsageFlags,
} from "../../src/storage/ledger";
import type { KeyValueStore } from "../../src/storage/store";
import { StorageSchemaError } from "../../src/shared/errors";

function memoryStore(): KeyValueStore & { data: Record<string, unknown> } {
  const data: Record<string, unknown> = {};
  return {
    data,
    async get(keys) {
      return Object.fromEntries(keys.filter((k) => k in data).map((k) => [k, data[k]]));
    },
    async set(items) {
      Object.assign(data, items);
    },
    async remove(keys) {
      for (const k of keys) delete data[k];
    },
  };
}

const validPlan = {
  id: "a1b2c3",
  createdAt: "2026-08-24",
  source: "checkout_confirmed",
  currency: "CAD",
  orderTotalCents: 8996,
  installmentCount: 4,
  cadence: "BIWEEKLY",
  perInstallmentCents: 2249,
  firstPaymentDate: "2026-09-01",
};

describe("plan record allowlist", () => {
  it("accepts a valid record", () => {
    expect(validatePlanRecord(validPlan).id).toBe("a1b2c3");
  });

  it("rejects any non-allowlisted field instead of silently persisting it", () => {
    for (const extra of ["merchantName", "checkoutUrl", "cartContents", "pageDom", "authToken"]) {
      expect(() => validatePlanRecord({ ...validPlan, [extra]: "x" })).toThrow(StorageSchemaError);
    }
  });

  // Sabotage-probe finding: every field in the test above ALSO matches a
  // FORBIDDEN_KEY_SUBSTRINGS entry ("merchant", "url", "cart", "dom",
  // "auth"), so deleting assertClosedFieldSet's call entirely — the actual
  // minimum-necessary-capture guard T17 requires — still leaves every case
  // above throwing via the belt-and-braces substring check, and the whole
  // 283-test suite stays green. Verified by temporarily removing the
  // assertClosedFieldSet() call from validatePlanRecord and re-running the
  // suite. This field is deliberately chosen to match NO forbidden
  // substring, so only the closed-allowlist check (not the substring
  // check) can catch it — RED if assertClosedFieldSet is ever removed or
  // bypassed, even though assertNoForbiddenKeys is untouched.
  it("rejects a non-allowlisted field that matches no forbidden substring (isolates the allowlist guard from the substring guard)", () => {
    for (const extra of ["nickname", "priority", "colorLabel", "note"]) {
      expect(FORBIDDEN_KEY_SUBSTRINGS.some((f) => extra.toLowerCase().includes(f))).toBe(false);
      expect(() => validatePlanRecord({ ...validPlan, [extra]: "x" })).toThrow(StorageSchemaError);
      expect(() => validatePlanRecord({ ...validPlan, [extra]: "x" })).toThrow(/non-allowlisted field/);
    }
  });

  it("rejects missing required fields", () => {
    const { cadence: _cadence, ...withoutCadence } = validPlan;
    expect(() => validatePlanRecord(withoutCadence)).toThrow(StorageSchemaError);
  });

  it("rejects float money values at the seam", () => {
    expect(() => validatePlanRecord({ ...validPlan, perInstallmentCents: 22.49 })).toThrow(
      /integer cents/,);
  });

  it("rejects out-of-bounds installment counts and unknown enum values", () => {
    expect(() => validatePlanRecord({ ...validPlan, installmentCount: 1 })).toThrow(StorageSchemaError);
    expect(() => validatePlanRecord({ ...validPlan, installmentCount: 25 })).toThrow(StorageSchemaError);
    expect(() => validatePlanRecord({ ...validPlan, currency: "EUR" })).toThrow(StorageSchemaError);
    expect(() => validatePlanRecord({ ...validPlan, cadence: "DAILY" })).toThrow(StorageSchemaError);
  });
});

describe("settings allowlist", () => {
  it("accepts the closed settings record", () => {
    expect(validateSettings({ measurementEnabled: false }).measurementEnabled).toBe(false);
  });

  it("rejects unknown settings keys", () => {
    expect(() => validateSettings({ measurementEnabled: false, extra: 1 })).toThrow(
      StorageSchemaError,);
  });
});

describe("usage-flags allowlist (closes the storage-seam bypass: 'usage' used to be written straight through KeyValueStore#set, outside every allowlist here)", () => {
  it("accepts the closed usage-flags record", () => {
    expect(validateUsageFlags({ viewedNext30: false, inviteDismissed: false })).toEqual({
      viewedNext30: false,
      inviteDismissed: false,
    });
  });

  it("rejects a non-allowlisted field instead of silently persisting it -- RED if a future write path skips this validator", () => {
    expect(() => validateUsageFlags({ viewedNext30: false, inviteDismissed: false, extra: 1 })).toThrow(
      StorageSchemaError,);
  });

  it("rejects a field that would match a forbidden data class, via the closed-allowlist check (the same defense-in-depth shape plan records and settings get: assertNoForbiddenKeys is belt-and-braces here too, since the closed field set already rejects anything named 'merchant')", () => {
    expect(() => validateUsageFlags({ viewedNext30: true, inviteDismissed: false, merchant: "x" })).toThrow(
      StorageSchemaError,);
    expect(() => validateUsageFlags({ viewedNext30: true, inviteDismissed: false, merchant: "x" })).toThrow(
      /non-allowlisted field/,);
  });

  it("rejects a non-boolean value for either field", () => {
    expect(() => validateUsageFlags({ viewedNext30: "yes", inviteDismissed: false })).toThrow(StorageSchemaError);
    expect(() => validateUsageFlags({ viewedNext30: false, inviteDismissed: 1 })).toThrow(StorageSchemaError);
  });

  it("STORAGE_KEY_ALLOWLIST includes 'usage' -- the top-level key usage-tracking.ts writes is no longer outside this file's own closed schema", () => {
    expect(STORAGE_KEY_ALLOWLIST).toContain("usage");
  });
});

describe("PlanLedger — the single validated writer", () => {
  it("persists a valid plan and reads it back", async () => {
    const store = memoryStore();
    const ledger = new PlanLedger(store);
    await ledger.addPlan(validPlan);
    const plans = await ledger.listPlans();
    expect(plans).toHaveLength(1);
    expect(plans[0]?.orderTotalCents).toBe(8996);
  });

  it("refuses to write a record carrying forbidden data classes", async () => {
    const store = memoryStore();
    const ledger = new PlanLedger(store);
    await expect(ledger.addPlan({ ...validPlan, merchant: "x" })).rejects.toThrow(
      StorageSchemaError,);
    expect(store.data).toEqual({});
  });

  it("removes plans by id", async () => {
    const store = memoryStore();
    const ledger = new PlanLedger(store);
    await ledger.addPlan(validPlan);
    await ledger.removePlan("a1b2c3");
    expect(await ledger.listPlans()).toHaveLength(0);
  });
});
