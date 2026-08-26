// Release-blocking guard: fails loudly if the built extension package
// (dist/manifest.json or any dist/*.js bundle) carries a dev-only host --
// one that only ever has meaning on the local fixture-testing build
// (`npm run build:dev`, scripts/build-dev.mjs, output to dist-dev/, see
// scripts/lib/dev-build.mjs). A localhost host permission escaping into a
// real release is exactly the kind of thing this project's
// minimum-necessary-access position exists to prevent.
//
// Same shape as scripts/lib/marketing-host-guard.mjs on purpose: a pure,
// filesystem-free detection module plus a thin CLI
// (scripts/release-check.mjs) that reads dist/ and calls it -- so the
// exact same code path runs in the CLI and in
// tests/static/dev-host-guard.test.ts.
//
// Self-reference check (the marketing-host guard's own trap, deliberately
// re-examined here rather than assumed not to apply): that guard has an
// UNAVOIDABLE self-reference -- MARKETING_HOST_CONFIGURED's own
// `.includes(".invalid")` check lives in src/popup/copy.ts, which DOES
// get bundled into dist/popup.js, so the literal substring ".invalid"
// appears in every build's output regardless of configuration state, and
// the guard has to specifically exclude that shape.
//
// This guard has no equivalent, for a structural reason: the strings it
// looks for (see DEV_ONLY_HOST_PATTERNS below) live ONLY in this file and
// scripts/release-check.mjs, both under scripts/ -- never an esbuild
// entry point (scripts/build.mjs's `entryPoints` are all under src/), so
// this file's own text can never end up inside dist/. That leaves one
// real question: does any src/ file legitimately need to contain
// "localhost" (or the other patterns below) for a non-dev reason today?
// The liveness test in tests/static/dev-host-guard.test.ts scans the real
// src/ tree and pins the answer as "no" -- if that ever changes, the test
// fails loudly and forces a reviewed decision (an exclusion, like the
// marketing guard's, or a rename), rather than a silent false-positive
// or a silent hole.
export const DEV_ONLY_HOST_PATTERNS = [
  { label: "localhost", pattern: /\blocalhost\b/ },
  { label: "127.0.0.1 (loopback)", pattern: /\b127\.0\.0\.1\b/ },
  { label: "0.0.0.0", pattern: /\b0\.0\.0\.0\b/ },
  // IPv6 loopback. Bounded on both sides against a longer address
  // (e.g. "::1234") so it does not fire on an unrelated hex/IPv6 literal
  // that merely contains this substring.
  { label: "::1 (IPv6 loopback)", pattern: /(?<![0-9a-fA-F:])::1(?![0-9a-fA-F:])/ },
];

/**
 * Returns the distinct pattern LABELS found in one file's text. Empty
 * array when the file is clean.
 */
export function findDevOnlyHostMatches(text) {
  const found = [];
  for (const { label, pattern } of DEV_ONLY_HOST_PATTERNS) {
    if (pattern.test(text)) found.push(label);
  }
  return found;
}

/**
 * Scans a list of `{ path, text }` entries -- already-read file contents,
 * so this module never touches the filesystem itself. Returns one entry
 * per (file, label) hit; empty when nothing is found anywhere.
 */
export function scanForDevOnlyHosts(files) {
  const hits = [];
  for (const { path, text } of files) {
    for (const label of findDevOnlyHostMatches(text)) {
      hits.push({ path, match: label });
    }
  }
  return hits;
}

/**
 * The actionable, release-blocking message. Names the exact files found
 * and the most likely cause (a dev build's output copied or confused with
 * the shipping one).
 */
export function formatDevHostGuardFailureMessage(hits) {
  const files = [...new Set(hits.map((hit) => hit.path))].join(", ");
  const labels = [...new Set(hits.map((hit) => hit.match))].join(", ");
  return [
    "RELEASE BLOCKED: a dev-only host was found in the built extension.",
    "",
    `Found in: ${files}`,
    `Matched: ${labels}`,
    "",
    "This is the local fixture-testing build's own permission (see",
    "scripts/lib/dev-build.mjs, scripts/build-dev.mjs, CONTRIBUTING.md) --",
    "it must never reach dist/. Run `npm run build` (the shipping build,",
    "never `npm run build:dev`) fresh, confirm dist/ was not hand-edited",
    "or overwritten from dist-dev/, then run `npm run release-check` again",
    "before this ships to the Chrome Web Store.",
  ].join("\n");
}
