/**
 * The toolbar popup's own controller: the 30-day-adjacent hero view,
 * settings (with the first-run measurement ask folded into "Continue"),
 * the genuineness screen (src/overlay/ToolbarVerification.ts), and the
 * email invite link-out. This popup only ever opens from the browser's own
 * toolbar (declared as `action.default_popup` in the manifest) — no page
 * can make it appear and no page can put anything inside it, which is
 * exactly what makes it the one place genuineness language and the
 * Pegasus mention are allowed (T14, D5 §D).
 *
 * T14: nothing in this file is a credential/PII input. The email invite is
 * a link-out (`window.open`/`chrome.tabs.create` to a static, developer-
 * authored URL) — there is no `<input type="email">` or any other field
 * anywhere in this module.
 */
import type { PaymentPlanRecord } from "../shared/types";
import { formatCents } from "../shared/format";
import { addCents, type Cents, ZERO_CENTS } from "../shared/money";
import { PlanLedger, STORAGE_KEY_ALLOWLIST, type Settings } from "../storage/ledger";
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

function switchRow(labelText: string, checked: boolean, onToggle: (next: boolean) => void, desc?: string): HTMLDivElement {
  const labelId = `ppc-sw-${labelText.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  const textCol = el("div", {
    className: "popup__row-text",
    attrs: { id: labelId },
    children: [text(labelText), desc ? el("div", { className: "popup__row-desc", text: desc }) : null],
  });
  const btn = el("button", {
    attrs: { type: "button", role: "switch", "aria-checked": String(checked), "aria-labelledby": labelId },
    className: "switchbtn",
    children: [el("span", { className: checked ? "switch" : "switch switch--off", attrs: { "aria-hidden": "true" } })],
    on: {
      click: () => onToggle(!checked),
    },
  });
  return el("div", { className: "popup__row", children: [textCol, btn] });
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

  let screen: Screen = "hero";
  let onThisSite = true;
  let everywhere = true;

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
        }),
      );
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
      }),
    );

    const settings = await getSettings();
    const switches = el("div", { attrs: { style: "margin-top:16px" } });
    switches.appendChild(switchRow(copy.SWITCH_ON_THIS_SITE, onThisSite, (v) => { onThisSite = v; void render(); }));
    switches.appendChild(switchRow(copy.SWITCH_EVERYWHERE, everywhere, (v) => { everywhere = v; void render(); }));
    switches.appendChild(
      switchRow(copy.SWITCH_COUNT, settings.measurementEnabled, (v) => {
        void ledger.writeSettings({ measurementEnabled: v }).then(render);
      }),
    );
    body.appendChild(switches);

    const usage = await readUsageFlags(store);
    if (plans.length >= 1 && usage.viewedNext30 && !usage.inviteDismissed) {
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

  async function getSettings(): Promise<Settings> {
    const result = await store.get(["settings"]);
    const raw = result["settings"];
    if (raw && typeof raw === "object" && "measurementEnabled" in raw) return raw as Settings;
    return { measurementEnabled: false };
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

    const settings = await getSettings();
    const body = el("div", { className: "panel__body" });

    const whereGroup = el("div", {
      className: "settings__group",
      children: [
        el("div", { className: "settings__h", text: copy.SETTINGS_GROUP_WHERE }),
        switchRow(copy.SWITCH_EVERYWHERE, everywhere, (v) => { everywhere = v; void render(); }, copy.SETTINGS_EVERYWHERE_DESC),
      ],
    });
    body.appendChild(whereGroup);

    const countingGroup = el("div", {
      className: "settings__group",
      children: [
        el("div", { className: "settings__h", text: copy.SETTINGS_GROUP_COUNTING }),
        switchRow(copy.SWITCH_COUNT, settings.measurementEnabled, (v) => {
          void ledger.writeSettings({ measurementEnabled: v }).then(render);
        }, copy.SETTINGS_COUNT_DESC),
        el("p", { className: "settings__note", text: copy.SETTINGS_COUNT_NOTE }),
      ],
    });
    body.appendChild(countingGroup);

    const dataGroup = el("div", {
      className: "settings__group",
      children: [
        el("div", { className: "settings__h", text: copy.SETTINGS_GROUP_DATA }),
        el("p", { className: "settings__note", attrs: { style: "margin-top:0" }, text: copy.SETTINGS_DATA_NOTE }),
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
    await store.remove([...STORAGE_KEY_ALLOWLIST, "usage"]);
  }

  async function renderOnboard(): Promise<void> {
    const section = el("section", { className: "onboard", attrs: { "aria-labelledby": "ppc-onboard-h" } });
    section.appendChild(el("div", { className: "onboard__eyebrow", text: copy.ONBOARD_EYEBROW }));
    section.appendChild(el("h3", { attrs: { id: "ppc-onboard-h" }, text: copy.ONBOARD_TITLE }));
    section.appendChild(el("p", { text: copy.ONBOARD_BODY }));

    let pageReadingOn: boolean | null = null;
    const turnOnBtn = el("button", {
      className: "btn btn--primary",
      attrs: { type: "button", "aria-pressed": "false" },
      children: [
        el("span", {
          className: "btn__check",
          attrs: { "aria-hidden": "true" },
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
        }),
        text(copy.ONBOARD_NO_THANKS),
      ],
    });
    turnOnBtn.addEventListener("click", () => {
      pageReadingOn = true;
      turnOnBtn.setAttribute("aria-pressed", "true");
      noThanksBtn.setAttribute("aria-pressed", "false");
    });
    noThanksBtn.addEventListener("click", () => {
      pageReadingOn = false;
      noThanksBtn.setAttribute("aria-pressed", "true");
      turnOnBtn.setAttribute("aria-pressed", "false");
    });
    section.appendChild(el("div", { className: "actions", attrs: { "data-consent-pair": "" }, children: [turnOnBtn, noThanksBtn] }));
    section.appendChild(el("p", { className: "onboard__skipnote", text: copy.ONBOARD_SKIP_NOTE }));

    const countBlock = el("div", { className: "onboard__block" });
    countBlock.appendChild(el("h4", { text: copy.ONBOARD_COUNT_HEADING }));
    countBlock.appendChild(el("p", { text: copy.ONBOARD_COUNT_BODY }));
    let countingOn = false;
    const countRow = el("div", { className: "onboard__row" });
    countRow.appendChild(switchRow(copy.SWITCH_COUNT, countingOn, (v) => {
      countingOn = v;
      void render();
    }));
    countBlock.appendChild(countRow);
    countBlock.appendChild(el("p", { className: "settings__note", text: copy.SETTINGS_COUNT_NOTE }));
    section.appendChild(countBlock);

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
                onThisSite = pageReadingOn === true;
                everywhere = pageReadingOn === true;
                void ledger.writeSettings({ measurementEnabled: countingOn }).then(() => go("hero"));
              },
            },
          }),
        ],
      }),
    );

    container.appendChild(section);
  }

  function go(next: Screen): void {
    screen = next;
    void render();
  }

  async function init(): Promise<void> {
    const result = await store.get(["settings"]);
    screen = result["settings"] ? "hero" : "onboard";
    await render();
  }

  return { init, go };
}

/** Re-exported for the overlay to record "the 30-day view was opened" (§E.4). */
export { markViewedNext30 };
