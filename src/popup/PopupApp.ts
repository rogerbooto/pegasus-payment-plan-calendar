/**
 * The toolbar popup's own controller: the 30-day-adjacent hero view,
 * settings, the genuineness screen (src/overlay/ToolbarVerification.ts),
 * and the email invite link-out. This popup only ever opens from the
 * browser's own toolbar (declared as `action.default_popup` in the
 * manifest) or from the first-run welcome tab (src/welcome/welcome.ts,
 * opened once on fresh install by the service worker) — no page can make
 * it appear and no page can put anything inside it, which is exactly what
 * makes it the one place genuineness language and the Pegasus mention are
 * allowed (T14, the design spec). The welcome tab mounts this exact
 * controller rather than a second copy of it, so the onboarding
 * disclosure and the consent choice it writes have exactly one
 * implementation regardless of which surface a first-run user lands on.
 *
 * T14: nothing in this file is a credential/PII input. The email invite is
 * a link-out (`window.open`/`chrome.tabs.create` to a static, developer-
 * authored URL) — there is no `<input type="email">` or any other field
 * anywhere in this module.
 */
import type { PaymentPlanRecord } from "../shared/types";
import { formatCents } from "../shared/format";
import { addCents, type Cents, ZERO_CENTS } from "../shared/money";
import { PlanLedger, STORAGE_KEY_ALLOWLIST } from "../storage/ledger";
import { chromeLocalStore, type KeyValueStore } from "../storage/store";
import { paymentDates } from "../impact/engine";
import { renderManualEntrySheet } from "../overlay/ConfirmationSheet";
import { renderToolbarVerification } from "../overlay/ToolbarVerification";
import { el, clear, text } from "../overlay/dom";
import { todayIsoDate } from "../overlay/format-helpers";
import * as overlayCopy from "../overlay/copy";
import * as copy from "./copy";
import { markInviteDismissed, markViewedNext30, readUsageFlags } from "./usage-tracking";

export interface PopupAppDeps {
  readonly store?: KeyValueStore;
  readonly ledger?: PlanLedger;
  readonly today?: () => string;
  readonly openUrl?: (url: string) => void;
  /**
   * Testing-only override for copy.MARKETING_HOST_CONFIGURED. Real callers
   * never pass this: it exists so the invite's rendering logic is exercised
   * without needing a real, resolvable MARKETING_HOST checked into source.
   */
  readonly marketingHostConfigured?: boolean;
  /**
   * Set only by src/welcome/welcome.ts. Chrome does not pin a freshly
   * installed extension's toolbar icon, and no extension API can force
   * one — so a fresh install may have no other reachable route back to
   * this onboarding screen than the welcome tab itself. When true, the
   * onboarding screen adds one plain line telling the user where the icon
   * lives. The toolbar popup itself never sets this: a user already
   * looking at the toolbar popup has, by definition, already found the
   * icon.
   */
  readonly showPinHint?: boolean;
}

type Screen = "hero" | "settings" | "verify" | "onboard" | "manual";

const NEXT30_WINDOW_DAYS = 29;

