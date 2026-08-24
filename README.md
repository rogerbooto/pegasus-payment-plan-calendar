# Pegasus Payment Plan Calendar

A Chrome extension that shows you the dates. When an online checkout offers to split a purchase
into four payments, it lays those dates out on a calendar — before you click Buy — beside the
payment plans you already entered.

Everything happens on your own computer. No account, no bank connection, and no server on the
other end of it.

---

## Status: in development. Nothing is released yet.

This repository is public from the day it started, so the code can be read as it is written. Today
it holds a licence, this README, and not much else.

- There is **no published extension**. It is not in the Chrome Web Store.
- There is **no build you can install**, and no application code here yet to build one from.
- There is **no release date** to give you.

Everything below describes what is being built and how it is meant to behave. Read it as a plan,
not as something you can have today. When something ships, this section will say so and point at
it. Until then, this section stays exactly this blunt.

---

## What it does

At a checkout that offers to split the purchase into four payments, it reads four numbers: the
order total, how many payments, how often they fall due, and the amount of each. It shows you
those numbers so you can check them or correct them. Nothing is saved until you confirm.

Then it puts them on a calendar, together with the plans you entered before:

> Four payments of $37.50 on Jun 3, Jun 17, Jul 1, Jul 15.
> Two payments you already saved also fall on Jun 3 — $75.00 that day.

That is the whole job. Dates and amounts, from plans you entered yourself, laid out before you
decide. It does not tell you what to do, and it has no opinion about your purchase. It shows you
the dates and gets out of the way.

## What it does not do

- **No bank connection.** It cannot see your accounts, and it never asks to.
- **No account and no sign-in.** Nothing to register, nothing to log in to, no password.
- **No tracking of what you buy.** No browsing history, no other tabs, no page contents beyond
  those four numbers.
- **No data sent to a server.** There is no server. See [Privacy](#privacy) for what that means
  concretely.
- **No ads.**
- **No affiliate links, no commission, no referral fee, no money from any lender.**
- **Nothing sold.** Not your numbers, not a paid tier, not a premium version. There is no revenue
  mechanism in this of any kind.

It costs nothing, and what it shows you is never behind a paywall. That is easy to promise because
there is nothing here that costs money to run: no server holding your information, no bank
connection to maintain.

That list is the product, not a disclaimer at the bottom of one.

## Where it works, and where it doesn't

At launch it will recognise payment-plan offers on:

- **Shopify** checkouts
- **Stripe-hosted** checkouts
- **Whop**

**Everywhere else — including Amazon — it will usually not recognise the checkout.** When that
happens it says so plainly: *"We don't recognise this checkout yet."* You can then type the plan in
by hand, and the calendar works exactly the same. It will never guess.

That limit is real and worth stating twice: **coverage is partial, and it will stay partial.**
Checkouts change whenever a shop updates its site, and when one changes, this stops recognising it
until it is fixed and an update goes through store review. So there are two honest outcomes and no
third one: either it reads the numbers and asks you to check them, or it says it can't and hands
you a blank form. It will not show a number it isn't certain of. A confident wrong number, at the
moment someone is deciding whether to borrow, is the one thing that will not ship here.

### What it can't see

- Your bank account, your cards, or any plan you didn't enter.
- Plans you set up before you installed it, on another device, or on your phone.
- Your income. "Your next 30 days" means the plans you entered, and nothing else.
- Anything after you clear your browser data or uninstall it. It does not sync. It's gone.

## Privacy

Not a slogan. Here is the whole of it.

**What is stored:** the order total, the number of payments, how often they fall due, and the
amount of each payment — for each plan you save. Plus your own settings. That is the complete list.

**Where it is stored:** local extension storage, in your browser, on your computer. Nothing else
holds a copy.

**What is transmitted:** nothing. The extension makes no network connections at all. The
instructions it uses to read a checkout are bundled inside the package and change only when a new
version ships through the store — nothing is fetched while it runs, and no code is downloaded after
you install it. Open your browser's network tab while it's working and it is empty. That is
checkable in about a minute, and it is meant to be.

**Counting how it's used:** there is one setting, off unless you switch it on, that sends a plain
count of things like "the panel was shown." No amounts, no shop names, no web addresses, no
identifier for you or your copy. Left off, it changes nothing about how any of this works.

## Installing

**Once it's released:** from the Chrome Web Store, in Canada and the United States, for Chrome and
Chromium-based browsers. The link goes here when there is one to link to.

**From source:** there is no application code in this repository yet, so there is nothing to build
today. When there is, the full steps live here — clone, install dependencies, run the build, then
load the built folder through your browser's extensions page with developer mode switched on.
Releases will be tagged, and a clean build of a tag is meant to match the package published to the
store byte for byte, so that anyone who wants to can check the two against each other.

## Why trust this

It's a fair question, and the honest context is this: a browser extension sitting at a checkout has
to earn its way past a bad recent history. One of the largest of them was found replacing other
people's affiliate links with its own, and several million people uninstalled it. Assuming any
checkout extension is playing an angle is now a sensible default.

Three answers, none of which is "trust us":

1. **The code is here.** All of it, as it's written, in public, under a licence that obliges anyone
   distributing a modified version to publish their changes too.
2. **It makes no network calls.** You don't have to take that on faith — the network tab settles it.
3. **Nobody is paid when you borrow.** No commission from a shop, no fee from a lender, no
   affiliate arrangement, no paid tier. There is nothing to buy in here and no one paying for
   placement.

There is other software at a checkout, and some of it is good at what it is built for. Most of it
is built by the companies lending you the money, or it earns a commission when you buy. This takes
nothing from either side. Having no stake in whether you click Buy is the entire reason it can just
show you the dates.

## Who made it

Built by the people making Pegasus, a personal-finance platform launching in 2026. Pegasus connects
your accounts read-only and tells you what your numbers mean, not just what they are. It is a
separate, paid product. You don't need it for this to work — there is no account to make here, and
nothing in this repository connects to it.

## Licence

**GPL-3.0.** The full text is in [LICENSE](LICENSE).

The code is licensed. The names and marks are not: "Pegasus" and "Pegasus Payment Plan Calendar"
are not covered by the GPL grant, so a fork is free to exist and welcome to, under its own name.

Other names mentioned here — Shopify, Stripe, Amazon, Whop — belong to their respective owners and
are used only to describe which checkouts this reads. This project is not affiliated with,
endorsed by, or connected to any of them, or to any lender.

## Contributing

Issues are welcome, and the most useful one is a checkout it should recognise and doesn't — with
the shop and what you saw.

This is built by one person alongside other work, so triage is best-effort and sometimes slow.
That's an honest posture rather than an apology.

Contributions are accepted under a contributor licence agreement. `CONTRIBUTING.md` and the CLA
text will be published here before the first code lands — there are no terms to read yet, and none
are being invented in this paragraph.

For anything that looks like a security problem, open an issue for now; a `SECURITY.md` with a
private channel arrives with the first code.
