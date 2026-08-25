/**
 * Usage measurement is opt-in, off by default, and financially blind: bare
 * event counts from a closed enum, never amounts, merchants, URLs, or page
 * content. The allowlists below are the complete measurement surface;
 * adding an event or a prop is a reviewed schema change, not a call-site
 * edit.
 */

export const EVENT_NAMES = [
  "overlay_shown",
  "overlay_degraded",
  "impact_expanded",
  "plan_added",
  "overlay_dismissed",
] as const;

export type EventName = (typeof EVENT_NAMES)[number];

/**
 * Per-event prop allowlist: prop name -> allowed values. Events absent here
 * or props absent per event are rejected at the send seam.
 */
export const EVENT_PROP_ALLOWLIST: Readonly<
  Record<EventName, Readonly<Record<string, readonly string[]>>>
> = {
  overlay_shown: {},
  overlay_degraded: {},
  impact_expanded: {},
  plan_added: { method: ["manual", "checkout_confirmed"] },
  overlay_dismissed: {},
};

/**
 * Key names that must never appear as a prop key on any event, regardless
 * of allowlist edits — a tripwire for the data classes measurement is
 * forbidden to carry.
 */
export const FORBIDDEN_PROP_KEYS = [
  "amount",
  "cents",
  "total",
  "price",
  "value",
  "currency",
  "merchant",
  "store",
  "url",
  "href",
  "domain",
  "host",
  "path",
  "cart",
  "item",
  "sku",
  "email",
  "name",
  "token",
  "session",
  "id",
] as const;
