// @vitest-environment jsdom
/**
 * C3: the one permitted loosening of locateByCssOrLabel's exact-label
 * match -- a single trailing colon (EN, no space) or the FR "space +
 * colon" form is stripped before the exact Set-membership test. Verifies
 * both the loosening itself and that it does NOT reopen the frozen
 * substring/fuzzy-matching prohibition (C2): a label that merely CONTAINS
 * "total" as a substring (e.g. "Subtotal:", "Total due today:") must still
 * be refused.
 */
import { describe, expect, it } from "vitest";
import { locateByCssOrLabel } from "../../../src/engine/extraction-helpers";
import { GENERIC_ORDER_TOTAL_LABEL_LEXICON } from "../../../src/engine/generic-lexicon";
import { pageProbeFor } from "../../support/page-probe";

function mount(html: string): Document {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  document.body.replaceChildren();
  for (const child of [...parsed.body.childNodes]) {
    document.body.appendChild(document.importNode(child, true));
  }
  return document;
}

describe("locateByCssOrLabel — trailing-colon loosening (C3)", () => {
  it("matches 'Order total:' (EN, no space before the colon)", () => {
    const doc = mount("<div><span>Order total:</span><span>CAD 42.10</span></div>");
    const page = pageProbeFor(doc, "www.amazon.ca", "/gp/buy/spc/handlers/display.html");
    const found = locateByCssOrLabel(page, [], GENERIC_ORDER_TOTAL_LABEL_LEXICON);
    expect(found?.element.textContent).toBe("CAD 42.10");
  });

  it("matches 'Total de la commande :' (FR, one space before the colon)", () => {
    const doc = mount("<div><span>Total de la commande :</span><span>CAD 15.00</span></div>");
    const page = pageProbeFor(doc, "www.amazon.ca", "/gp/buy/spc/handlers/display.html");
    const found = locateByCssOrLabel(page, [], GENERIC_ORDER_TOTAL_LABEL_LEXICON);
    expect(found?.element.textContent).toBe("CAD 15.00");
  });

  it("without the loosening this would be blank -- sanity: a label with TWO trailing colons is not silently double-stripped into a match it shouldn't have", () => {
    // "order total::" strips to "order total:", which still is not in the
    // lexicon -- only a SINGLE trailing colon is the permitted loosening.
    const doc = mount("<div><span>Order total::</span><span>CAD 42.10</span></div>");
    const page = pageProbeFor(doc, "www.amazon.ca", "/checkout/pay");
    expect(locateByCssOrLabel(page, [], GENERIC_ORDER_TOTAL_LABEL_LEXICON)).toBeNull();
  });

  it("still refuses substring/fuzzy matches -- 'Subtotal:' never matches 'total'", () => {
    const doc = mount("<div><span>Subtotal:</span><span>CAD 74.99</span></div>");
    const page = pageProbeFor(doc, "www.amazon.ca", "/checkout/pay");
    expect(locateByCssOrLabel(page, [], GENERIC_ORDER_TOTAL_LABEL_LEXICON)).toBeNull();
  });

  it("still refuses substring/fuzzy matches -- 'Total due today:' never matches 'total'", () => {
    const doc = mount("<div><span>Total due today:</span><span>CAD 74.99</span></div>");
    const page = pageProbeFor(doc, "www.amazon.ca", "/checkout/pay");
    expect(locateByCssOrLabel(page, [], GENERIC_ORDER_TOTAL_LABEL_LEXICON)).toBeNull();
  });
});
