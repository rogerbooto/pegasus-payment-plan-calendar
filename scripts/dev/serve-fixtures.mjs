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
// Binds port 80 by default, which usually needs elevated privileges on
// Linux/macOS (`sudo npm run serve:fixtures`, or a one-time
// `sudo setcap 'cap_net_bind_service=+ep' $(which node)`). This is
// deliberate, not an oversight: the primary fixture (the full installment
// offer, matched through the real shopify-checkout adapter code -- see
// scripts/lib/dev-build.mjs) is matched by comparing the browser's own
// `location.host` against a bare "localhost" entry in the dev-only
// adapter config, with NO port-stripping logic anywhere in src/ (that
// logic staying out of src/ entirely is what keeps `npm run build`
// byte-identical to the shipping build -- see CONTRIBUTING.md). A
// browser only omits the port from `location.host` for the scheme's own
// default port, and http's default port is 80.
//
// If you cannot or would rather not bind port 80, set PPC_FIXTURE_PORT to
// any other port. Every fixture except the primary one is completely
// unaffected by port choice (none of them depend on adapter host
// matching); the primary fixture will still load and be scanned by the
// generic detector at another port, just not through the adapter-matched
// PARSED_CONFIRMABLE path this build exists to exercise.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { URL } from "node:url";
import { FIXTURE_ROUTES } from "./fixture-routes.mjs";

const DEFAULT_PORT = 80;
const rawPort = process.env.PPC_FIXTURE_PORT;
const PORT = rawPort ? Number.parseInt(rawPort, 10) : DEFAULT_PORT;

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
    console.error("Port 80 is the default because it is the only port a browser reports as a bare");
    console.error('"localhost" (no ":<port>") in location.host -- see this file\'s header comment.');
    console.error("\nOptions:");
    console.error("  1. sudo npm run serve:fixtures");
    console.error("  2. sudo setcap 'cap_net_bind_service=+ep' $(which node)   (one-time, this machine)");
    console.error("  3. PPC_FIXTURE_PORT=<port> npm run serve:fixtures         (every fixture except");
    console.error("     the primary one is unaffected by port choice)");
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, () => {
  console.log(`local fixture server listening on http://localhost:${PORT}/`);
  for (const route of FIXTURE_ROUTES) {
    console.log(`  http://localhost:${PORT}${route.path}  -- ${route.label}`);
  }
  if (PORT !== DEFAULT_PORT) {
    console.log(
      `\nNote: PPC_FIXTURE_PORT=${PORT} -- the primary fixture will not reach the adapter-matched`,);
    console.log("PARSED_CONFIRMABLE state at this port (it needs port 80). Everything else is unaffected.");
  }
  console.log("\nLoad dist-dev/ unpacked in Chrome (npm run build:dev first) to browser-test these.");
});
