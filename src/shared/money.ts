/**
 * The money type. Money is integer cents from the first moment it exists in
 * this codebase, and never a float.
 *
 * - `Cents` is a branded type: an arbitrary `number` does not typecheck where
 *   `Cents` is required. The only ways to obtain a `Cents` value are the
 *   constructors in this file, and every one of them throws on non-integers.
 * - `parseFloat` / `Number()` are additionally banned repo-wide by lint
 *   (eslint.config.mjs) and will be pinned by a static source scan in the
 *   test suite. Digit strings become cents via integer arithmetic only.
 * - Formatting cents back into a display string happens in exactly one
 *   module: src/shared/format.ts. Nothing else divides by 100.
 */
import { MoneyError } from "./errors";

declare const centsBrand: unique symbol;

/** An exact, non-negative-safe integer number of cents. Never a float. */
export type Cents = number & { readonly [centsBrand]: "cents" };

/**
 * The single runtime gate every money value crosses at a seam (storage
 * writes, impact-engine inputs). Throws loudly; never coerces, never rounds.
 */
export function assertCents(value: unknown, field: string): Cents {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new MoneyError(
      `${field} must be integer cents, got ${typeof value === "number" ? value : typeof value}`,
    );
  }
  return value as Cents;
}

/** As assertCents, but additionally requires a strictly positive amount. */
export function assertPositiveCents(value: unknown, field: string): Cents {
  const cents = assertCents(value, field);
  if (cents <= 0) {
    throw new MoneyError(`${field} must be a positive amount of cents, got ${cents}`);
  }
  return cents;
}

const DIGITS_ONLY = /^[0-9]+$/;

/**
 * Constructs cents from already-isolated digit strings using integer
 * arithmetic only — the whole-dollar digits and exactly zero or two fraction
 * digits. This is the only path from text to cents; parsing a raw checkout
 * money string down to these two digit groups is the money parser's job
 * (src/parser/money.ts), which rejects rather than guesses.
 */
export function centsFromDigitStrings(whole: string, fraction: string, field: string): Cents {
  if (!DIGITS_ONLY.test(whole)) {
    throw new MoneyError(`${field}: whole part must be digits only, got ${JSON.stringify(whole)}`);
  }
  if (fraction !== "" && !/^[0-9]{2}$/.test(fraction)) {
    throw new MoneyError(
      `${field}: fraction part must be empty or exactly two digits, got ${JSON.stringify(fraction)}`,
    );
  }
  const wholePart = parseInt(whole, 10);
  const fractionPart = fraction === "" ? 0 : parseInt(fraction, 10);
  return assertCents(wholePart * 100 + fractionPart, field);
}

/** Integer multiplication that stays in cents. */
export function multiplyCents(cents: Cents, factor: number): Cents {
  if (!Number.isSafeInteger(factor)) {
    throw new MoneyError(`multiplier must be a safe integer, got ${factor}`);
  }
  return assertCents(cents * factor, "product");
}

/** Integer addition that stays in cents. */
export function addCents(a: Cents, b: Cents): Cents {
  return assertCents(a + b, "sum");
}

export const ZERO_CENTS = 0 as Cents;
