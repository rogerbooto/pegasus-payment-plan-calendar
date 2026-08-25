/**
 * Overlay-local display and form-input helpers. Money formatting for
 * cents -> string still goes through src/shared/format.ts (the single
 * sanctioned module, per its own header) — nothing here reimplements that
 * direction. What lives here is:
 *   - date display (§5.4: "MMM d" dates, a separate dimmer weekday token,
 *     never a locale-ambiguous numeric date), computed UTC-anchored to
 *     match src/impact/engine.ts's IsoDate model exactly;
 *   - the one direction src/shared/format.ts does not cover: turning a
 *     user-typed confirmation-form string back into integer cents, using
 *     only integer digit-string parsing (src/shared/money.ts), never
 *     parseFloat/Number(). An unparsable string returns null (degrade,
 *     never guess) rather than coercing.
 */
import { centsFromDigitStrings, type Cents } from "../shared/money";
import type { IsoDate } from "../shared/types";

const MONTH_ABBR = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

const WEEKDAY_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function toUtcDate(date: IsoDate): Date {
  const match = ISO_DATE_PATTERN.exec(date);
  if (!match) throw new Error(`overlay/format-helpers: invalid ISO date "${date}"`);
  const [, y, m, d] = match as unknown as [string, string, string, string];
  return new Date(Date.UTC(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10)));
}

/** "Jun 3" — never a numeric locale-ambiguous date. */
export function formatMonthDay(date: IsoDate): string {
  const dt = toUtcDate(date);
  return `${MONTH_ABBR[dt.getUTCMonth()]} ${dt.getUTCDate()}`;
}

/** "Wed" — rendered as a separate, dimmer token from the date itself. */
export function formatWeekday(date: IsoDate): string {
  const dt = toUtcDate(date);
  return WEEKDAY_ABBR[dt.getUTCDay()] as string;
}

/** Today's date as an IsoDate, UTC-anchored (matches impact/engine's model). */
export function todayIsoDate(clock: () => Date = () => new Date()): IsoDate {
  const now = clock();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const MONEY_INPUT_PATTERN = /^\$?\s*(\d{1,3}(?:,\d{3})*|\d+)(?:\.(\d{2}))?$/;

/**
 * Parses a confirmation-form money field ("$150.00", "150", "1,234.56")
 * into Cents using only integer digit-string arithmetic. Returns null on
 * anything that does not match exactly — this never guesses at an
 * ambiguous or malformed value; it is the same refuse-over-guess posture
 * as src/parser/money.ts, applied to user-typed text instead of scraped
 * DOM text.
 */
export function parseMoneyInput(raw: string, field: string): Cents | null {
  const trimmed = raw.trim();
  const match = MONEY_INPUT_PATTERN.exec(trimmed);
  if (!match) return null;
  const whole = (match[1] as string).replace(/,/g, "");
  const fraction = match[2] ?? "";
  try {
    return centsFromDigitStrings(whole, fraction, field);
  } catch {
    return null;
  }
}
