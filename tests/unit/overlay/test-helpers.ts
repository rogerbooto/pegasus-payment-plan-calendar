/**
 * Test-only in-memory KeyValueStore, used by overlay and popup tests
 * instead of chrome.storage.local. It implements the exact same
 * KeyValueStore interface (src/storage/store.ts) so PlanLedger's own
 * validation runs unmodified against it.
 */
import type { KeyValueStore } from "../../../src/storage/store";

export function createFakeStore(initial: Record<string, unknown> = {}): KeyValueStore {
  const data: Record<string, unknown> = { ...initial };
  return {
    async get(keys) {
      const out: Record<string, unknown> = {};
      for (const k of keys) if (k in data) out[k] = data[k];
      return out;
    },
    async set(items) {
      Object.assign(data, items);
    },
    async remove(keys) {
      for (const k of keys) delete data[k];
    },
  };
}
