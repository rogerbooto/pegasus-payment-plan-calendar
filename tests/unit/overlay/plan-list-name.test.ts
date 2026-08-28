/**
 * @vitest-environment jsdom
 *
 * The plan row's rendering of the user-typed name (PlanList.ts is the ONE
 * row builder both the popup hero and the overlay's "Plans you've entered"
 * tab share, so this covers both surfaces at once). jsdom does no layout,
 * so every assertion here is structural — which element exists, what text
 * it carries, what the accessible name is — never geometry; the ellipsis
 * truncation itself is CSS (`.rows .name`, src/overlay/theme.ts) and is
 * pinned by the stylesheet test below rather than by measuring pixels.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildPlanRow, buildPlanRows } from "../../../src/overlay/PlanList";
import { OVERLAY_CSS } from "../../../src/overlay/theme";
import * as copy from "../../../src/overlay/copy";
import type { PaymentPlanRecord } from "../../../src/shared/types";
import { assertCents } from "../../../src/shared/money";

beforeEach(() => {
  document.body.replaceChildren();
});

function plan(overrides: Partial<PaymentPlanRecord> = {}): PaymentPlanRecord {
  return {
    id: "a1b2c3",
    createdAt: "2026-06-01",
    source: "checkout_confirmed",
    currency: "CAD",
    orderTotalCents: assertCents(15000, "total"),
    installmentCount: 4,
    cadence: "BIWEEKLY",
    perInstallmentCents: assertCents(3750, "each"),
    firstPaymentDate: "2026-08-27",
    customName: "",
    ...overrides,
  };
}

const handlers = { onEdit: vi.fn(), onRemove: vi.fn() };

describe("plan row — the user-typed name", () => {
  it("renders a .name span with the typed text when customName is present", () => {
    const row = buildPlanRow(plan({ customName: "Laptop" }), handlers);
    const name = row.querySelector(".name");
    expect(name).not.toBeNull();
    expect(name?.textContent).toBe("Laptop");
  });

  it("renders NO .name element at all when customName is '' — an unnamed plan's row anatomy is exactly the pre-feature shape", () => {
    const row = buildPlanRow(plan({ customName: "" }), handlers);
    expect(row.querySelector(".name")).toBeNull();
    // The rest of the anatomy is untouched either way.
    for (const cls of [".date", ".dow", ".amt", ".sub"]) {
      expect(row.querySelector(cls), `${cls} should exist`).not.toBeNull();
    }
  });

  it("markup-shaped typed text renders as literal characters, never as elements (textContent, not parsing)", () => {
    const row = buildPlanRow(plan({ customName: "<b>Laptop</b>" }), handlers);
    const name = row.querySelector(".name");
    expect(name?.textContent).toBe("<b>Laptop</b>");
    expect(name?.querySelector("b")).toBeNull();
  });

  it("the name joins BOTH row buttons' accessible names — the two same-day rows the feature exists to tell apart become distinguishable to a screen-reader user too", () => {
    const row = buildPlanRow(plan({ customName: "Laptop" }), handlers);
    const [editBtn, removeBtn] = [...row.querySelectorAll("button")];
    expect(editBtn?.textContent).toContain("Laptop");
    expect(removeBtn?.textContent).toContain("Laptop");
    // SC 2.5.3 Label in Name: the visible word still STARTS the accessible name.
    expect(editBtn?.textContent?.startsWith(copy.EDIT_ACTION_SHORT)).toBe(true);
    expect(removeBtn?.textContent?.startsWith(copy.REMOVE_ACTION_SHORT)).toBe(true);
  });

  it("an unnamed plan's button suffix is byte-identical to the pre-feature suffix — no stray separator appears for ''", () => {
    expect(copy.planRowLabelSuffix("Aug 27", "$37.50")).toBe(" the plan starting Aug 27, $37.50 each");
    expect(copy.planRowLabelSuffix("Aug 27", "$37.50", "")).toBe(" the plan starting Aug 27, $37.50 each");
    expect(copy.planRowLabelSuffix("Aug 27", "$37.50", "Laptop")).toBe(" Laptop — the plan starting Aug 27, $37.50 each");
  });

  it("three same-day plans render in stable storage order with their names, so the founder's three 'Aug 27' rows are told apart", () => {
    const plans = [
      plan({ id: "one", customName: "Laptop" }),
      plan({ id: "two", customName: "Headphones" }),
      plan({ id: "three", customName: "" }),
    ];
    const rows = buildPlanRows(plans, handlers);
    const names = [...rows.querySelectorAll("li")].map((li) => li.querySelector(".name")?.textContent ?? null);
    expect(names).toEqual(["Laptop", "Headphones", null]);
  });

  it("the shared stylesheet gives .rows .name a full-width, single-line, ellipsis-truncated treatment (the 340px-popup fit, pinned as text since jsdom cannot measure)", () => {
    const rule = OVERLAY_CSS.split("\n").find((line) => line.includes(".rows .name"));
    expect(rule).toBeDefined();
    for (const decl of ["width: 100%", "white-space: nowrap", "overflow: hidden", "text-overflow: ellipsis"]) {
      expect(rule, `.rows .name should declare ${decl}`).toContain(decl);
    }
  });
});
