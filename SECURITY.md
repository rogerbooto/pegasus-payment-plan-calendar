# Security

## Reporting

Please report anything security-relevant privately rather than in a public issue.
Use GitHub's **Report a vulnerability** button on this repository's Security tab,
which opens a private advisory.

This is a one-person project, so a reply may take a few days. You will get one.

## What is in scope

- Anything that could make the panel show a **wrong number** at a checkout. This
  is the failure that matters most here: someone deciding whether to borrow, shown
  a figure that isn't right.
- Anything that gets data out of the extension. It is designed so that nothing
  leaves the device, and there is no network code at all — a way around that is a
  real finding.
- Anything that lets a page reach into the extension: message spoofing, breaking
  the overlay's isolation, or reading what is stored.
- Anything that lets a page or a shop influence what gets parsed or displayed.

## What is already known, and accepted

Stated plainly so nobody spends time rediscovering them:

- **A page can draw a convincing copy of the panel.** Anything rendered inside a
  web page can be imitated by that page. The extension's own toolbar is the only
  surface a page cannot draw, and it never asks for a password, a card number, or
  an account. This is a real limitation, not a solved problem.
- **A page can cover, move, or hide the panel.** Isolation protects what the panel
  contains, not whether you can see it.
- **Stored data is not encrypted at rest.** It is what you typed in — plan amounts
  and dates — and nothing else. No tokens, no personal details, no shop names.
- **Store updates install silently**, as they do for every extension. The build is
  deterministic and dependencies are pinned, which narrows the window; it does not
  close it.

## Scope note

There is no server, no account, and no API. If a report depends on one of those
existing, it is describing a different product.
