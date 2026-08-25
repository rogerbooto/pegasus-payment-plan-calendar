/**
 * Resolves a matched cadence phrase (the {cadence} capture from
 * src/engine/pattern-compiler.ts) to the closed Cadence enum, or null when
 * the phrase names a cadence this product doesn't model (e.g. "every 3
 * weeks" has no WEEKLY/BIWEEKLY/MONTHLY equivalent). Unresolved cadence is
 * a missing scalar upstream, never a guess -- the same "never guessed"
 * posture as the money parser (D6 §D.2).
 */
import type { Cadence } from "../shared/types";

function weeksToCadence(weeks: number): Cadence | null {
  if (weeks === 1) return "WEEKLY";
  if (weeks === 2) return "BIWEEKLY";
  return null;
}

export function resolveCadencePhrase(raw: string | undefined): Cadence | null {
  if (raw === undefined) return null;
  const t = raw.trim().toLowerCase().replace(/\s+/g, " ");
  if (t === "weekly" || t === "every week" || t === "chaque semaine") return "WEEKLY";
  if (t === "monthly" || t === "every month" || t === "chaque mois") return "MONTHLY";

  const enWeeks = /^every (\d+) weeks?$/.exec(t);
  if (enWeeks?.[1]) return weeksToCadence(parseInt(enWeeks[1], 10));

  const frWeeks = /^aux (\d+) semaines$/.exec(t);
  if (frWeeks?.[1]) return weeksToCadence(parseInt(frWeeks[1], 10));

  return null;
}
