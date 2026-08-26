/**
 * Popup-only user-facing strings, verbatim from the approved design
 * and the design spec's toolbar-only MENTION row. Shared
 * strings (qualifiers, "Add a plan", view labels) live in
 * src/overlay/copy.ts and are imported from there rather than duplicated.
 *
 * A control describing behaviour the product does not do is a
 * transparency failure, not a cosmetic one. Several strings that used to
 * live here (a "count how often this is used" toggle, "On this site" /
 * "Everywhere" switches, a 90-day auto-removal claim) were removed rather
 * than kept as dead copy — see the removal notes below each remaining
 * neighbour for why.
 */

export const SETTINGS_TITLE = "Settings";
export const SETTINGS_CLOSE_LABEL = "Close settings";
export const POPUP_SETTINGS_LABEL = "Settings";

export const OPEN_CALENDAR = "Open my calendar";

/**
 * "On this site" / "Everywhere" (a scope switch for page-reading) is not
 * rendered in this version. Reasoning: "On this site" needs a genuine
 * per-origin permission grant to mean anything (the deferred
 * optional_host_permissions + "Enable on this store" feature); until that
 * exists, "Everywhere" alone has no honest complement to sit next to, and
 * a single, ungrouped toggle claiming site-level control it can't offer
 * is the same failure mode as the switch it would replace. Both return
 * together, wired to real per-origin state, when that feature ships.
 */
export const SETTINGS_GROUP_DATA = "Your data";

/**
 * Unlike the "On this site" / "Everywhere" pair withheld above, this
 * control IS backed by real state: checkoutReadingEnabled
 * (src/storage/ledger.ts), the same global boolean the first-run screen
 * writes and src/messaging/content-script.ts gates on. It shows the
 * current value and flips it through ledger.writeSettings -- do not
 * confuse this with the withheld per-origin scope switch above; that one
 * is still withheld because no per-origin state exists yet. This one
 * clears that bar because the thing it claims to control is the thing
 * that actually controls behaviour.
 */
export const SETTINGS_CHECKOUT_READING_LABEL = "Read checkout pages";
export const SETTINGS_CHECKOUT_READING_DESC =
  "When this is on, checkout pages you visit are read for an installment-plan option — the same thing the first-run screen offered. Turning it off stops that right away, on any page already open. It does not remove any plans you've already saved.";
export const SETTINGS_DATA_NOTE = "You can delete everything stored here, any time, with the button below.";
export const SETTINGS_DELETE_ALL = "Delete all my data";
export const SETTINGS_GROUP_ABOUT = "About";
export const SETTINGS_HOW_GENUINE = "How to know it's genuine";

export const MENTION =
  "Built by the people making Pegasus, a personal-finance platform launching in 2026. You don't need it for this to work.";

export const INVITE_BODY =
  "Built by the people making Pegasus, a personal-finance platform launching in 2026. If you'd like one email when it launches, you can leave your address. It's never required, and this works exactly the same either way.";
export const INVITE_LEAVE_EMAIL = "Leave an email";
export const INVITE_NO_THANKS = "No thanks";

export const ONBOARD_EYEBROW = "Before we start";
export const ONBOARD_TITLE = "Payment Plan Calendar";
export const ONBOARD_BODY =
  "Until you turn this on, no checkout page is read. Once it's on, this looks at checkout pages you visit to spot an option to pay in installments. When it finds one, it reads four numbers — the order total, the number of payments, how often they're due, and the amount of each payment — and shows you those dates on a calendar next to plans you've already added. Everything stays on this device. Nothing is sent anywhere. You can turn it off again any time from Settings.";
export const ONBOARD_TURN_ON = "Turn this on";
export const ONBOARD_NO_THANKS = "No thanks";
export const ONBOARD_SKIP_NOTE = "Either way, adding plans by hand and the calendar still work.";
/**
 * A "counting how it's used" ask (onboarding's own copy of the removed
 * settings toggle, both from the same claim: "sends a plain count") is
 * not rendered in this version either — src/telemetry/sink.ts has zero
 * call sites; nothing is ever counted, so asking permission to count
 * something the product doesn't do would itself be the transparency
 * failure this file exists to avoid. It returns, worded for whatever it
 * actually does, alongside a real transport.
 */
export const ONBOARD_CONTINUE = "Continue";

/**
 * Shown only on the first-run welcome tab (src/welcome/welcome.ts), not in
 * the toolbar popup — see PopupAppDeps.showPinHint in PopupApp.ts. Chrome
 * does not pin a freshly installed extension's icon to the toolbar, and no
 * extension API can pin it on the extension's own behalf. This line says
 * where the icon actually is; it deliberately does NOT promise a way back
 * to this exact onboarding screen (there isn't one once settings exist —
 * the toolbar icon opens the ordinary view after that), and instead points
 * at Settings, where SETTINGS_CHECKOUT_READING_LABEL's control actually
 * lives and can be changed again later.
 */
export const ONBOARD_PIN_HINT =
  "To find this later, open your browser's extensions menu (the puzzle-piece icon in the toolbar) and pin this one to the toolbar. The choice above lives in Settings from then on, and you can change it there any time.";

/**
 * The only two Pegasus-family URLs permitted anywhere in the bundle
 *. The real marketing origin has
 * not been assigned in any spec this build was given (every reference
 * document uses the `<marketing-host>` placeholder); `.invalid` is the
 * IANA-reserved TLD for exactly this situation — a syntactically valid URL
 * guaranteed never to resolve — so this constant cannot silently ship
 * pointing at an unintended real domain. Replace with the real origin
 * before release; nothing else in the popup should ever need editing.
 */
export const MARKETING_HOST = "https://marketing.pegasus.invalid";
export const LAUNCH_NOTIFY_URL = `${MARKETING_HOST}/launch-notify`;

/**
 * True once MARKETING_HOST has been replaced with a real, resolvable
 * origin. The email invite (a link-out to LAUNCH_NOTIFY_URL) only renders
 * when this is true — a "leave an email" control that would link nowhere
 * is worse than no invite at all, and shipping it anyway would be exactly
 * the class of transparency failure this file's other removals address.
 * Flips automatically the moment MARKETING_HOST stops pointing at the
 * reserved `.invalid` placeholder; nothing else needs to change.
 */
export const MARKETING_HOST_CONFIGURED = !MARKETING_HOST.includes(".invalid");
