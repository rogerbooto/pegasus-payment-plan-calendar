// A tiny static server for the browser-testable checkout fixtures listed
// in scripts/dev/fixture-routes.mjs. Node's built-in http/fs only -- no
// new dependency. This is a dev tool, not a product: it serves a fixed,
// hardcoded route table (never a directory listing, never a path derived
// from the request), reads each fixture file fresh on every request, and
// makes no outbound network call of its own.
//
// Run alongside the local fixture-testing build (`npm run build:dev`,
// loaded unpacked in Chrome -- see CONTRIBUTING.md):
//
//   npm run serve:fixtures
//
// Binds scripts/lib/fixture-port.mjs's DEFAULT_FIXTURE_PORT (8080) unless
// PPC_FIXTURE_PORT overrides it -- no elevated privileges needed for that
// default. Every fixture except one loads and gets scanned by the generic
// detector at any port. The one exception (the full installment offer,
// matched through the real shopify-checkout adapter code -- see
// scripts/lib/dev-build.mjs) only reaches the adapter-matched
// PARSED_CONFIRMABLE state when this server is bound to port 80
// specifically (scripts/lib/fixture-port.mjs's HTTP_DEFAULT_PORT) --
// see that constant's own comment for exactly why, and CONTRIBUTING.md
// for how to bind it on purpose. That is a fact about how a browser
// reports `location.host` and how src/config/loader.ts validates an
// adapter's `hosts` list, not something this file can work around at a
// different port.
//
// npm run build:dev writes dist-dev/.dev-build-meta.json recording which
// port it was built expecting; this server reads it back at startup and
// warns (never fatally) if the two disagree -- see
// scripts/lib/fixture-port.mjs's describeFixturePortMismatch.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { URL } from "node:url";
import { FIXTURE_ROUTES } from "./fixture-routes.mjs";
import { canReachAdapterMatchedFixture, describeFixturePortMismatch, HTTP_DEFAULT_PORT, resolveFixturePort } from "../lib/fixture-port.mjs";

const PORT = resolveFixturePort();
const DEV_BUILD_META_PATH = join(process.cwd(), "dist-dev", ".dev-build-meta.json");

async function readDevBuildMeta() {
  try {
    const text = await readFile(DEV_BUILD_META_PATH, "utf-8");
    return JSON.parse(text);
  } catch {
    return null; // no dev build yet, or unreadable -- advisory only, never fatal
  }
}

function renderIndexHtml() {
  const items = FIXTURE_ROUTES.map(
    (route) =>
      `<li><a href="${route.path}">${route.label}</a><p>${route.describes}</p><code>${route.path}</code></li>`,).join("\n");
  return [
    "<!doctype html>",
    '<html lang="en"><head><meta charset="utf-8"><title>Pegasus Payment Plan Calendar -- local fixtures</title></head><body>',
    "<h1>Local checkout fixtures</h1>",
    "<p>Each link below is a fixture page committed under tests/fixtures/dom/. Load the local " +
      "fixture-testing build (npm run build:dev) unpacked first -- see CONTRIBUTING.md.</p>",
    `<ul>${items}</ul>`,
    "</body></html>",
  ].join("\n");
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

  if (url.pathname === "/") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(renderIndexHtml());
    return;
  }

  const route = FIXTURE_ROUTES.find((r) => r.path === url.pathname);
  if (!route) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end(`no fixture route registered for ${url.pathname} -- see scripts/dev/fixture-routes.mjs`);
    return;
  }

  readFile(route.file, "utf-8")
    .then((html) => {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(html);
    })
    .catch((err) => {
      res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      res.end(`could not read ${route.file}: ${err.message}`);
    });
});

server.on("error", (err) => {
  if (err.code === "EACCES") {
    console.error(`could not bind port ${PORT}: permission denied.\n`);
    console.error(`Port ${PORT} needs an elevated bind on this machine.`);
    if (PORT === HTTP_DEFAULT_PORT) {
      console.error(`You asked for port ${HTTP_DEFAULT_PORT} specifically -- that is only needed to reach the`);
      console.error("adapter-matched primary fixture (see CONTRIBUTING.md). Options:");
      console.error("  1. sudo npm run serve:fixtures");
      console.error("  2. sudo setcap 'cap_net_bind_service=+ep' $(which node)   (one-time, this machine)");
    } else {
      console.error(`Set PPC_FIXTURE_PORT to a port this machine lets you bind without elevation.`);
    }
    process.exit(1);
  }
  if (err.code === "EADDRINUSE") {
    console.error(`could not bind port ${PORT}: already in use.\n`);
    console.error("Something else on this machine is already listening there. Either stop it, or run:");
    console.error(`  PPC_FIXTURE_PORT=<a free port> npm run serve:fixtures`);
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, () => {
  console.log(`local fixture server listening on http://localhost:${PORT}/`);
  for (const route of FIXTURE_ROUTES) {
    console.log(`  http://localhost:${PORT}${route.path}  -- ${route.label}`);
  }
  if (!canReachAdapterMatchedFixture(PORT)) {
    console.log(
      `\nNote: bound to port ${PORT} -- the primary fixture will not reach the adapter-matched`,);
    console.log(`PARSED_CONFIRMABLE state here (it needs port ${HTTP_DEFAULT_PORT}). Everything else is unaffected.`);
  }
  readDevBuildMeta().then((meta) => {
    if (!meta) return;
    const mismatch = describeFixturePortMismatch(meta.expectedFixturePort, PORT);
    if (mismatch) console.warn(`\nMISMATCH: ${mismatch}`);
  });
  console.log("\nLoad dist-dev/ unpacked in Chrome (npm run build:dev first) to browser-test these.");
});
