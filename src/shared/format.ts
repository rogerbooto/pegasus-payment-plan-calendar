/**
 * The single sanctioned cents -> display-string module. Nothing else in the
 * codebase converts cents to dollars; all arithmetic stays in integer cents
 * and only this file renders them.
 */
import type { Cents } from "./money";
import type { Currency } from "./types";

/**
 * Formats integer cents as a currency display string using integer
 * arithmetic only (no division producing floats — trunc/modulo on integers).
 * Locale variants (e.g. French-style "37,50 $") land with the overlay task;
 * they will live here and only here.
 */
export function formatCents(cents: Cents, _currency: Currency): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const whole = Math.trunc(abs / 100);
  const fraction = String(abs % 100).padStart(2, "0");
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}$${grouped}.${fraction}`;
}
