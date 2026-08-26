// Pure derivation logic behind the LOCAL fixture-testing build
// (`npm run build:dev`, scripts/build-dev.mjs) and the guard that keeps
// it out of a release (scripts/lib/dev-host-guard.mjs,
// scripts/release-check.mjs).
//
// Every function here is a pure object -> object transform: no
// filesystem, no esbuild, no process.env. scripts/build-dev.mjs calls
// these on the REAL, committed src/manifest.json and
// src/config/adapters.config.json to produce the dev-only variants --
// there is no separate, hand-maintained dev manifest or dev config file
// to drift out of sync with the shipping ones. The exact same functions
// are exercised directly by tests/static/dev-build-manifest.test.ts, so
// "what ships in dist-dev/" and "what the test suite asserts on" are the
// same code path, never a re-implementation.
//
// Deliberately, NOTHING under src/ is ever touched to make this work --
// not even src/config/bundled.ts's own manifest-host-derivation regex or
// src/engine/adapter-common.ts's host comparison. This whole module
// exists precisely so the shipping build (`npm run build`) stays
// byte-identical whether or not this file exists (see
// tests/static/dev-build-manifest.test.ts's own header and the PR/report
// that introduced this file for the before/after hash comparison). That
// constraint is WHY the two host-permission patterns below look slightly
// asymmetric -- see each one's own comment.

/**
 * The fixture server (scripts/dev/serve-fixtures.mjs) speaks plain http.
 * This is the pattern actually used for content-script INJECTION
 * (manifest `content_scripts[0].matches`) -- Chrome's extension
 * match-pattern grammar has no port component, so this one pattern
 * matches the fixture server on whatever port it happens to be bound to.
 */
export const DEV_HOST_PATTERN_HTTP = "http://localhost/*";

/**
 * A SECOND, never-actually-served pattern, added to `host_permissions`
 * only (never to `content_scripts.matches`). src/config/bundled.ts
 * derives its MANIFEST_HOSTS list by stripping a "https://" scheme
 * prefix -- that stripping logic is unmodified, on purpose, so the
 * shipping build stays byte-identical. Adding an "https://" flavour of
 * the SAME host lets the dev-only shopify-checkout override
 * (deriveDevAdaptersConfig, below) validate against that unmodified
 * regex without granting anything real: nothing in this build ever
 * serves https on this host, so this permission is inert in practice --
 * it exists purely so the bundled config validator's host-subset check
 * (src/config/loader.ts's validateAdapter) sees the bare hostname it
 * needs, without src/config/bundled.ts changing at all.
 */
export const DEV_HOST_PATTERN_HTTPS = "https://localhost/*";

/**
 * The bare hostname src/engine/adapter-common.ts's matchAdapterConfig
 * compares a page's `location.host` against, unmodified. Config hosts
 * are validated bare hostnames only (src/config/loader.ts's HOST_CHARSET
 * has no room for a colon), and `location.host` only omits a port for
 * the scheme's own default port -- http's is 80. That is why
 * scripts/dev/serve-fixtures.mjs binds port 80 by default: it is what
 * makes a real browser report `location.host` as exactly "localhost",
 * with nothing left to strip, so the unmodified adapter-matching code
 * needs no change either.
 */
export const DEV_ADAPTER_HOST = "localhost";

/**
 * Reuses the shopify-checkout adapter's own selectors/patterns entirely
 * unchanged (src/config/adapters.config.json) against the one fixture
 * page served under this path prefix: the exact, committed
 * tests/fixtures/dom/adapters/shopify-checkout/full-confirmable.html
 * file -- the same bytes tests/unit/engine/adapters.test.ts already
 * asserts a PARSED_CONFIRMABLE result against. Adding "localhost" as a
 * second host for the SAME adapter, rather than inventing a fourth
 * adapter, is deliberate: it exercises the real production
 * match/locate/extract code path end to end instead of a parallel
 * "fixture adapter" that could drift from what actually ships.
 */
export const DEV_ADAPTER_PATH_PREFIX = "/checkout/pay-in-4";

const DEV_BUILD_DESCRIPTION_SUFFIX =
  " Local fixture-testing build only -- never publish this build to the Chrome Web Store.";

/**
 * Derives the dev-only manifest object from the real, shipping
 * src/manifest.json object (already JSON.parse'd). Adds:
 *  - host_permissions: DEV_HOST_PATTERN_HTTP and DEV_HOST_PATTERN_HTTPS
 *    (see their own comments above for why both, and why neither is a
 *    src/ change);
 *  - content_scripts[0].matches: DEV_HOST_PATTERN_HTTP only -- the one
 *    pattern actually used for real injection;
 *  - a version_name and a description suffix so chrome://extensions
 *    makes plain this is not the shipping build, and "(dev)" appended to
 *    the toolbar tooltip.
 * Every other field -- manifest_version, version, permissions,
 * background, action.default_icon/default_popup,
 * content_security_policy, icons -- passes through unchanged.
 */
export function deriveDevManifest(manifest) {
  if (!Array.isArray(manifest.content_scripts) || manifest.content_scripts.length !== 1) {
    throw new Error("deriveDevManifest: expected exactly one content_scripts entry in the shipping manifest");
  }
  const [contentScript] = manifest.content_scripts;
  return {
    ...manifest,
    name: `${manifest.name} (Local Fixtures)`,
    version_name: `${manifest.version}-dev-fixtures`,
    description: `${manifest.description}${DEV_BUILD_DESCRIPTION_SUFFIX}`,
    host_permissions: [...manifest.host_permissions, DEV_HOST_PATTERN_HTTPS, DEV_HOST_PATTERN_HTTP],
    content_scripts: [{ ...contentScript, matches: [...contentScript.matches, DEV_HOST_PATTERN_HTTP] }],
    action: {
      ...manifest.action,
      default_title: `${manifest.action.default_title} (dev)`,
    },
  };
}

/**
 * Derives the dev-only adapter-config object from the real, shipping
 * src/config/adapters.config.json object (already JSON.parse'd). Adds
 * "localhost" to the shopify-checkout adapter's `hosts` and
 * DEV_ADAPTER_PATH_PREFIX to its `pathPatterns` -- every selector, label
 * and instalment pattern is left completely untouched.
 */
export function deriveDevAdaptersConfig(config) {
  const shopify = config.adapters?.["shopify-checkout"];
  if (!shopify) {
    throw new Error("deriveDevAdaptersConfig: expected a shopify-checkout entry in the shipping adapter config");
  }
  return {
    ...config,
    adapters: {
      ...config.adapters,
      "shopify-checkout": {
        ...shopify,
        hosts: [...shopify.hosts, DEV_ADAPTER_HOST],
        pathPatterns: [...shopify.pathPatterns, DEV_ADAPTER_PATH_PREFIX],
      },
    },
  };
}
