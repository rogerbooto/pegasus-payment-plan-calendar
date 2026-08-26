// Single source of truth for the local fixture server's port -- read by
// BOTH `npm run build:dev` (scripts/build-dev.mjs, via
// scripts/lib/dev-build.mjs) and `npm run serve:fixtures`
// (scripts/dev/serve-fixtures.mjs). Neither of those files hardcodes a
// port literal of its own; both call resolveFixturePort() below, so a
// PPC_FIXTURE_PORT override (or its absence) is seen identically by both
// commands. tests/static/fixture-port.test.ts statically checks that
// neither script re-introduces a private copy of the default.
//
// Why 8080 and not 80: binding port 80 needs an elevated bind on
// Linux/macOS (`EACCES: permission denied` for an ordinary user --
// see serve-fixtures.mjs's own error handling). 8080 needs no privilege.
export const DEFAULT_FIXTURE_PORT = 8080;

/**
 * The one port at which a real browser omits the port from
 * `location.host` for a plain `http://` URL
 * (src/engine/dom-page-probe.ts:13 reads `location.host` unmodified, and
 * this file does not and must not change that).
 *
 * This is not a dev-tooling preference, it is a structural consequence of
 * two things that are both true today and both out of scope to change
 * here:
 *   1. A browser only ever omits the port from `location.host` for a
 *      scheme's own default port -- 80 for http.
 *   2. src/engine/adapter-common.ts's matchAdapterConfig compares
 *      `page.host` against an adapter's configured `hosts` list with
 *      plain string equality, and src/config/loader.ts's HOST_CHARSET
 *      (`/^[a-z0-9.-]+$/`) has no room for a colon -- so there is no
 *      config value that can ever spell ":8080" (or any other non-default
 *      port) and still pass validation. Adding one does not "almost
 *      work" -- it fails validation and disables the WHOLE adapter entry
 *      it's attached to (verified directly against src/config/loader.ts's
 *      validateConfig; see this module's own test file).
 *
 * That means the shopify-checkout adapter's dev-only "localhost" host
 * entry (scripts/lib/dev-build.mjs's DEV_ADAPTER_HOST) can only ever
 * compare equal to a real `location.host` at exactly this port. Serving
 * fixtures at any other port (including DEFAULT_FIXTURE_PORT above) is
 * still useful -- every fixture still loads and still runs through the
 * generic detector -- it just cannot reach the adapter-matched
 * PARSED_CONFIRMABLE state. See CONTRIBUTING.md for how to reach that
 * state on purpose.
 */
export const HTTP_DEFAULT_PORT = 80;

/**
 * Reads PPC_FIXTURE_PORT from the given env (process.env by default),
 * falling back to DEFAULT_FIXTURE_PORT when unset or empty. Throws on a
 * value that isn't a positive integer -- failing here, naming the bad
 * value, beats a silent NaN reaching `server.listen()` three layers down.
 */
export function resolveFixturePort(env = process.env) {
  const raw = env.PPC_FIXTURE_PORT;
  if (raw === undefined || raw.trim() === "") return DEFAULT_FIXTURE_PORT;
  const trimmed = raw.trim();
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isInteger(parsed) || parsed <= 0 || String(parsed) !== trimmed) {
    throw new Error(`PPC_FIXTURE_PORT must be a positive integer, got ${JSON.stringify(raw)}`);
  }
  return parsed;
}

/**
 * True only at HTTP_DEFAULT_PORT. Every other port can still serve every
 * fixture as an ordinary page -- see HTTP_DEFAULT_PORT's own comment for
 * why only this one port can ever reach the adapter-matched fixture.
 */
export function canReachAdapterMatchedFixture(port) {
  return port === HTTP_DEFAULT_PORT;
}

/**
 * Pure comparison used to keep `npm run build:dev` and `npm run
 * serve:fixtures` from silently drifting apart when each is invoked with
 * a different PPC_FIXTURE_PORT: null when the ports agree, an actionable
 * message when they don't. Never throws, and never fatal to a caller --
 * every fixture except the adapter-matched one still works regardless, so
 * this is a loud heads-up, not a hard failure.
 */
export function describeFixturePortMismatch(expectedPort, actualPort) {
  if (expectedPort === actualPort) return null;
  return (
    `dist-dev/ was built expecting the fixture server on port ${expectedPort}, but this server is bound to ` +
    `port ${actualPort}. Rebuild with the same PPC_FIXTURE_PORT you serve with (npm run build:dev), or serve ` +
    `on ${expectedPort} instead (PPC_FIXTURE_PORT=${expectedPort} npm run serve:fixtures) -- otherwise the URLs ` +
    "the dev build printed are not the ones this server is actually listening on."
  );
}
