import { describe, expect, it } from "vitest";
import {
  FORBIDDEN_KEY_SUBSTRINGS,
  PlanLedger,
  STORAGE_KEY_ALLOWLIST,
  validatePlanRecord,
  validateSettings,
  validateUsageFlags,
} from "../../src/storage/ledger";
import type { Settings } from "../../src/storage/ledger";
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
    const settings = validateSettings({ checkoutReadingEnabled: true });
    expect(settings.checkoutReadingEnabled).toBe(true);
  });

  it("rejects unknown settings keys", () => {
    expect(() => validateSettings({ checkoutReadingEnabled: false, extra: 1 })).toThrow(StorageSchemaError);
  });

  // measurementEnabled was REMOVED from the schema (guardian review,
  // 2026-08-26): a key sitting in storage that means nothing is the one
  // verification-friendly claim in this product's own README that fails
  // verification. RED if it is ever re-admitted to the allowlist without
  // a real, live control and copy behind it.
  it("measurementEnabled is no longer part of the schema at all -- present alongside a valid checkoutReadingEnabled, it is rejected as a non-allowlisted field, not silently accepted or ignored", () => {
    expect(() => validateSettings({ checkoutReadingEnabled: true, measurementEnabled: false })).toThrow(
      StorageSchemaError,);
    expect(() => validateSettings({ checkoutReadingEnabled: true, measurementEnabled: false })).toThrow(
      /non-allowlisted field/,);
  });

  // The bug this field exists to fix (BUG 1): the consent choice used to be
  // discarded entirely (Continue always wrote measurementEnabled: false and
  // nothing else). checkoutReadingEnabled is the field that now carries
  // that choice, and is also the field the Settings-screen toggle reads
  // and flips -- RED if it is ever removed from the allowlist/validator,
  // or if it stops being required.
  it("admits checkoutReadingEnabled -- true and false are both valid, and it is required (missing => rejected)", () => {
    expect(validateSettings({ checkoutReadingEnabled: true }).checkoutReadingEnabled).toBe(true);
    expect(validateSettings({ checkoutReadingEnabled: false }).checkoutReadingEnabled).toBe(false);
    expect(() => validateSettings({})).toThrow(StorageSchemaError);
    expect(() => validateSettings({ checkoutReadingEnabled: "yes" })).toThrow(StorageSchemaError);
  });

  // Regression risk called out explicitly: adding a field to the SETTINGS
  // allowlist must never widen the separate, 9-field PLAN allowlist. Proven
  // behaviourally (validatePlanRecord's field set is private) rather than
  // by exporting it just for this test: a plan record is still rejected
  // for carrying checkoutReadingEnabled, and the known-good plan record
  // (all 9 plan fields, none of them a settings field) still validates.
  it("checkoutReadingEnabled is a SETTINGS field only -- the plan record allowlist did not grow to admit it", () => {
    expect(() => validatePlanRecord({ ...validPlan, checkoutReadingEnabled: true })).toThrow(StorageSchemaError);
    expect(() => validatePlanRecord({ ...validPlan, checkoutReadingEnabled: true })).toThrow(/non-allowlisted field/);
    // The unmodified 9-field plan record still validates on its own --
    // proof the plan schema itself was untouched by this change.
    expect(validatePlanRecord(validPlan).id).toBe(validPlan.id);
    expect(Object.keys(validPlan)).toHaveLength(9);
  });
});

describe("PlanLedger.readSettings() -- the measurementEnabled removal migration (item 7, guardian review 2026-08-26)", () => {
  it("returns null when settings has never been written -- never-onboarded stays never-onboarded, no record is invented", async () => {
    const store = memoryStore();
    const ledger = new PlanLedger(store);
    expect(await ledger.readSettings()).toBeNull();
    expect(store.data.settings).toBeUndefined();
  });

  it("an already-clean record (checkoutReadingEnabled only) round-trips without a rewrite", async () => {
    const store = memoryStore();
    store.data.settings = { checkoutReadingEnabled: true };
    const ledger = new PlanLedger(store);
    const settings = (await ledger.readSettings()) as Settings;
    expect(settings.checkoutReadingEnabled).toBe(true);
    // Still exactly the same shape -- no stray field appeared.
    expect(Object.keys(store.data.settings as object)).toEqual(["checkoutReadingEnabled"]);
  });

  // The migration itself: an old record still carrying measurementEnabled
  // (possibly `true`, from before the toggle that wrote it was removed
  // from the popup) must not survive a read. RED if this field is ever
  // readable from storage again after this test's own store has been read
  // once through the ledger.
  it("strips a legacy measurementEnabled: true from an old record on read, and persists the cleaned record", async () => {
    const store = memoryStore();
    store.data.settings = { measurementEnabled: true, checkoutReadingEnabled: false };
    const ledger = new PlanLedger(store);

    const settings = (await ledger.readSettings()) as Settings;
    expect(settings.checkoutReadingEnabled).toBe(false);
    expect((settings as unknown as Record<string, unknown>).measurementEnabled).toBeUndefined();

    // The migration WROTE BACK the cleaned record -- not just returned a
    // cleaned view of a still-dirty store. A second, independent read
    // must see it gone too.
    expect(store.data.settings).toEqual({ checkoutReadingEnabled: false });
    const secondLedger = new PlanLedger(store);
    const secondRead = (await secondLedger.readSettings()) as Settings;
    expect((secondRead as unknown as Record<string, unknown>).measurementEnabled).toBeUndefined();
  });

  it("a record with measurementEnabled but no checkoutReadingEnabled at all (a genuinely ancient install) migrates to the safe, not-reading default -- never an implicit yes", async () => {
    const store = memoryStore();
    store.data.settings = { measurementEnabled: true };
    const ledger = new PlanLedger(store);

    const settings = (await ledger.readSettings()) as Settings;
    expect(settings.checkoutReadingEnabled).toBe(false);
    expect(store.data.settings).toEqual({ checkoutReadingEnabled: false });
  });

  it("a malformed (non-object) settings value migrates to the safe default rather than throwing", async () => {
    const store = memoryStore();
    store.data.settings = "not-an-object";
    const ledger = new PlanLedger(store);

    const settings = (await ledger.readSettings()) as Settings;
    expect(settings.checkoutReadingEnabled).toBe(false);
    expect(store.data.settings).toEqual({ checkoutReadingEnabled: false });
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
