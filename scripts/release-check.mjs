// Release-blocking guard: fails loudly if the built extension bundle still
// contains the MARKETING_HOST `.invalid` placeholder (src/popup/copy.ts).
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
// This checks the BUILT OUTPUT in dist/, not the source constant directly:
// a future refactor could rename or relocate MARKETING_HOST, but what must
// never ship is the literal `.invalid` placeholder text, wherever it ends
// up. dist/ is gitignored and not assumed to exist or be fresh -- callers
// run `npm run build` first (release-check's own package.json entry does
// this via `&&`), and a missing or empty dist/ fails loudly here rather
// than silently reporting "clean" on nothing.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { formatGuardFailureMessage, scanForUnconfiguredMarketingHost } from "./lib/marketing-host-guard.mjs";

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

const files = jsFiles.map((name) => ({
  path: join("dist", name),
  text: readFileSync(join(DIST_DIR, name), "utf-8"),
}));

const hits = scanForUnconfiguredMarketingHost(files);

if (hits.length > 0) {
  console.error(formatGuardFailureMessage(hits));
  process.exit(1);
}

console.log("release-check: no unconfigured marketing-host placeholder found in dist/. Clear to release.");
