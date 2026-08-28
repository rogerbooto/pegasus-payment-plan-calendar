/**
 * The structural pin for `PaymentPlanRecord.customName`'s defining
 * constraint: the name is USER-TYPED, never read from the page. The
 * founder first asked for the merchant name, then the product name — both
 * refused (FORBIDDEN_KEY_SUBSTRINGS, src/storage/ledger.ts: data classes
 * the extension refuses to hold) — and accepted the user-typed field on
 * the reasoning that a local file of what someone buys on credit is the
 * single most sensitive artifact this product could create. A test that
 * the field is merely *usually* empty would be worthless; this file pins
 * the structure that makes engine-populated names impossible, in three
 * layers:
 *
 * 1. The extraction path cannot NAME the field: no file in src/engine,
 *    src/parser (excluding confirmation.ts — the record builder whose
 *    UI-supplied meta is where the name legitimately enters), src/impact,
 *    src/messaging, src/telemetry or src/config mentions `customName` at
 *    all. Code cannot populate a field it cannot spell.
 * 2. The confirmation gate cannot CARRY it: confirmPlan() builds its
 *    return object from exactly the five numeric/enum value fields, so
 *    even a caller that smuggles an extra property into `values` gets a
 *    ConfirmedPlanInput without it. ConfirmedPlanValues is the only
 *    bridge from an engine candidate to a storable record.
 * 3. The field's own name matches no forbidden-data-class substring
 *    (checked against the real list in tests/unit/storage-ledger.test.ts),
 *    so the belt-and-braces key scan and this field can coexist forever.
 *
 * RED when: an extraction-side module starts mentioning the field, or
 * confirmPlan() starts passing through properties it did not construct.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { confirmPlan, type ConfirmedPlanValues } from "../../src/parser/confirmation";
import { assertCents } from "../../src/shared/money";

const SRC_ROOT = join(process.cwd(), "src");

/**
 * Everything between a page's DOM and a storable record, EXCEPT the two
 * layers where the user-typed name legitimately lives:
 * - src/overlay + src/popup + src/welcome (the forms the user types into),
 * - src/storage (the validator), src/shared (the type definition),
 * - src/parser/confirmation.ts (the record builder whose meta carries the
 *   typed name from the form — its `values` side is pinned by the runtime
 *   test below instead).
 */
const EXTRACTION_SIDE_DIRS = ["engine", "parser", "impact", "messaging", "telemetry", "config"] as const;
const EXCLUDED_FILE = join(SRC_ROOT, "parser", "confirmation.ts");

const FIELD_NAME_PATTERN = /customName/i;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) out.push(...walk(full));
    else if (entry.endsWith(".ts")) out.push(full);
  }
  return out;
}

describe("customName is user-typed only — the extraction path cannot populate it (structural)", () => {
  const files = EXTRACTION_SIDE_DIRS.flatMap((d) => walk(join(SRC_ROOT, d))).filter((f) => f !== EXCLUDED_FILE);

  it("liveness — found a non-trivial extraction-side corpus to scan", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it("liveness — the scanner catches a planted mention, in any casing", () => {
    expect(FIELD_NAME_PATTERN.test('const record = { customName: extracted };')).toBe(true);
    expect(FIELD_NAME_PATTERN.test('record["CUSTOMNAME"] = merchantText;')).toBe(true);
    expect(FIELD_NAME_PATTERN.test("const orderTotalCents = 8996;")).toBe(false);
  });

  it("liveness — the field DOES exist where it is supposed to (the scanner is not matching nothing everywhere): the validator, the type, the form layer, and the excluded builder all spell it", () => {
    for (const legit of [
      join(SRC_ROOT, "storage", "ledger.ts"),
      join(SRC_ROOT, "shared", "types.ts"),
      join(SRC_ROOT, "overlay", "ConfirmationSheet.ts"),
      EXCLUDED_FILE,
    ]) {
      expect(FIELD_NAME_PATTERN.test(readFileSync(legit, "utf-8")), `${legit} should mention customName`).toBe(true);
    }
  });

  it.each(files.map((f) => [f] as const))("%s never mentions customName — the extraction path cannot spell the field it must never fill", (file) => {
    const src = readFileSync(file, "utf-8");
    expect(FIELD_NAME_PATTERN.test(src), `${file} mentions customName`).toBe(false);
  });

  it("confirmPlan() constructs a fresh five-field object — a name-shaped property smuggled into `values` does not survive the gate", () => {
    const values: ConfirmedPlanValues = {
      orderTotalCents: assertCents(8996, "total"),
      installmentCount: 4,
      cadence: "BIWEEKLY",
      perInstallmentCents: assertCents(2249, "each"),
      currency: "CAD",
    };
    const smuggled = { ...values } as ConfirmedPlanValues & Record<string, unknown>;
    smuggled["customName"] = "SMUGGLED FROM A PAGE";

    const confirmed = confirmPlan({ confirmed: true, values: smuggled });

    // Exactly the five value fields, nothing else: the gate cannot carry a
    // name (or anything besides the numbers the user confirmed) even when
    // its caller tries to.
    expect(Object.keys(confirmed).sort()).toEqual(
      ["cadence", "currency", "installmentCount", "orderTotalCents", "perInstallmentCents"].sort(),);
    expect((confirmed as unknown as Record<string, unknown>)["customName"]).toBeUndefined();
  });
});