function addDaysIso(date: string, days: number): string {
  const [y, m, d] = date.split("-").map((s) => parseInt(s, 10));
  const dt = new Date(Date.UTC(y as number, (m as number) - 1, d as number));
  dt.setUTCDate(dt.getUTCDate() + days);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

function next30Total(plans: readonly PaymentPlanRecord[], today: string): { totalCents: Cents; count: number } {
  const end = addDaysIso(today, NEXT30_WINDOW_DAYS);
  let count = 0;
  let totalCents = ZERO_CENTS;
  for (const plan of plans) {
    for (const date of paymentDates(plan)) {
      if (date < today || date > end) continue;
      count += 1;
      totalCents = addCents(totalCents, plan.perInstallmentCents);
    }
  }
  return { totalCents, count };
}

export function createPopupApp(container: HTMLElement, deps: PopupAppDeps = {}) {
  const store = deps.store ?? chromeLocalStore;
  const ledger = deps.ledger ?? new PlanLedger(store);
  const today = deps.today ?? (() => todayIsoDate());
  const openUrl =
    deps.openUrl ??
    ((url: string) => {
      if (typeof chrome !== "undefined" && chrome.tabs?.create) {
        void chrome.tabs.create({ url });
      } else if (typeof window !== "undefined") {
        window.open(url, "_blank", "noopener");
      }
    });
  const marketingHostConfigured = deps.marketingHostConfigured ?? copy.MARKETING_HOST_CONFIGURED;
  const showPinHint = deps.showPinHint ?? false;

  let screen: Screen = "hero";

  async function render(): Promise<void> {
    clear(container);
    container.className = "popup-root";

    if (screen === "onboard") {
      await renderOnboard();
      return;
    }

    const panel = el("section", { className: "panel popup", attrs: { "aria-labelledby": "ppc-popup-title" } });
    container.appendChild(panel);

    if (screen === "verify") {
      renderToolbarVerification(panel, { onBack: () => go("settings") });
      return;
    }

    if (screen === "settings") {
      await renderSettings(panel);
      return;
    }

    if (screen === "manual") {
      const head = el("div", {
        className: "panel__head",
        children: [el("h2", { className: "panel__title", attrs: { id: "ppc-popup-title" }, text: overlayCopy.ACTION_ADD })],
      });
      const body = el("div", { className: "panel__body" });
      renderManualEntrySheet(body, {
        onConfirm: async (record) => {
          await ledger.addPlan(record);
          go("hero");
        },
        onCancel: () => go("hero"),
      });
      panel.appendChild(head);
      panel.appendChild(body);
      return;
    }

    await renderHero(panel);
  }

  async function renderHero(panel: HTMLElement): Promise<void> {
    const head = el("div", {
      className: "panel__head",
      children: [
        el("h2", { className: "panel__title", attrs: { id: "ppc-popup-title" }, text: overlayCopy.PANEL_TITLE }),
        el("button", {
          className: "iconbtn",
          attrs: { type: "button", "aria-label": copy.POPUP_SETTINGS_LABEL },
          text: "⚙",
          on: { click: () => go("settings") },
        }),
      ],
    });

    const plans = await ledger.listPlans();
    const body = el("div", { className: "panel__body" });

    if (plans.length < 1) {
      body.appendChild(el("p", { className: "plain", text: overlayCopy.POPUP_EMPTY_LEDGER }));
    } else {
      const { totalCents, count } = next30Total(plans, today());
      const parts = overlayCopy.next30SummaryParts(formatCents(totalCents, plans[0]?.currency ?? "CAD"), count);
      body.appendChild(
        el("p", {
          className: "summary",
          children: [text(`${parts.lead} `), el("b", { text: parts.sum }), text(` ${parts.mid} `), el("b", { text: parts.n }), text(` ${parts.tail}`)],
        }),);
    }

    body.appendChild(
      el("div", {
        className: "actions",
        children: [
          el("button", {
            className: "btn btn--primary",
            attrs: { type: "button" },
            text: overlayCopy.ACTION_ADD,
            on: { click: () => go("manual") },
          }),
        ],
      }),);

    const usage = await readUsageFlags(store);
    if (plans.length >= 1 && usage.viewedNext30 && !usage.inviteDismissed && marketingHostConfigured) {
      body.appendChild(buildInvite());
    }

    const foot = el("div", {
      className: "panel__foot",
      children: [
        el("span", { text: overlayCopy.QUALIFIER_SOURCE }),
        el("span", { text: overlayCopy.QUALIFIER_LOCAL }),
        el("span", { className: "mention", text: copy.MENTION }),
      ],
    });

    panel.appendChild(head);
    panel.appendChild(body);
    panel.appendChild(foot);
  }

  function buildInvite(): HTMLDivElement {
    return el("div", {
      className: "invite",
      children: [
        el("p", { text: copy.INVITE_BODY }),
        el("div", {
          className: "actions",
          children: [
            el("button", {
              className: "btn btn--ghost btn--sm",
              attrs: { type: "button" },
              text: copy.INVITE_LEAVE_EMAIL,
              on: {
                click: () => {
                  openUrl(copy.LAUNCH_NOTIFY_URL);
                  void markInviteDismissed(store).then(render);
                },
              },
            }),
            el("button", {
              className: "btn btn--ghost btn--sm",
              attrs: { type: "button" },
              text: copy.INVITE_NO_THANKS,
              on: { click: () => void markInviteDismissed(store).then(render) },
            }),
          ],
        }),
      ],
    });
  }

  async function renderSettings(panel: HTMLElement): Promise<void> {
    const head = el("div", {
      className: "panel__head",
      children: [
        el("h2", { className: "panel__title", attrs: { id: "ppc-popup-title" }, text: copy.SETTINGS_TITLE }),
        el("button", {
          className: "iconbtn",
          attrs: { type: "button", "aria-label": copy.SETTINGS_CLOSE_LABEL },
          text: "×",
          on: { click: () => go("hero") },
        }),
      ],
    });

    const body = el("div", { className: "panel__body" });

    // Backed by real state (checkoutReadingEnabled, src/storage/ledger.ts)
    // -- see the comment on copy.SETTINGS_CHECKOUT_READING_LABEL for why
    // this is not the same thing as the still-withheld "On this site" /
    // "Everywhere" per-origin pair. Reading it fresh on every render (not
    // threaded through as a prop) keeps this screen honest about
    // whatever the content script will actually gate on next.
    const settings = await ledger.readSettings();
    const checkoutReadingEnabled = settings?.checkoutReadingEnabled ?? false;

    const checkoutReadingRow = el("div", {
      className: "popup__row",
      children: [
        el("div", {
          className: "popup__row-text",
          children: [
            el("div", { text: copy.SETTINGS_CHECKOUT_READING_LABEL }),
            el("div", { className: "popup__row-desc", text: copy.SETTINGS_CHECKOUT_READING_DESC }),
          ],
        }),
        el("button", {
          className: "switchbtn",
          attrs: {
            type: "button",
            role: "switch",
            "aria-checked": String(checkoutReadingEnabled),
            "aria-label": copy.SETTINGS_CHECKOUT_READING_LABEL,
          },
          children: [
            el("span", {
              className: checkoutReadingEnabled ? "switch" : "switch switch--off",
              attrs: { "aria-hidden": "true" },
            }),
          ],
          on: {
            click: () =>
              void ledger.writeSettings({ checkoutReadingEnabled: !checkoutReadingEnabled }).then(render),
          },
        }),
      ],
    });

    const dataGroup = el("div", {
      className: "settings__group",
      children: [
        el("div", { className: "settings__h", text: copy.SETTINGS_GROUP_DATA }),
        checkoutReadingRow,
        el("p", { className: "settings__note", text: copy.SETTINGS_DATA_NOTE }),
        el("div", {
          className: "actions",
          children: [
            el("button", {
              className: "btn btn--ghost btn--sm",
              attrs: { type: "button" },
              text: copy.SETTINGS_DELETE_ALL,
              on: { click: () => void deleteAllData().then(render) },
            }),
          ],
        }),
      ],
    });
    body.appendChild(dataGroup);

    const aboutGroup = el("div", {
      className: "settings__group",
      children: [
        el("div", { className: "settings__h", text: copy.SETTINGS_GROUP_ABOUT }),
        el("div", {
          className: "actions",
          children: [
            el("button", {
              className: "btn btn--ghost btn--sm",
              attrs: { type: "button" },
              text: copy.SETTINGS_HOW_GENUINE,
              on: { click: () => go("verify") },
            }),
          ],
        }),
      ],
    });
    body.appendChild(aboutGroup);

    const foot = el("div", {
      className: "panel__foot",
      children: [
        el("span", { text: overlayCopy.QUALIFIER_SOURCE }),
        el("span", { text: overlayCopy.QUALIFIER_LOCAL }),
        el("span", { className: "mention", text: copy.MENTION }),
      ],
    });

    panel.appendChild(head);
    panel.appendChild(body);
    panel.appendChild(foot);
  }

  async function deleteAllData(): Promise<void> {
    await store.remove([...STORAGE_KEY_ALLOWLIST]);
  }

  async function renderOnboard(): Promise<void> {
    const section = el("section", { className: "onboard", attrs: { "aria-labelledby": "ppc-onboard-h" } });
    section.appendChild(el("div", { className: "onboard__eyebrow", text: copy.ONBOARD_EYEBROW }));
    section.appendChild(el("h3", { attrs: { id: "ppc-onboard-h" }, text: copy.ONBOARD_TITLE }));
    section.appendChild(el("p", { text: copy.ONBOARD_BODY }));

    // The real "pick one" pair: the chosen state is tracked here and is
    // the ONE thing Continue below persists as checkoutReadingEnabled
    // (storage/ledger.ts). `choice` starts at `null` -- "nothing picked
    // yet" is a distinct state from either button, and Continue must not
    // treat it as an implicit "yes" (see the click handler below for the
    // Continue-without-choosing default).
    let choice: boolean | null = null;

    const turnOnBtn = el("button", {
      className: "btn btn--primary",
      attrs: { type: "button", "aria-pressed": "false" },
      children: [
        el("span", {
          className: "btn__check",
          attrs: { "aria-hidden": "true" },
          text: "✓",
        }),
        text(copy.ONBOARD_TURN_ON),
      ],
    });
    const noThanksBtn = el("button", {
      className: "btn btn--ghost",
      attrs: { type: "button", "aria-pressed": "false" },
      children: [
        el("span", {
          className: "btn__check",
          attrs: { "aria-hidden": "true" },
          text: "✓",
        }),
        text(copy.ONBOARD_NO_THANKS),
      ],
    });
    turnOnBtn.addEventListener("click", () => {
      choice = true;
      turnOnBtn.setAttribute("aria-pressed", "true");
      noThanksBtn.setAttribute("aria-pressed", "false");
    });
    noThanksBtn.addEventListener("click", () => {
      choice = false;
      noThanksBtn.setAttribute("aria-pressed", "true");
      turnOnBtn.setAttribute("aria-pressed", "false");
    });
    section.appendChild(el("div", { className: "actions", attrs: { "data-consent-pair": "" }, children: [turnOnBtn, noThanksBtn] }));
    section.appendChild(el("p", { className: "onboard__skipnote", text: copy.ONBOARD_SKIP_NOTE }));
    if (showPinHint) {
      section.appendChild(el("p", { className: "onboard__skipnote", text: copy.ONBOARD_PIN_HINT }));
    }

    section.appendChild(
      el("div", {
        className: "actions",
        attrs: { style: "margin-top:22px" },
        children: [
          el("button", {
            className: "btn btn--primary",
            attrs: { type: "button" },
            text: copy.ONBOARD_CONTINUE,
            on: {
              click: () => {
                // Continue persists whichever of the pair was chosen.
                // Continue-without-choosing (choice still `null`) is
                // treated as "No thanks", not as "Turn this on" -- the
                // safe default is NOT reading checkout pages, made
                // explicit here rather than left to fall out of whatever
                // `Boolean(null)` happens to coerce to.
                const checkoutReadingEnabled = choice === true;
                void ledger.writeSettings({ checkoutReadingEnabled }).then(() => go("hero"));
              },
            },
          }),
        ],
      }),);

    container.appendChild(section);
  }

  function go(next: Screen): void {
    screen = next;
    void render();
  }

  async function init(): Promise<void> {
    const settings = await ledger.readSettings();
    screen = settings ? "hero" : "onboard";
    await render();
  }

  return { init, go };
}

/** Re-exported for the overlay to record "the 30-day view was opened" (§E.4). */
export { markViewedNext30 };
