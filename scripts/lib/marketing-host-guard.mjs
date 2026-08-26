// Pure detection logic behind `npm run release-check`
// (scripts/release-check.mjs). Kept filesystem-free and side-effect-free
// on purpose: every function here takes already-read text and returns
// data, so the exact same code path runs in the CLI and in
// tests/static/release-guard.test.ts -- no second, hand-copied
// re-implementation to drift out of sync with what the release gate
// actually enforces.
//
// What this detects: src/popup/copy.ts's MARKETING_HOST is a placeholder
// built on the IANA-reserved, non-resolving `.invalid` TLD (see the
// comment there) until a real marketing origin is assigned. That
// constant, and the LAUNCH_NOTIFY_URL built on it, get bundled verbatim
// into dist/popup.js and dist/welcome.js by `npm run build` (no
// minification, per scripts/build.mjs) -- so the placeholder's exact
// text survives into the built output unchanged. Scanning the BUILT
// OUTPUT rather than importing the source constant means a future
// refactor that renames MARKETING_HOST, moves it to a different file, or
// wraps it in another constant still gets caught: what must never ship
// is the literal `.invalid` marker, wherever it ends up.

/**
 * Matches a hostname LABEL immediately followed by the reserved `.invalid`
 * TLD (e.g. "pegasus.invalid", "marketing.pegasus.invalid") -- not the
 * bare substring ".invalid" on its own.
 *
 * That distinction matters: the same bundle also contains
 * MARKETING_HOST_CONFIGURED's own comparison,
 * `MARKETING_HOST.includes(".invalid")`, which puts the quoted substring
 * ".invalid" into the output as a comparison argument on every build,
 * configured or not. A bare `.includes(".invalid")` scan over the bundle
 * text would therefore always report a hit -- a guard that can never turn
 * green is as useless as one that can never turn red. Requiring a
 * hostname-label character (letters, digits, or a hyphen) immediately
 * before the dot excludes that self-reference (`"` precedes the dot
 * there, not a label character) while still catching the real placeholder
 * under any subdomain or constant name.
 */
export const UNCONFIGURED_MARKETING_HOST_PATTERN = /[a-zA-Z0-9-]+\.invalid\b/g;

/**
 * Returns every distinct placeholder-shaped match found in one file's
 * text. Empty array when the file is clean.
 */
export function findUnconfiguredMarketingHostMatches(text) {
  const matches = text.match(UNCONFIGURED_MARKETING_HOST_PATTERN);
  return matches ? [...new Set(matches)] : [];
}

/**
 * Scans a list of `{ path, text }` entries -- already-read file contents,
 * so this module never touches the filesystem itself. Returns one entry
 * per (file, match) hit; empty when nothing is found anywhere.
 */
export function scanForUnconfiguredMarketingHost(files) {
  const hits = [];
  for (const { path, text } of files) {
    for (const match of findUnconfiguredMarketingHostMatches(text)) {
      hits.push({ path, match });
    }
  }
  return hits;
}

/**
 * The actionable, release-blocking message. Names the exact constant and
 * file to edit. Deliberately never invents or suggests a specific real
 * replacement domain -- assigning one is a founder decision this guard
 * has no business making or guessing at.
 */
export function formatGuardFailureMessage(hits) {
  const files = [...new Set(hits.map((hit) => hit.path))].join(", ");
  return [
    "RELEASE BLOCKED: the marketing-host placeholder is still in the built bundle.",
    "",
    `Found in: ${files}`,
    "",
    "MARKETING_HOST in src/popup/copy.ts is still the reserved `.invalid`",
    "placeholder. Replace it with the real marketing origin, then run",
    "`npm run build` again, before this build ships to the Chrome Web Store.",
    "",
    "This does not block `npm run build` or `npm run check` -- only",
    "`npm run release-check`, the release-time gate.",
  ].join("\n");
}
