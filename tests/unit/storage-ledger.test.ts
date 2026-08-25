import { describe, expect, it } from "vitest";
import { PlanLedger, validatePlanRecord, validateSettings } from "../../src/storage/ledger";
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

  it("rejects missing required fields", () => {
    const { cadence: _cadence, ...withoutCadence } = validPlan;
    expect(() => validatePlanRecord(withoutCadence)).toThrow(StorageSchemaError);
  });

  it("rejects float money values at the seam", () => {
    expect(() => validatePlanRecord({ ...validPlan, perInstallmentCents: 22.49 })).toThrow(
      /integer cents/,
    );
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
      StorageSchemaError,
    );
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
      StorageSchemaError,
    );
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
