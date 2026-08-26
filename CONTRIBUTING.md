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

## Before a release

```
npm run release-check   # build, then verify the build is release-ready
```

This is separate from `npm run check` on purpose. One known placeholder
(the marketing-site link the popup's email invite points at) is a
deliberate, reserved, non-resolving address during ordinary development —
`npm run build` and `npm run check` are meant to keep passing with it in
place. `npm run release-check` builds the extension and then checks the
*built* files for that placeholder, and fails loudly, naming the exact
constant and file to fix, if it's still there. Run it before packaging
anything for the Chrome Web Store.

## Licensing

Contributions are accepted under a contributor license agreement. The CLA text
will be published here before the first outside contribution is merged — there is
nothing to sign yet, and no terms are being invented in this paragraph.
