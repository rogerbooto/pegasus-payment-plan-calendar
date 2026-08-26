/**
 * The DOM -> cents boundary. A checkout money string is untrusted,
 * adversarial input: it becomes a validated integer-cents value under a
 * strict grammar, or it is rejected with a closed reason. There is no
 * best-effort mode, no rounding of malformed input, and no default value.
 *
 * Grammar: an optional, explicit CAD/USD currency marker; digit
 * groups with a consistent group separator; at most one decimal separator;
 * exactly 0 or 2 fraction digits. Cents are constructed by integer
 * arithmetic on the digit string via centsFromDigitStrings (never float
 * parsing). A single separator whose shape fits neither the EN-CA/US
 * grammar (comma = grouping, dot = decimal) nor the FR-CA grammar
 * (comma = decimal) is ambiguous and is rejected, never guessed — this is
 * the exact "1.234 with no other evidence" case named in the design spec
 *
 * This module does not itself strip bidi/zero-width/homoglyph characters —
 * that is src/parser/unicode.ts's job, run before this one at the call
 * site (the two are deliberately separate ExtractionCore methods). This
 * module still rejects anything outside its own strict charset as a
 * defense-in-depth backstop.
 */
import type { Cents } from "../shared/money";
import { centsFromDigitStrings, multiplyCents } from "../shared/money";
import { MoneyError } from "../shared/errors";
import type { Currency } from "../shared/types";
import { arithmeticToleranceCents, MAX_ORDER_TOTAL_CENTS } from "../shared/constants";

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

function rejected(reason: MoneyRejectReason): MoneyParseResult {
  return { kind: "rejected", reason };
}

/** A restrictive prefix marker: matched only in a leading position. */
const PREFIX_MARKERS: ReadonlyArray<{ pattern: RegExp; currency: Currency }> = [
  { pattern: /^CA\$\s*/i, currency: "CAD" },
  { pattern: /^US\$\s*/i, currency: "USD" },
  { pattern: /^CAD\s+/i, currency: "CAD" },
  { pattern: /^USD\s+/i, currency: "USD" },
];

/** A restrictive suffix marker: matched only in a trailing position. */
const SUFFIX_MARKERS: ReadonlyArray<{ pattern: RegExp; currency: Currency }> = [
  { pattern: /\s+CAD$/i, currency: "CAD" },
  { pattern: /\s+USD$/i, currency: "USD" },
  // The FR-CA trailing bare-$ form ("37,50 $"). A LEADING bare "$" is
  // deliberately NOT accepted here (see extractCurrency) — that is exactly
  // the "$ alone in a CA context" ambiguity the design spec names as an attack: a
  // leading bare $ could be CAD or USD, so it is rejected, never guessed.
  { pattern: /\s*\$$/, currency: "CAD" },
];

/** Currency words/symbols we recognize but do not support at launch. */
const UNSUPPORTED_CURRENCY = /€|£|¥|\bEUR\b|\bGBP\b|\bMXN\b|\bJPY\b/i;

interface CurrencyExtraction {
  readonly currency: Currency;
  readonly remainder: string;
}

function extractCurrency(text: string): CurrencyExtraction | MoneyRejectReason {
  for (const marker of PREFIX_MARKERS) {
    if (marker.pattern.test(text)) {
      return { currency: marker.currency, remainder: text.replace(marker.pattern, "") };
    }
  }
  for (const marker of SUFFIX_MARKERS) {
    if (marker.pattern.test(text)) {
      return { currency: marker.currency, remainder: text.replace(marker.pattern, "") };
    }
  }
  if (UNSUPPORTED_CURRENCY.test(text)) return "unsupported_currency";
  // A bare "$" that reached here matched no prefix/suffix marker above —
  // i.e. it is in a leading position. Position-ambiguous, never guessed.
  if (text.includes("$")) return "no_currency_marker";
  return "no_currency_marker";
}

interface NumericSplit {
  readonly wholeDigits: string;
  readonly fractionDigits: string;
}

const DIGITS = /^[0-9]+$/;

function splitOnBothSeparators(text: string): NumericSplit | MoneyRejectReason {
  const lastComma = text.lastIndexOf(",");
  const lastDot = text.lastIndexOf(".");
  const decimalIsComma = lastComma > lastDot;
  const decimalChar = decimalIsComma ? "," : ".";
  const groupChar = decimalIsComma ? "." : ",";
  const decimalIndex = decimalIsComma ? lastComma : lastDot;
  const fractionDigits = text.slice(decimalIndex + 1);
  const integerPart = text.slice(0, decimalIndex);

  if (!DIGITS.test(fractionDigits) || fractionDigits.length !== 2) return "invalid_fraction_digits";
  if (integerPart.includes(decimalChar)) return "ambiguous_separators";

  const groups = integerPart.split(groupChar);
  if (groups.some((g) => g.length === 0 || !DIGITS.test(g))) return "invalid_character";
  const [firstGroup, ...restGroups] = groups;
  if (firstGroup === undefined || firstGroup.length < 1 || firstGroup.length > 3) {
    return "ambiguous_separators";
  }
  if (restGroups.some((g) => g.length !== 3)) return "ambiguous_separators";

  return { wholeDigits: groups.join(""), fractionDigits };
}

