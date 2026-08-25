/**
 * Test-only helper: loads a static, checked-in adversarial DOM fixture
 * file from tests/fixtures/dom/** and its JSON ground-truth sidecar. Never
 * fetches a live merchant page — file:// reads of the repo's own fixture
 * corpus only.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_ROOT = join(HERE, "..", "fixtures", "dom");

export function loadFixtureHtml(category: string, name: string): string {
  return readFileSync(join(FIXTURE_ROOT, category, `${name}.html`), "utf-8");
}

export function loadFixtureSidecar<T = Record<string, unknown>>(category: string, name: string): T {
  const raw = readFileSync(join(FIXTURE_ROOT, category, `${name}.json`), "utf-8");
  return JSON.parse(raw) as T;
}

/**
 * Mounts a fixture's <body> content into the current jsdom document and
 * returns it. Uses DOMParser + node imports rather than an innerHTML
 * assignment — the same banned-sink lint rule that keeps merchant text out
 * of the overlay applies here too, and this achieves the same result
 * without it.
 */
export function mountFixture(category: string, name: string): Document {
  const html = loadFixtureHtml(category, name);
  const parsed = new DOMParser().parseFromString(html, "text/html");
  document.body.replaceChildren();
  for (const child of [...parsed.body.childNodes]) {
    document.body.appendChild(document.importNode(child, true));
  }
  return document;
}
