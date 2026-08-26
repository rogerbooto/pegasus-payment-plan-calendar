/**
 * The one PageProbe implementation backed by a real Document. Adapters and
 * the generic detector never touch `document`/`window` directly (the design spec:
 * "adapters never touch `document` directly ... impossible for an adapter
 * to acquire capabilities the engine didn't grant"); this is the seam that
 * does, and it grants nothing beyond read-only querying.
 */
import type { PageProbe } from "./types";

export function createDomPageProbe(doc: Document): PageProbe {
  const win = doc.defaultView;
  return {
    host: win?.location.host ?? "",
    path: win?.location.pathname ?? "",
    querySelector(selector: string): Element | null {
      return doc.querySelector(selector);
    },
    querySelectorAll(selector: string): readonly Element[] {
      return [...doc.querySelectorAll(selector)];
    },
  };
}
