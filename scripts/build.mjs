// Produces a loadable unpacked extension in dist/.
// Deterministic on purpose: no sourcemaps, no minification, fixed target.
import { build } from "esbuild";
import { copyFile, mkdir, readdir } from "node:fs/promises";

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
