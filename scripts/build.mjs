// Produces a loadable unpacked extension in dist/.
// Deterministic on purpose: no sourcemaps, no minification, fixed target.
import { build } from "esbuild";
import { copyFile, mkdir, readdir, rm } from "node:fs/promises";

/**
 * Everything this script writes into dist/, other than the manifest and
 * the icons. Cleared before each build so a file dropped from the entry
 * points disappears rather than lingering beside a manifest that no
 * longer lists it -- the failure that allows is quiet, and Chrome loads
 * an unpacked extension straight from this directory.
 *
 * Deliberately not `rm -r` on the directory itself: this folder may be
 * loaded in a browser, and removing it wholesale -- manifest included,
 * however briefly -- can abort a service-worker registration mid-flight.
 */
const BUILD_OUTPUTS = [
  "content-script.js",
  "service-worker.js",
  "popup.js",
  "welcome.js",
  "popup.html",
  "welcome.html",
];
await Promise.all(BUILD_OUTPUTS.map((name) => rm(`dist/${name}`, { force: true })));

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
  outdir: "dist",
  sourcemap: false,
  minify: false,
  logLevel: "info",
});

await mkdir("dist", { recursive: true });
await copyFile("src/manifest.json", "dist/manifest.json");
await copyFile("src/popup/popup.html", "dist/popup.html");
await copyFile("src/welcome/welcome.html", "dist/welcome.html");

// Toolbar/store icons. Derived from the Pegasus mark; see the trademark note in
// README — the code is GPL-3.0, the marks are not covered by that grant.
await mkdir("dist/icons", { recursive: true });
for (const f of await readdir("src/icons")) {
  await copyFile(`src/icons/${f}`, `dist/icons/${f}`);
}
