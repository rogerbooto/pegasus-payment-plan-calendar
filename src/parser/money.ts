/**
 * The DOM -> cents boundary. A checkout money string is untrusted,
 * adversarial input: it becomes a validated integer-cents value under a
 * strict grammar, or it is rejected with a closed reason. There is no
 * best-effort mode, no rounding of malformed input, and no default value.
 *
 * Implementation lands with the DOM-parsing task. The contract below is
 * binding on that implementation:
 * - strict grammar: optional currency marker (CAD/USD families only),
 *   consistent group separators, at most one decimal separator, exactly 0 or
 *   2 fraction digits;
 * - cents are constructed by integer arithmetic on the digit string via
 *   centsFromDigitStrings (src/shared/money.ts) — never by float parsing;
 * - ambiguity is rejected, never guessed;
 * - rejection routes to the engine's degradation states.
 */
import type { Cents } from "../shared/money";
import type { Currency } from "../shared/types";
import { NotImplementedError } from "../shared/errors";

/** Closed rejection enum. Rejections carry no page data. */
export type MoneyRejectReason =
  | "empty"
  | "no_currency_marker"
  | "unsupported_currency"
  | "ambiguous_separators"
  | "invalid_fraction_digits"
  | "non_positive"
  | "above_sanity_cap"
  | "invalid_character";

export type MoneyParseResult =
  | { readonly kind: "parsed"; readonly cents: Cents; readonly currency: Currency }
  | { readonly kind: "rejected"; readonly reason: MoneyRejectReason };

export function parseMoneyToCents(_raw: string): MoneyParseResult {
  throw new NotImplementedError("parser/money#parseMoneyToCents");
}
