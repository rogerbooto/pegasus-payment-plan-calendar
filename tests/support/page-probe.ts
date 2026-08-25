/**
 * Test-only helper: builds a real PageProbe over a mounted fixture Document
 * with an explicit host/path, independent of jsdom's own (usually
 * about:blank) test URL. Production code never does this -- it always uses
 * src/engine/dom-page-probe.ts's createDomPageProbe, which reads the real
 * window.location. Tests need to exercise adapter host/path matching
 * against arbitrary fixture "sites" without navigating jsdom, so this
 * wraps the same read-only querySelector(All) contract with a fixed host
 * and path instead.
 */
import type { PageProbe } from "../../src/engine/types";

export function pageProbeFor(doc: Document, host: string, path: string): PageProbe {
  return {
    host,
    path,
    querySelector(selector: string): Element | null {
      return doc.querySelector(selector);
    },
    querySelectorAll(selector: string): readonly Element[] {
      return [...doc.querySelectorAll(selector)];
    },
  };
}
