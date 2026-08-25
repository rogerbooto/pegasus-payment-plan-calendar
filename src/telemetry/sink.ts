/**
 * The measurement seam. Every event passes validateEvent before anything
 * else may happen to it; the default sink is a no-op (measurement is
 * opt-in, off by default). No transport exists in this codebase today — the
 * network tab of this extension is empty — and introducing one is a
 * reviewed change to this module only.
 */
import { EVENT_NAMES, EVENT_PROP_ALLOWLIST, FORBIDDEN_PROP_KEYS, type EventName } from "./constants";

export interface MeasurementSink {
  record(event: EventName, props?: Readonly<Record<string, string>>): void;
}

/** Throws unless the event and every prop are inside the closed allowlists. */
export function validateEvent(event: string, props?: Readonly<Record<string, string>>): void {
  if (!(EVENT_NAMES as readonly string[]).includes(event)) {
    throw new Error(`unknown measurement event "${event}"`);
  }
  if (!props) return;
  const allowlist = EVENT_PROP_ALLOWLIST[event as EventName];
  for (const [key, value] of Object.entries(props)) {
    const lower = key.toLowerCase();
    for (const forbidden of FORBIDDEN_PROP_KEYS) {
      if (lower.includes(forbidden)) {
        throw new Error(`prop key "${key}" matches forbidden class "${forbidden}"`);
      }
    }
    const allowedValues = allowlist[key];
    if (!allowedValues) throw new Error(`prop "${key}" is not allowlisted for "${event}"`);
    if (!allowedValues.includes(value)) {
      throw new Error(`prop "${key}" value is not allowlisted for "${event}"`);
    }
  }
}

/** Measurement disabled (the default): validate, then drop. */
export const noopSink: MeasurementSink = {
  record(event, props) {
    validateEvent(event, props);
  },
};
