// Produces a loadable unpacked extension in dist/.
// Deterministic on purpose: no sourcemaps, no minification, fixed target.
import { build } from "esbuild";
import { copyFile, mkdir } from "node:fs/promises";

await build({
  entryPoints: {
    "content-script": "src/messaging/content-script.ts",
    "service-worker": "src/messaging/service-worker.ts",
    popup: "src/popup/popup.ts",
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