function splitOnOneSeparatorKind(text: string, sep: "," | "."): NumericSplit | MoneyRejectReason {
  const parts = text.split(sep);
  if (parts.some((p) => p.length === 0 || !DIGITS.test(p))) return "invalid_character";

  if (parts.length === 1) {
    const [whole] = parts;
    return { wholeDigits: whole ?? "", fractionDigits: "" };
  }

  if (parts.length === 2) {
    const [intPart, fracPart] = parts as [string, string];
    if (fracPart.length === 2) {
      // Unambiguous decimal: EN-CA/US "37.50" or FR-CA "37,50".
      return { wholeDigits: intPart, fractionDigits: fracPart };
    }
    if (sep === "," && fracPart.length === 3 && intPart.length >= 1 && intPart.length <= 3) {
      // Unambiguous EN-CA/US grouping with no decimal shown: "1,234".
      return { wholeDigits: intPart + fracPart, fractionDigits: "" };
    }
    if (sep === "." && fracPart.length === 3) {
      // the design spec's named example: dot is our locales' decimal separator, so
      // a 3-digit tail after a single dot fits neither grammar cleanly.
      return "ambiguous_separators";
    }
    return "invalid_fraction_digits";
  }

  // More than one occurrence of the same separator: only a grouping chain
  // is possible (a decimal separator appears at most once). Comma-grouping
  // is EN-CA/US-canonical; multi-dot grouping matches neither supported
  // locale's grammar and is rejected rather than assumed to be EU-style.
  if (sep === ".") return "ambiguous_separators";
  const [firstGroup, ...restGroups] = parts;
  if (firstGroup === undefined || firstGroup.length < 1 || firstGroup.length > 3) {
    return "ambiguous_separators";
  }
  if (restGroups.some((g) => g.length !== 3)) return "ambiguous_separators";
  return { wholeDigits: parts.join(""), fractionDigits: "" };
}

function splitNumeric(text: string): NumericSplit | MoneyRejectReason {
  const hasComma = text.includes(",");
  const hasDot = text.includes(".");
  if (hasComma && hasDot) return splitOnBothSeparators(text);
  if (hasComma) return splitOnOneSeparatorKind(text, ",");
  if (hasDot) return splitOnOneSeparatorKind(text, ".");
  if (!DIGITS.test(text)) return "invalid_character";
  return { wholeDigits: text, fractionDigits: "" };
}

const REMAINDER_CHARSET = /^-?[0-9,.]+$/;

export function parseMoneyToCents(raw: string): MoneyParseResult {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return rejected("empty");

  const extraction = extractCurrency(trimmed);
  if (typeof extraction === "string") return rejected(extraction);
  const { currency, remainder } = extraction;

  const numericText = remainder.trim();
  if (numericText.length === 0) return rejected("empty");

  if (!REMAINDER_CHARSET.test(numericText)) return rejected("invalid_character");
  const negative = numericText.startsWith("-");
  const magnitude = negative ? numericText.slice(1) : numericText;

  const split = splitNumeric(magnitude);
  if (typeof split === "string") return rejected(split);

  let cents: Cents;
  try {
    cents = centsFromDigitStrings(split.wholeDigits, split.fractionDigits, "orderTotal");
  } catch (err) {
    if (err instanceof MoneyError) return rejected("invalid_character");
    throw err;
  }

  if (negative || cents === 0) return rejected("non_positive");
  if (cents > MAX_ORDER_TOTAL_CENTS) return rejected("above_sanity_cap");

  return { kind: "parsed", cents, currency };
}

/**
 * the design spec hard gate 3 / D3 T07: |count x perInstallment - orderTotal| <=
 * count (cents) — the standard pay-in-four rounding tolerance, the first
 * installment absorbing the remainder. A larger delta (typically tax or
 * shipping folded into the total after the instalment widget was quoted)
 * fails the gate for the pair and must be surfaced, never silently
 * reconciled — this function only reports; it never adjusts either value.
 */
export function arithmeticConsistent(
  installmentCount: number,
  perInstallmentCents: Cents,
  orderTotalCents: Cents,): boolean {
  const product = multiplyCents(perInstallmentCents, installmentCount);
  const delta = Math.abs(product - orderTotalCents);
  return delta <= arithmeticToleranceCents(installmentCount);
}
