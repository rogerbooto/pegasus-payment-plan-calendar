/**
 * Popup-only user-facing strings, verbatim from mockups/extension-chrome.html
 * and M11-M1-IMPACT-VIEW-SPEC.md §5's toolbar-only MENTION row. Shared
 * strings (qualifiers, "Add a plan", view labels) live in
 * src/overlay/copy.ts and are imported from there rather than duplicated.
 */

export const SETTINGS_TITLE = "Settings";
export const SETTINGS_CLOSE_LABEL = "Close settings";
export const POPUP_SETTINGS_LABEL = "Settings";

export const OPEN_CALENDAR = "Open my calendar";

export const SWITCH_ON_THIS_SITE = "On this site";
export const SWITCH_EVERYWHERE = "Everywhere";
export const SWITCH_COUNT = "Count how often this is used";

export const SETTINGS_GROUP_WHERE = "Where this runs";
export const SETTINGS_EVERYWHERE_DESC = "When this is off, no page is read on any site.";
export const SETTINGS_GROUP_COUNTING = "Counting how it's used";
export const SETTINGS_COUNT_DESC =
  "Five plain counts — like the panel being shown, or a plan being added. No amounts, no shop names, no web addresses, and nothing that identifies you.";
export const SETTINGS_COUNT_NOTE = "Off unless you turn it on. Turning it off changes nothing about how this works.";
export const SETTINGS_GROUP_DATA = "Your data";
export const SETTINGS_DATA_NOTE = "A plan is removed on its own 90 days after its last payment. You can also delete everything now.";
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
  "This looks at checkout pages you visit to spot an option to pay in installments. When it finds one, it reads four numbers — the order total, the number of payments, how often they're due, and the amount of each payment — and shows you those dates on a calendar next to plans you've already added. Everything stays on this device. Nothing is sent anywhere. You can turn this off for one site or everywhere, any time, in Settings.";
export const ONBOARD_TURN_ON = "Turn this on";
export const ONBOARD_NO_THANKS = "No thanks";
export const ONBOARD_SKIP_NOTE =
  "Either way, adding plans by hand and the calendar still work. You can turn page-reading on later, in Settings.";
export const ONBOARD_COUNT_HEADING = "Counting how it's used";
export const ONBOARD_COUNT_BODY =
  "If you'd like, this can also send a plain count of five things — like the panel being shown, or a plan being added — so we know whether it's useful. No amounts. No shop names. No web addresses, ever. Nothing that identifies you.";
export const ONBOARD_CONTINUE = "Continue";

/**
 * The only two Pegasus-family URLs permitted anywhere in the bundle
 * (M11-D5-MARKETPLACE-FIREWALL.md §D.3.1). The real marketing origin has
 * not been assigned in any spec this build was given (every reference
 * document uses the `<marketing-host>` placeholder); `.invalid` is the
 * IANA-reserved TLD for exactly this situation — a syntactically valid URL
 * guaranteed never to resolve — so this constant cannot silently ship
 * pointing at an unintended real domain. Replace with the real origin
 * before release; nothing else in the popup should ever need editing.
 */
export const MARKETING_HOST = "https://marketing.pegasus.invalid";
export const LAUNCH_NOTIFY_URL = `${MARKETING_HOST}/launch-notify`;
