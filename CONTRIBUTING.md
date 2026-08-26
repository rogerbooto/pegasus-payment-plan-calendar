# Contributing

Thanks for looking. A few honest notes before you spend time.

## Where this is

Early. There is no released extension yet and the code here is a skeleton with
its seams in place. If you are looking for something to install, there isn't one
yet.

## The most useful contribution

**A checkout it should recognize and doesn't.** Open an issue with the shop and
what you saw. Coverage is the hard problem here — every store builds its checkout
differently, and there is no way to find the gaps except to hit them.

Please don't include order numbers, addresses, or anything else personal in an
issue. The shop and a description of the layout is enough.

## Things this project will not do

Some directions are settled, so you don't waste effort proposing them:

- **No affiliate links, commissions, or referral fees.** Not from shops, not
  from lenders. The panel's only value is having no stake in whether you buy.
- **No account, sign-in, or server.** Everything stays on the user's own device.
  A feature that needs a backend is out of scope by design, not by lack of time.
- **No telling people what to do.** It shows dates and amounts. It does not
  score, grade, warn, or advise. That line is deliberate and it is not moving.
- **No tracking of what anyone buys.** Ever.

## Ground rules in the code

- **Money is integer cents, never a floating-point number.** There is one place
  that turns a string into money and one place that turns money back into text.
  Lint will stop you if you reach for `parseFloat` or `Number()`.
- **Selectors are data, never code.** The configuration is bundled and validated;
  there is no code path that fetches anything at runtime.
- **Nothing is stored that isn't on the allowlist.** A write containing a shop
  name, a URL, or anything personal throws rather than quietly succeeding.
- **Tests are expected to fail when the thing they protect breaks.** A test that
  passes whether or not the code is correct is worse than no test.

## Practical

```
npm install
npm run check     # typecheck, lint, tests, build
```

`npm run build` produces a loadable unpacked extension in `dist/`.

## Testing against a real browser

The unit tests run every parsing and extraction path against static HTML
fixtures (`tests/fixtures/dom/`), but a real checkout only ever runs inside
a real page, loaded by a real browser, through the manifest's actual
permissions. The shipped extension only has permission to run on the
handful of real checkout hosts it recognizes, so exercising it against
anything else — without visiting a real store — needs a second, local-only
build.

**Serve the fixtures:**

```
npm run serve:fixtures
```

This starts a small local server (no new dependency — just Node's own
`http`/`fs`) on port 8080 by default, serving a handful of the same
fixture pages the unit tests already assert against
(`tests/fixtures/dom/`, routed by `scripts/dev/fixture-routes.mjs`). No
elevated privileges needed for any of it — the full path (detection, a
pre-filled form, and the calendar, end to end) is reachable at this
default port through the first fixture in the list, which is matched
purely by `src/engine/generic-detector.ts`'s path- and label-based
signals rather than by any host allowlist.

One fixture is the exception, in the other direction: the
shopify-checkout adapter one further down the list additionally exercises
the real adapter code's own selectors, which are matched by comparing the
page's host against a short allowlist — and a browser only reports a bare
`localhost` (no `:<port>`) at port 80 specifically. So:

- At the default port 8080, that fixture still loads, and the panel still
  runs the generic, path-based detection over it — everything except the
  adapter match itself.
- To see it matched through the real adapter code instead, serve on port
  80: `PPC_FIXTURE_PORT=80 npm run build:dev` and
  `sudo PPC_FIXTURE_PORT=80 npm run serve:fixtures` (or a one-time
  `sudo setcap 'cap_net_bind_service=+ep' $(which node)`, after which
  plain `PPC_FIXTURE_PORT=80 npm run serve:fixtures` works without
  `sudo`).

Set `PPC_FIXTURE_PORT` before *both* `npm run build:dev` and
`npm run serve:fixtures` — they read the same default, and the server
warns loudly if it notices they were given different values.

**Build the local-fixtures variant:**

```
npm run build:dev
```

This writes to `dist-dev/`, never to `dist/`. It is the ordinary build
(`scripts/build.mjs`) plus exactly one addition: permission to run on
`localhost`, derived from the real `src/manifest.json` and
`src/config/adapters.config.json` at build time
(`scripts/lib/dev-build.mjs`) — there is no separate, hand-maintained dev
manifest to fall out of sync with the real one. `src/manifest.json` itself
is never edited.

**Load it:** open `chrome://extensions`, enable Developer mode, "Load
unpacked", and select `dist-dev/`. Its name and toolbar tooltip both say
"(dev)" so it's never confused with a real install at a glance. With the
fixture server running, visit the pages it lists at
`http://localhost:8080/` (or whatever port you set `PPC_FIXTURE_PORT`
to — the server prints the exact links on startup).

What each fixture shows:

| Fixture | What it exercises |
|---|---|
| Full installment offer (generic path, no elevation needed) | The path that matters most: detection, a form with all four numbers pre-filled, and the calendar, end to end — on an invented shop's checkout, matched with no host allowlist at all, so it works the same at this default port as anywhere else. |
| Full installment offer via the real adapter code (port 80 only) | The same shape of offer, this time matched through the real shopify-checkout adapter's own selectors and its one-click confirmation sheet. Needs port 80 specifically — see above. |
| Degraded / unconfirmed | A checkout-shaped page with nothing to confirm yet — the panel says so plainly instead of staying silent. |
| Amazon-shaped totals | The Items / Shipping / tax breakdown that motivated the order-total suggestion — open "Add a plan" to see it offered back to you. |
| Two disagreeing totals | Two different totals on the page — the suggestion stays blank, never a guess. |
| French locale | A French total label, still recognized. |
| Non-checkout page on a checkout-ish path | Confirms nothing inappropriate appears just because a URL looks like a checkout. |

**This build must never be published.** It carries a permission the real
extension does not, and does not need, and every one of the following
exists specifically so it can't leave this laptop by accident:

- `dist-dev/` is git-ignored, and is a completely separate directory from
  `dist/` — nothing here ever writes to, or reads from, `dist/`.
- `npm run release-check` (below) fails loudly if a `localhost` permission
  (or a handful of other local-only addresses) ever turns up in a built
  `dist/manifest.json` or bundle — see `scripts/lib/dev-host-guard.mjs`.
- `npm run build` (the real build) is completely unaffected by any of
  this: it is byte-for-byte the same output whether or not `npm run
  build:dev` has ever been run.

## Before a release

```
npm run release-check   # build, then verify the build is release-ready
```

This is separate from `npm run check` on purpose. One known placeholder
(the marketing-site link the popup's email invite points at) is a
deliberate, reserved, non-resolving address during ordinary development —
`npm run build` and `npm run check` are meant to keep passing with it in
place. `npm run release-check` builds the extension and then checks the
*built* files for that placeholder — and, separately, for the local-only
`localhost` permission described above — and fails loudly, naming the
exact cause, if either is still there. Run it before packaging anything
for the Chrome Web Store.

## Licensing

Contributions are accepted under a contributor license agreement. The CLA text
will be published here before the first outside contribution is merged — there is
nothing to sign yet, and no terms are being invented in this paragraph.
