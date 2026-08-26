// Release-blocking guard. Two independent checks against the BUILT OUTPUT
// in dist/, composed here:
//
//   1. The MARKETING_HOST `.invalid` placeholder (src/popup/copy.ts) must
//      not still be in the built bundle.
//   2. No dev-only host (localhost / loopback -- see
//      scripts/lib/dev-host-guard.mjs) may appear in the built manifest or
//      any built bundle. That host only ever has meaning on the local
//      fixture-testing build (`npm run build:dev`, dist-dev/, never
//      dist/) -- see scripts/lib/dev-build.mjs and CONTRIBUTING.md.
//
// Deliberately NOT wired into `npm run build` or `npm run check`. Those run
// on every local dev loop and every CI push, and the placeholder is the
// correct, expected state for all of that -- a guard that fired there would
// fail every ordinary build until the day a real marketing origin exists.
// This script only runs when a release is actually being produced:
//
//   npm run release-check
//
// (documented in CONTRIBUTING.md's release section, and wired as its own
// npm script precisely so it can't be forgotten -- it shows up next to
// `build`/`check` in `npm run`, not buried in a one-off shell command).
//
// This checks the BUILT OUTPUT in dist/, not source constants directly:
// a future refactor could rename or relocate either signal, but what must
// never ship is the literal placeholder text / dev-only host, wherever it
// ends up. dist/ is gitignored and not assumed to exist or be fresh --
// callers run `npm run build` first (release-check's own package.json
// entry does this via `&&`), and a missing or empty dist/ fails loudly
// here rather than silently reporting "clean" on nothing.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { formatGuardFailureMessage, scanForUnconfiguredMarketingHost } from "./lib/marketing-host-guard.mjs";
import { formatDevHostGuardFailureMessage, scanForDevOnlyHosts } from "./lib/dev-host-guard.mjs";

const DIST_DIR = join(process.cwd(), "dist");

if (!existsSync(DIST_DIR)) {
  console.error("RELEASE BLOCKED: dist/ does not exist. Run `npm run build` before `npm run release-check`.");
  process.exit(1);
}

const jsFiles = readdirSync(DIST_DIR).filter((name) => name.endsWith(".js"));
if (jsFiles.length === 0) {
  console.error("RELEASE BLOCKED: dist/ has no built .js files. Run `npm run build` before `npm run release-check`.");
  process.exit(1);
}

const jsFileEntries = jsFiles.map((name) => ({
  path: join("dist", name),
  text: readFileSync(join(DIST_DIR, name), "utf-8"),
}));

const marketingHostHits = scanForUnconfiguredMarketingHost(jsFileEntries);
if (marketingHostHits.length > 0) {
  console.error(formatGuardFailureMessage(marketingHostHits));
  process.exit(1);
}

// The dev-only-host guard also scans the built manifest, not just the JS
// bundles: dist/manifest.json is the one file that would actually carry
// the extra host_permissions/content_scripts.matches entry if a dev build
// were mistaken for a shipping one (see scripts/lib/dev-build.mjs).
const MANIFEST_PATH = join(DIST_DIR, "manifest.json");
const manifestEntries = existsSync(MANIFEST_PATH)
  ? [{ path: join("dist", "manifest.json"), text: readFileSync(MANIFEST_PATH, "utf-8") }]
  : [];

const devHostHits = scanForDevOnlyHosts([...manifestEntries, ...jsFileEntries]);
if (devHostHits.length > 0) {
  console.error(formatDevHostGuardFailureMessage(devHostHits));
  process.exit(1);
}

console.log("release-check: no unconfigured marketing-host placeholder and no dev-only host found in dist/. Clear to release.");
