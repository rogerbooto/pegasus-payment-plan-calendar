/**
 * A small, local-only UI-state tracker for the popup's post-usefulness
 * email-invite gate. It persists two
 * booleans — whether the 30-day view has ever been opened, and whether the
 * invite has been dismissed (by either button) — via the same validated
 * storage seam every other local-only write in this codebase uses
 * (src/storage/store.ts's chromeLocalStore, the sole call site of
 * chrome.storage.local.set). Nothing here carries a value, a merchant
 * name, a URL, or any identifier — it is UI state, not ledger data, so it
 * lives under its own top-level key rather than inside PlanLedger's closed
 * plan/settings schema.
 *
 * Known simplification (documented, not hidden): §E.4 also requires the
 * invite to first appear in a session LATER than the one that completed
 * the usefulness criteria. This module does not implement session-boundary
 * detection (it would need a service-worker startup hook, outside this
 * surface's ownership) — it gates on the two booleans only. Tightening
 * this to the full multi-session rule is a follow-up, not a silent gap.
 */
import type { KeyValueStore } from "../storage/store";

export interface UsageFlags {
  readonly viewedNext30: boolean;
  readonly inviteDismissed: boolean;
}

const USAGE_KEY = "usage";
const DEFAULT_FLAGS: UsageFlags = { viewedNext30: false, inviteDismissed: false };

export async function readUsageFlags(store: KeyValueStore): Promise<UsageFlags> {
  const result = await store.get([USAGE_KEY]);
  const raw = result[USAGE_KEY];
  if (typeof raw !== "object" || raw === null) return DEFAULT_FLAGS;
  const r = raw as Record<string, unknown>;
  return {
    viewedNext30: r.viewedNext30 === true,
    inviteDismissed: r.inviteDismissed === true,
  };
}

export async function markViewedNext30(store: KeyValueStore): Promise<void> {
  const current = await readUsageFlags(store);
  if (current.viewedNext30) return;
  await store.set({ [USAGE_KEY]: { ...current, viewedNext30: true } });
}

export async function markInviteDismissed(store: KeyValueStore): Promise<void> {
  const current = await readUsageFlags(store);
  if (current.inviteDismissed) return;
  await store.set({ [USAGE_KEY]: { ...current, inviteDismissed: true } });
}
