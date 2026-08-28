// Produces a loadable UNPACKED extension into dist-dev/, WITH the local
// fixture-testing host permission added (see scripts/lib/dev-build.mjs).
// This script is never run by `npm run build`, `npm run check`, or CI --
// it exists solely so the founder can browser-test the extension against
// the fixture pages under tests/fixtures/dom/ (served by
// scripts/dev/serve-fixtures.mjs) without ever touching dist/ or
// src/manifest.json.
//
// Structurally incapable of shipping, by construction:
//   1. Writes ONLY to dist-dev/, a separate, gitignored directory --
//      dist/ (the shipping output) is never opened, read, or written by
//      this script. scripts/build.mjs (the shipping build) is completely
//      unmodified by this file's existence and produces byte-identical
//      output whether or not this script has ever been run (verified: see
//      CONTRIBUTING.md's release section and the PR that introduced this
//      file, which hash-compares dist/ before and after).
//   2. `npm run release-check` scans dist/manifest.json and dist/*.js for
//      the dev-only host (scripts/lib/dev-host-guard.mjs) -- so even a
//      mistaken `cp -r dist-dev/* dist/` is caught before release.
//   3. src/manifest.json itself is never edited -- the dev manifest is a
//      derived, in-memory object (scripts/lib/dev-build.mjs's
//      deriveDevManifest), computed fresh from the real committed file on
//      every run of this script and never written back to src/.
import { build } from "esbuild";
import { join } from "node:path";
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { buildDevMeta, deriveDevAdaptersConfig, deriveDevManifest } from "./lib/dev-build.mjs";
import { HTTP_DEFAULT_PORT, resolveFixturePort } from "./lib/fixture-port.mjs";

const OUT_DIR = "dist-dev";
/**
 * Everything this script writes into OUT_DIR, other than the manifest and
 * the icons. Listed explicitly so the clean step below removes exactly
 * what a build owns -- a file dropped from the entry points disappears on
 * the next build instead of lingering, without the directory itself ever
 * going missing while Chrome has it loaded.
 */
const BUILD_OUTPUTS = [
  "content-script.js",
  "service-worker.js",
  "popup.js",
  "welcome.js",
  "popup.html",
  "welcome.html",
];
// Single source of truth (scripts/lib/fixture-port.mjs), shared with
// scripts/dev/serve-fixtures.mjs -- see CONTRIBUTING.md and this
// variable's use below.
const fixturePort = resolveFixturePort();
const devMeta = buildDevMeta(fixturePort);
const MANIFEST_SUFFIX = join("src", "manifest.json");
const ADAPTERS_CONFIG_SUFFIX = join("src", "config", "adapters.config.json");

const [shippingManifestRaw, shippingAdaptersConfigRaw] = await Promise.all([
  readFile("src/manifest.json", "utf-8"),
  readFile("src/config/adapters.config.json", "utf-8"),
]);

const devManifest = deriveDevManifest(JSON.parse(shippingManifestRaw));
const devAdaptersConfigText = JSON.stringify(deriveDevAdaptersConfig(JSON.parse(shippingAdaptersConfigRaw)));
const devManifestText = JSON.stringify(devManifest);

/**
 * Redirects src/config/bundled.ts's two JSON imports to the derived dev
 * variants above, IN MEMORY only. src/config/adapters.config.json and
 * src/manifest.json on disk are read once (above), never overwritten, and
 * never touched a second time. Every other import in the bundle resolves
 * completely normally through esbuild's default resolver -- the filter
 * below only intercepts a load whose fully-resolved path ends in exactly
 * one of the two real file paths, so an unrelated file that happens to
 * share a filename elsewhere in the tree (there isn't one today; nothing
 * else in src/ is named manifest.json or adapters.config.json) would fall
 * through to the real file, not this substitution.
 */
const devFixtureConfigPlugin = {
  name: "dev-fixture-config",
  setup(buildApi) {
    buildApi.onLoad({ filter: /adapters\.config\.json$/ }, (args) => {
      if (!args.path.endsWith(ADAPTERS_CONFIG_SUFFIX)) return undefined;
      return { contents: devAdaptersConfigText, loader: "json" };
    });
    buildApi.onLoad({ filter: /manifest\.json$/ }, (args) => {
      if (!args.path.endsWith(MANIFEST_SUFFIX)) return undefined;
      return { contents: devManifestText, loader: "json" };
    });
  },
};

// Clear the previous run's bundles and pages, so a file this build no
// longer emits cannot linger beside a manifest that no longer lists it.
//
// Deliberately NOT `rm -r` on the whole directory: Chrome keeps this
// folder loaded as an unpacked extension across many rebuilds, and
// deleting the directory out from under it -- manifest included, however
// briefly -- is itself a way to abort a service-worker registration
// mid-flight. Removing only the files this build is about to rewrite
// keeps the folder and its manifest continuously present.
await Promise.all(
  BUILD_OUTPUTS.map((name) => rm(join(OUT_DIR, name), { force: true })),);

await build({
  entryPoints: {
    "content-script": "src/messaging/content-script.ts",
    "service-worker": "src/messaging/service-worker.ts",
    popup: "src/popup/popup.ts",
    welcome: "src/welcome/welcome.ts",
  },
  bundle: true,
  format: "iife",
  target: ["chrome120"],
  outdir: OUT_DIR,
  sourcemap: false,
  minify: false,
  logLevel: "info",
  plugins: [devFixtureConfigPlugin],
});

await mkdir(OUT_DIR, { recursive: true });
await writeFile(join(OUT_DIR, "manifest.json"), `${JSON.stringify(devManifest, null, 2)}\n`);
await copyFile("src/popup/popup.html", join(OUT_DIR, "popup.html"));
await copyFile("src/welcome/welcome.html", join(OUT_DIR, "welcome.html"));

await mkdir(join(OUT_DIR, "icons"), { recursive: true });
for (const f of await readdir("src/icons")) {
  await copyFile(join("src", "icons", f), join(OUT_DIR, "icons", f));
}

// Never part of the loaded extension (Chrome only ever reads the files
// above) -- read back by scripts/dev/serve-fixtures.mjs at startup so a
// port mismatch between this build and that server is reported loudly,
// not discovered by a fixture quietly failing to detect anything. See
// scripts/lib/dev-build.mjs's buildDevMeta and
// scripts/lib/fixture-port.mjs's describeFixturePortMismatch.
await writeFile(join(OUT_DIR, ".dev-build-meta.json"), `${JSON.stringify(devMeta, null, 2)}\n`);

console.log(`\ndev build written to ${OUT_DIR}/`);
console.log(`host_permissions gained: ${devManifest.host_permissions.slice(-2).join(", ")}`);
console.log(`expects the fixture server on port ${fixturePort} (npm run serve:fixtures) -- set PPC_FIXTURE_PORT before both commands to use a different one.`);
if (!devMeta.primaryFixtureAdapterMatchable) {
  console.log(
    `\nNote: the shopify-checkout adapter-matched fixture (full installment offer via the real adapter code) ` +
      `only reaches its adapter-matched PARSED_CONFIRMABLE state when actually served on port ${HTTP_DEFAULT_PORT} ` +
      `-- see CONTRIBUTING.md. The full flow is still reachable at port ${fixturePort} through the generic-path ` +
      `fixture (full installment offer, generic path) -- every fixture works at port ${fixturePort}.`,
  );
}
console.log("This build must never be published. See CONTRIBUTING.md's local fixture-testing section.");
