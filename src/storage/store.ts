/**
 * The storage seam. All persistence goes through this interface;
 * chrome.storage.local is the only backing implementation, and
 * chromeLocalStore below is the ONLY place in src/ allowed to call
 * chrome.storage.local.set (a structural guard in the test suite pins the
 * call-site count at exactly one).
 */
export interface KeyValueStore {
  get(keys: readonly string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: readonly string[]): Promise<void>;
}

export const chromeLocalStore: KeyValueStore = {
  get(keys) {
    return chrome.storage.local.get([...keys]);
  },
  set(items) {
    return chrome.storage.local.set(items);
  },
  remove(keys) {
    return chrome.storage.local.remove([...keys]);
  },
};
