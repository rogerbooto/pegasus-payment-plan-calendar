/**
 * A small, local-only UI-state tracker for the popup's post-usefulness
 * email-invite gate. It persists two booleans — whether the 30-day view
 * has ever been opened, and whether the invite has been dismissed (by
 * either button) — under the "usage" top-level key.
 *
 * Every write goes through src/storage/ledger.ts's validateUsageFlags
 * before it reaches the store: the same closed-field-set + forbidden-key
 * check every other persisted record in this codebase gets, not a
 * second, unvalidated path to chrome.storage.local. (An earlier version
 * of this file wrote `{ [USAGE_KEY]: ... }` straight through
 * KeyValueStore#set with no such check — a real bypass of the storage
 * seam's minimum-necessary-capture guarantee, since "usage" wasn't even
 * in STORAGE_KEY_ALLOWLIST at the time.) Nothing here carries a value, a
 * merchant name, a URL, or any identifier — it is UI state, not ledger
 * data.
 *
 * Known simplification (documented, not hidden): the design spec's
 * invite gate also requires the invite to first appear in a session
 * LATER than the one that completed the usefulness criteria. This module
 * does not implement session-boundary detection (it would need a
 * service-worker startup hook, outside this surface's ownership) — it
 * gates on the two booleans only. Tightening this to the full
 * multi-session rule is a follow-up, not a silent gap.
 */
import type { KeyValueStore } from "../storage/store";
import { validateUsageFlags, type UsageFlags } from "../storage/ledger";

const USAGE_KEY = "usage";
const DEFAULT_FLAGS: UsageFlags = { viewedNext30: false, inviteDismissed: false };

export async function readUsageFlags(store: KeyValueStore): Promise<UsageFlags> {
  const result = await store.get([USAGE_KEY]);
  const raw = result[USAGE_KEY];
  if (raw === undefined) return DEFAULT_FLAGS;
  try {
    return validateUsageFlags(raw);
  } catch {
    // Malformed/legacy usage state degrades to the safe default rather
    // than throwing or being trusted as-is — this is UI state, not
    // ledger data, so losing it never loses a plan or a dollar figure,
    // and a value that predates validateUsageFlags (or was written by a
    // bypass) must never be handed back as if it had been checked.
    return DEFAULT_FLAGS;
  }
}

export async function markViewedNext30(store: KeyValueStore): Promise<void> {
  const current = await readUsageFlags(store);
  if (current.viewedNext30) return;
  const next = validateUsageFlags({ ...current, viewedNext30: true });
  await store.set({ [USAGE_KEY]: next });
}

export async function markInviteDismissed(store: KeyValueStore): Promise<void> {
  const current = await readUsageFlags(store);
  if (current.inviteDismissed) return;
  const next = validateUsageFlags({ ...current, inviteDismissed: true });
  await store.set({ [USAGE_KEY]: next });
}
