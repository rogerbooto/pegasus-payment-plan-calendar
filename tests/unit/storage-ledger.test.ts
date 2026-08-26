import { describe, expect, it } from "vitest";
import {
  DEFAULT_THEME,
  FORBIDDEN_KEY_SUBSTRINGS,
  PlanLedger,
  SETTINGS_FIELD_ALLOWLIST,
  STORAGE_KEY_ALLOWLIST,
  THEME_VALUES,
  validatePlanRecord,
  validateSettings,
  validateUsageFlags,
} from "../../src/storage/ledger";
import type { Settings } from "../../src/storage/ledger";
import type { KeyValueStore } from "../../src/storage/store";
import { PlanNotFoundError, StorageSchemaError } from "../../src/shared/errors";

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

/** As memoryStore(), plus a count of `set()` calls -- the atomicity guard
 * for PlanLedger.updatePlan (edit-plan-spec §9.1 item 2): RED if anyone
 * ever reimplements it as remove-then-add, which would be two `set` calls
 * instead of one. */
function countingStore(): KeyValueStore & { data: Record<string, unknown>; setCalls: number } {
  const store = {
    data: {} as Record<string, unknown>,
    setCalls: 0,
    async get(keys: readonly string[]) {
      return Object.fromEntries(keys.filter((k) => k in store.data).map((k) => [k, store.data[k]]));
    },
    async set(items: Record<string, unknown>) {
      store.setCalls += 1;
      Object.assign(store.data, items);
    },
    async remove(keys: readonly string[]) {
      for (const k of keys) delete store.data[k];
    },
  };
  return store;
}

function plan(overrides: Partial<typeof validPlan> = {}): typeof validPlan {
  return { ...validPlan, ...overrides };
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
  // §4.5 (first-run UX spec): the allowlist grew from one field to two.
  // Direct assertion on the exported array, mirroring how
  // STORAGE_KEY_ALLOWLIST is asserted on below -- proof this is a
  // deliberate, reviewed shape, not just inferable from validateSettings'
  // behaviour.
  it("SETTINGS_FIELD_ALLOWLIST is exactly checkoutReadingEnabled and theme", () => {
    expect(SETTINGS_FIELD_ALLOWLIST).toEqual(["checkoutReadingEnabled", "theme"]);
  });

  it("accepts the closed settings record", () => {
    const settings = validateSettings({ checkoutReadingEnabled: true, theme: "system" });
    expect(settings.checkoutReadingEnabled).toBe(true);
    expect(settings.theme).toBe("system");
  });

  it("rejects unknown settings keys", () => {
    expect(() => validateSettings({ checkoutReadingEnabled: false, theme: "system", extra: 1 })).toThrow(
      StorageSchemaError,);
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
    expect(validateSettings({ checkoutReadingEnabled: true, theme: "system" }).checkoutReadingEnabled).toBe(true);
    expect(validateSettings({ checkoutReadingEnabled: false, theme: "system" }).checkoutReadingEnabled).toBe(false);
    expect(() => validateSettings({})).toThrow(StorageSchemaError);
    expect(() => validateSettings({ theme: "system" })).toThrow(/missing required field "checkoutReadingEnabled"/);
    expect(() => validateSettings({ checkoutReadingEnabled: "yes", theme: "system" })).toThrow(StorageSchemaError);
  });

  // §4.5 (first-run UX spec) -- theme is required in exactly the same
  // sense checkoutReadingEnabled is: validateSettings (called directly,
  // as opposed to through PlanLedger.readSettings()'s migration) demands
  // the complete, current field set. THEME_VALUES/DEFAULT_THEME are
  // exported so this test (and ThemeChoice.ts) never hand-roll a second
  // copy of the closed union.
  describe("theme", () => {
    it("THEME_VALUES is exactly [system, light, dark], and DEFAULT_THEME is system", () => {
      expect(THEME_VALUES).toEqual(["system", "light", "dark"]);
      expect(DEFAULT_THEME).toBe("system");
    });

    it("accepts all three closed values", () => {
      for (const theme of THEME_VALUES) {
        expect(validateSettings({ checkoutReadingEnabled: false, theme }).theme).toBe(theme);
      }
    });

    it("rejects a value outside the closed union, case-sensitively, and rejects non-string values", () => {
      for (const bad of ["Dark", "", null, undefined, 1, "SYSTEM", "auto"]) {
        expect(() => validateSettings({ checkoutReadingEnabled: false, theme: bad })).toThrow(StorageSchemaError);
      }
    });

    it("is required -- a record missing theme entirely is rejected, not defaulted (only PlanLedger.readSettings()'s migration path defaults it)", () => {
      expect(() => validateSettings({ checkoutReadingEnabled: false })).toThrow(StorageSchemaError);
      expect(() => validateSettings({ checkoutReadingEnabled: false })).toThrow(/missing required field "theme"/);
    });

    // The exact trap the spec calls out (§4.5): assertClosedFieldSet
    // rejects a MISSING field just as loudly as an unknown one, so a
    // caller that still calls the raw, partial-record writeSettings() the
    // way the two PopupApp.ts call sites used to must now fail loudly
    // rather than silently drop theme. RED if writeSettings ever goes back
    // to tolerating a partial record.
    it("PlanLedger.writeSettings still rejects a partial record missing theme -- callers must route through updateSettings instead", async () => {
      const store = memoryStore();
      const ledger = new PlanLedger(store);
      await expect(ledger.writeSettings({ checkoutReadingEnabled: true })).rejects.toThrow(StorageSchemaError);
      await expect(ledger.writeSettings({ checkoutReadingEnabled: true })).rejects.toThrow(
        /missing required field "theme"/,);
      expect(store.data.settings).toBeUndefined();
    });
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

  it("an already-clean record (checkoutReadingEnabled + theme) round-trips without a rewrite", async () => {
    const store = memoryStore();
    store.data.settings = { checkoutReadingEnabled: true, theme: "light" };
    const ledger = new PlanLedger(store);
    const settings = (await ledger.readSettings()) as Settings;
    expect(settings.checkoutReadingEnabled).toBe(true);
    expect(settings.theme).toBe("light");
    // Still exactly the same shape -- no stray field appeared, and the
    // explicit "light" choice was not silently reset to "system".
    expect(store.data.settings).toEqual({ checkoutReadingEnabled: true, theme: "light" });
  });

  // §4.5 step 4 (first-run UX spec) -- the exact scenario the task calls
  // out: an install that predates `theme` entirely must migrate to
  // "system", never an arbitrary light/dark, and this must not be
  // conflated with (or disturb) the separate checkoutReadingEnabled
  // migration -- a genuinely consented-in install stays consented-in.
  it("a record with checkoutReadingEnabled only (no theme field at all) migrates theme to 'system' on read, without disturbing checkoutReadingEnabled", async () => {
    const store = memoryStore();
    store.data.settings = { checkoutReadingEnabled: true };
    const ledger = new PlanLedger(store);

    const settings = (await ledger.readSettings()) as Settings;
    expect(settings.checkoutReadingEnabled).toBe(true);
    expect(settings.theme).toBe("system");

    // Written back clean -- a second, independent read sees the same
    // migrated shape, not a re-migration every time.
    expect(store.data.settings).toEqual({ checkoutReadingEnabled: true, theme: "system" });
    const secondLedger = new PlanLedger(store);
    expect(((await secondLedger.readSettings()) as Settings).theme).toBe("system");
  });

  // A corrupted/foreign theme value (never written by this codebase) must
  // migrate the same safe way as a missing one -- rejecting it outright
  // would turn a single bad byte in storage into a permanently broken
  // popup (readSettings() is on the init() happy path for every open).
  it("a record with an invalid theme value migrates it to 'system' on read, rather than throwing", async () => {
    const store = memoryStore();
    store.data.settings = { checkoutReadingEnabled: false, theme: "midnight" };
    const ledger = new PlanLedger(store);

    const settings = (await ledger.readSettings()) as Settings;
    expect(settings.theme).toBe("system");
    expect(store.data.settings).toEqual({ checkoutReadingEnabled: false, theme: "system" });
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
    expect(settings.theme).toBe("system");
    expect((settings as unknown as Record<string, unknown>).measurementEnabled).toBeUndefined();

    // The migration WROTE BACK the cleaned record -- not just returned a
    // cleaned view of a still-dirty store. A second, independent read
    // must see it gone too.
    expect(store.data.settings).toEqual({ checkoutReadingEnabled: false, theme: "system" });
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
    expect(settings.theme).toBe("system");
    expect(store.data.settings).toEqual({ checkoutReadingEnabled: false, theme: "system" });
  });

  it("a malformed (non-object) settings value migrates to the safe default rather than throwing", async () => {
    const store = memoryStore();
    store.data.settings = "not-an-object";
    const ledger = new PlanLedger(store);

    const settings = (await ledger.readSettings()) as Settings;
    expect(settings.checkoutReadingEnabled).toBe(false);
    expect(settings.theme).toBe("system");
    expect(store.data.settings).toEqual({ checkoutReadingEnabled: false, theme: "system" });
  });
});

describe("PlanLedger.updateSettings -- the read-modify-write helper §4.5 step 5 requires", () => {
  it("a partial patch mentioning only checkoutReadingEnabled preserves the existing theme value", async () => {
    const store = memoryStore();
    const ledger = new PlanLedger(store);
    await ledger.writeSettings({ checkoutReadingEnabled: false, theme: "dark" });

    const settings = await ledger.updateSettings({ checkoutReadingEnabled: true });
    expect(settings.checkoutReadingEnabled).toBe(true);
    expect(settings.theme).toBe("dark");
    expect(store.data.settings).toEqual({ checkoutReadingEnabled: true, theme: "dark" });
  });

  it("a partial patch mentioning only theme preserves the existing checkoutReadingEnabled value", async () => {
    const store = memoryStore();
    const ledger = new PlanLedger(store);
    await ledger.writeSettings({ checkoutReadingEnabled: true, theme: "system" });

    const settings = await ledger.updateSettings({ theme: "light" });
    expect(settings.checkoutReadingEnabled).toBe(true);
    expect(settings.theme).toBe("light");
    expect(store.data.settings).toEqual({ checkoutReadingEnabled: true, theme: "light" });
  });

  // The never-onboarded case: settings === null (readSettings()'s
  // has-onboarded sentinel) must still produce a complete, valid record
  // for the untouched field -- this is what lets the onboarding screen's
  // Continue handler call updateSettings() instead of writeSettings()
  // without special-casing "there is nothing to merge with yet".
  it("on a never-onboarded install, a patch mentioning only one field still produces a complete record using DEFAULT_THEME/false for the other", async () => {
    const store = memoryStore();
    const ledger = new PlanLedger(store);
    expect(store.data.settings).toBeUndefined();

    const settings = await ledger.updateSettings({ checkoutReadingEnabled: true });
    expect(settings.checkoutReadingEnabled).toBe(true);
    expect(settings.theme).toBe(DEFAULT_THEME);
    expect(store.data.settings).toEqual({ checkoutReadingEnabled: true, theme: DEFAULT_THEME });
  });

  it("rejects an invalid theme in the patch, the same as writeSettings/validateSettings would", async () => {
    const store = memoryStore();
    const ledger = new PlanLedger(store);
    await expect(ledger.updateSettings({ theme: "invalid" as never })).rejects.toThrow(StorageSchemaError);
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

describe("PlanLedger.updatePlan — the real update path (edit-plan-spec §1.2/§9.1)", () => {
  it("replaces in place: with three plans, editing the middle one leaves it at index 1 and the array length at 3", async () => {
    const store = memoryStore();
    const ledger = new PlanLedger(store);
    await ledger.addPlan(plan({ id: "aaaaaa" }));
    await ledger.addPlan(plan({ id: "bbbbbb" }));
    await ledger.addPlan(plan({ id: "cccccc" }));

    await ledger.updatePlan(plan({ id: "bbbbbb", orderTotalCents: 12000 }));

    const plans = await ledger.listPlans();
    expect(plans).toHaveLength(3);
    expect(plans[1]?.id).toBe("bbbbbb");
    expect(plans[1]?.orderTotalCents).toBe(12000);
    expect(plans[0]?.id).toBe("aaaaaa");
    expect(plans[2]?.id).toBe("cccccc");
  });

  it("performs exactly ONE store.set call -- the atomicity guard. RED if updatePlan is ever reimplemented as remove-then-add", async () => {
    const store = countingStore();
    const ledger = new PlanLedger(store);
    await ledger.addPlan(validPlan);
    store.setCalls = 0; // only count the update itself

    await ledger.updatePlan(plan({ orderTotalCents: 12000 }));

    expect(store.setCalls).toBe(1);
  });

  it("preserves id and createdAt exactly as supplied by the caller, never inventing new ones", async () => {
    const store = memoryStore();
    const ledger = new PlanLedger(store);
    await ledger.addPlan(validPlan);

    const updated = await ledger.updatePlan(plan({ perInstallmentCents: 3000, orderTotalCents: 12000 }));

    expect(updated.id).toBe(validPlan.id);
    expect(updated.createdAt).toBe(validPlan.createdAt);
    const [stored] = await ledger.listPlans();
    expect(stored?.id).toBe(validPlan.id);
    expect(stored?.createdAt).toBe(validPlan.createdAt);
  });

  it("an id the ledger does not hold throws PlanNotFoundError and does NOT append -- the array is unchanged, not just \"it threw\"", async () => {
    const store = memoryStore();
    const ledger = new PlanLedger(store);
    await ledger.addPlan(validPlan);

    await expect(ledger.updatePlan(plan({ id: "doesnotexist" }))).rejects.toThrow(PlanNotFoundError);
    await expect(ledger.updatePlan(plan({ id: "doesnotexist" }))).rejects.toThrow(
      /no stored plan with id "doesnotexist"/,);

    const plans = await ledger.listPlans();
    expect(plans).toHaveLength(1);
    expect(plans[0]?.id).toBe(validPlan.id);
  });

  it("runs the full validatePlanRecord -- the closed-allowlist-both-directions guard applies to updates identically to adds", async () => {
    const store = memoryStore();
    const ledger = new PlanLedger(store);
    await ledger.addPlan(validPlan);

    const { source: _source, ...withoutSource } = plan();
    await expect(ledger.updatePlan(withoutSource)).rejects.toThrow(
      /missing required field "source"/,);
    await expect(ledger.updatePlan({ ...plan(), extraField: "x" })).rejects.toThrow(/non-allowlisted field/);
    await expect(ledger.updatePlan({ ...plan(), perInstallmentCents: 22.49 })).rejects.toThrow(/integer cents/);

    // None of the rejected calls above wrote anything.
    expect(await ledger.listPlans()).toHaveLength(1);
  });
});
