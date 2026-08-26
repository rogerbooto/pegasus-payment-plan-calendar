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
 *
 * X2/X3 (first-run UX spec): a state change INSIDE a screen (the Settings
 * consent switch) updates itself in place and never calls `render()` --
 * only navigation between screens (`go()`) does, and every navigation
 * moves focus to the new screen's own heading, `h2.panel__title` or
 * `h3#ppc-onboard-h` (carrying `tabindex="-1"`), except the two deliberate
 * exceptions noted at their call sites below (manual entry keeps its own
 * field focus; the post-add hero focuses the status line instead).
 */
import type { PaymentPlanRecord } from "../shared/types";
import { formatCents } from "../shared/format";
import { addCents, type Cents, ZERO_CENTS } from "../shared/money";
import { PlanLedger, STORAGE_KEY_ALLOWLIST } from "../storage/ledger";
import { chromeLocalStore, type KeyValueStore } from "../storage/store";
import { paymentDates } from "../impact/engine";
import { renderManualEntrySheet } from "../overlay/ConfirmationSheet";
import { renderToolbarVerification } from "../overlay/ToolbarVerification";
import { buildConsentSwitchRow } from "./ConsentSwitch";
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
   * X1 (first-run UX spec): one flag, not two. Replaces the former
   * `showPinHint: boolean`. Defaults to "popup" -- the surface that opens
   * from the browser's own toolbar icon and closes the moment it loses
   * focus. src/welcome/welcome.ts passes `"tab"`: the first-run welcome
   * tab, opened once on install because Chrome does not pin a fresh
   * install's icon (and no extension API can force that pin) -- a tab
   * does NOT close on blur, so it needs its own exit affordance (§2) and
   * shows the pin-location hint the popup never needs.
   */
  readonly surface?: "popup" | "tab";
  /**
   * Testing-only override for the tab-surface "Close this tab" control
   * (§2.6). Real callers never pass this. The default sequence --
   * `chrome.tabs.getCurrent()` then `chrome.tabs.remove(tab.id)`, falling
   * back to `window.close()` -- needs no manifest permission: the "tabs"
   * permission only gates `url`/`pendingUrl`/`title`/`favIconUrl` on
   * `tabs.query()`, not the namespace itself (the same reasoning
   * service-worker.ts already relies on for `chrome.tabs.create`).
   */
  readonly closeSurface?: () => void;
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

/** Moves focus to a screen's own heading on navigation (X3), giving it
 * `tabindex="-1"` so it is programmatically focusable without joining the
 * tab order. Pointer users never see a focus ring here -- the existing
 * global `:focus-visible` rule already suppresses that for mouse/touch
 * activation, so this deliberately does not set `outline: none`. */
function moveFocusToHeading(root: HTMLElement, selector: string): void {
  const heading = root.querySelector(selector) as HTMLElement | null;
  if (!heading) return;
  heading.setAttribute("tabindex", "-1");
  heading.focus();
}

function defaultCloseSurface(): void {
  const w = typeof window !== "undefined" ? window : undefined;
  if (typeof chrome !== "undefined" && chrome.tabs?.getCurrent && chrome.tabs?.remove) {
    void chrome.tabs
      .getCurrent()
      .then((tab) => {
        if (tab?.id !== undefined) return chrome.tabs.remove(tab.id);
        w?.close();
        return undefined;
      })
      .catch(() => w?.close());
    return;
  }
  w?.close();
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
  const surface = deps.surface ?? "popup";
  const closeSurface = deps.closeSurface ?? defaultCloseSurface;

  let screen: Screen = "hero";
  /**
   * §2.4 -- transient, in-memory only. Set by the manual-entry `onConfirm`
   * handler below, consumed (and cleared) by the very next hero render.
   * Never touches storage: re-opening the popup later, or a fresh
   * `createPopupApp(...).init()` against the same store, must not
   * re-announce an old add.
   */
  let justAdded = false;

  async function render(): Promise<void> {
    clear(container);
    container.className = surface === "tab" ? "popup-root popup-root--tab" : "popup-root";

    if (screen === "onboard") {
      await renderOnboard();
      moveFocusToHeading(container, "#ppc-onboard-h");
      return;
    }

    const panel = el("section", { className: "panel popup", attrs: { "aria-labelledby": "ppc-popup-title" } });
    container.appendChild(panel);

    if (screen === "verify") {
      renderToolbarVerification(panel, { onBack: () => go("settings") });
      moveFocusToHeading(container, ".panel__title");
      return;
    }

    if (screen === "settings") {
      await renderSettings(panel);
      moveFocusToHeading(container, ".panel__title");
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
          justAdded = true;
          go("hero");
        },
        onCancel: () => go("hero"),
      });
      panel.appendChild(head);
      panel.appendChild(body);
      // X3 exception: renderManualEntrySheet (ConfirmationSheet.ts)
      // already moved focus to the order-total field. Stealing it back to
      // the heading here would undo that deliberate, documented exception.
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
          className: "iconbtn iconbtn--labeled",
          attrs: { type: "button", "aria-label": copy.POPUP_SETTINGS_LABEL },
          children: [
            el("span", { className: "iconbtn__glyph", attrs: { "aria-hidden": "true" }, text: "⚙" }),
            el("span", { className: "iconbtn__label", text: copy.POPUP_SETTINGS_LABEL }),
          ],
          on: { click: () => go("settings") },
        }),
      ],
    });

    const plans = await ledger.listPlans();
    const body = el("div", { className: "panel__body" });

    // §2.4 S3 -- consumed exactly once: this render shows it, and it is
    // cleared before the function returns, so no later render (a Settings
    // round-trip, a fresh popup open, a fresh init() against the same
    // store) can ever show a stale "Added." from an earlier session.
    const showJustAdded = justAdded;
    justAdded = false;

    let statusEl: HTMLElement | null = null;
    if (showJustAdded) {
      statusEl = el("p", {
        className: "status",
        attrs: { role: "status", tabindex: "-1" },
        text: overlayCopy.SAVED_STATUS,
      });
      body.appendChild(statusEl);
    }

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

    // §2.2/§2.5 -- tab-only, on every hero state, directly above the
    // actions row it explains. Never on the popup (S1/X1): a user already
    // looking at the toolbar popup has, by definition, already found the
    // icon, and closing it is just clicking away.
    if (surface === "tab") {
      body.appendChild(el("p", { className: "hero__donenote", text: copy.TAB_DONE_NOTE }));
    }

    const addBtn = el("button", {
      className: surface === "tab" && showJustAdded ? "btn btn--ghost" : "btn btn--primary",
      attrs: { type: "button" },
      text: overlayCopy.ACTION_ADD,
      on: { click: () => go("manual") },
    });

    const actionChildren: HTMLElement[] = [];
    if (surface === "tab") {
      const closeBtn = el("button", {
        className: showJustAdded ? "btn btn--primary" : "btn btn--ghost",
        attrs: { type: "button" },
        text: copy.CLOSE_TAB_LABEL,
        on: { click: () => closeSurface() },
      });
      // §2.5/S4 -- exactly one .btn--primary in every state: before an
      // add, [Add a plan] leads and is primary; the moment one is added,
      // the emphasis (and the DOM order) flips to [Close this tab] first
      // -- a deterministic reshuffle paired with the focus move above,
      // never a silent one.
      if (showJustAdded) {
        actionChildren.push(closeBtn, addBtn);
      } else {
        actionChildren.push(addBtn, closeBtn);
      }
    } else {
      actionChildren.push(addBtn);
    }
    body.appendChild(el("div", { className: "actions", children: actionChildren }));

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

    // X3 exception: the post-add hero focuses the status line, not the
    // heading -- it is inserted during this same render, so a role="status"
    // region cannot be relied on alone to announce it (live regions must
    // pre-exist to fire reliably in every engine). Moving focus there
    // guarantees it is read, immediately before the actions row whose
    // emphasis just changed.
    if (showJustAdded && statusEl) {
      statusEl.focus();
    } else {
      moveFocusToHeading(container, ".panel__title");
    }
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

    // §1.6/X2 -- pessimistic: write first, reflect only once the write
    // resolves. `pending` blocks a second click mid-flight without ever
    // disabling the button (a disabled button cannot hold focus, which
    // would reintroduce D2/D9 on every toggle). `errorSlot` is a stable
    // node this closure owns for the lifetime of this screen -- it is
    // never touched by a full re-render, only by this handler.
    let pending = false;
    const errorSlot = el("div", {});

    // A mutable-property holder (never itself reassigned) rather than a
    // `let` rebound after construction: `onToggle` below is captured by
    // the switch's own click handler at construction time and only ever
    // fires later (after `handle.current` is populated), so this is not
    // a real temporal-dead-zone hazard -- it just keeps the binding
    // itself a `const`.
    const handle: { current?: ReturnType<typeof buildConsentSwitchRow> } = {};
    handle.current = buildConsentSwitchRow({
      idPrefix: "ppc-settings-consent",
      checked: checkoutReadingEnabled,
      // Settings shows the static description regardless of state --
      // unlike the first-run screen, there is no "before you decide"
      // framing left to state here.
      descriptionFor: () => copy.SETTINGS_CHECKOUT_READING_DESC,
      onToggle: (next) => {
        if (pending) return;
        pending = true;
        void ledger
          .writeSettings({ checkoutReadingEnabled: next })
          .then(() => {
            pending = false;
            clear(errorSlot);
            handle.current?.setChecked(next);
          })
          .catch(() => {
            pending = false;
            // Reverts to the pre-click value: setChecked() above is only
            // ever called on a SUCCESSFUL write, so a rejected write
            // never leaves the switch showing anything storage doesn't
            // actually hold.
            clear(errorSlot);
            errorSlot.appendChild(
              el("p", { className: "note", attrs: { role: "alert" }, text: copy.SETTINGS_TOGGLE_FAILED }),);
          });
      },
    });

    const dataGroup = el("div", { className: "settings__group" });
    dataGroup.appendChild(el("div", { className: "settings__h", text: copy.SETTINGS_GROUP_DATA }));
    dataGroup.appendChild(handle.current.row);
    dataGroup.appendChild(errorSlot);
    dataGroup.appendChild(el("p", { className: "settings__note", text: copy.SETTINGS_DATA_NOTE }));
    dataGroup.appendChild(
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
      }),);
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

    // §1.3/§1.6 -- local UI state only. Nothing here is written until
    // Continue is pressed below (§1.4): `settings === null` is the
    // has-onboarded sentinel elsewhere in this file, and an immediate
    // write on this screen (as Settings' own toggle does) would mark
    // onboarding complete the moment the switch is brushed, before the
    // user has finished reading ONBOARD_BODY. Always starts OFF -- never
    // pre-set to on, never a third visual state (§1.3).
    let localChecked = false;
    const handle: { current?: ReturnType<typeof buildConsentSwitchRow> } = {};
    handle.current = buildConsentSwitchRow({
      idPrefix: "ppc-onboard-consent",
      checked: false,
      descriptionFor: (checked) => (checked ? copy.ONBOARD_CONSENT_STATE_ON : copy.ONBOARD_CONSENT_STATE_OFF),
      onToggle: (next) => {
        localChecked = next;
        handle.current?.setChecked(next);
      },
    });
    section.appendChild(handle.current.row);

    section.appendChild(el("p", { className: "onboard__skipnote", text: copy.ONBOARD_SKIP_NOTE }));
    section.appendChild(el("p", { className: "onboard__skipnote", text: copy.ONBOARD_SAVE_NOTE }));
    if (surface === "tab") {
      section.appendChild(el("p", { className: "onboard__skipnote", text: copy.ONBOARD_PIN_HINT }));
    }

    section.appendChild(
      el("div", {
        className: "actions onboard__actions",
        children: [
          el("button", {
            className: "btn btn--primary",
            attrs: { type: "button" },
            text: copy.ONBOARD_CONTINUE,
            on: {
              click: () => {
                // Continue performs the single writeSettings call (§1.4).
                // Continue-without-touching-the-switch persists `false` --
                // the same safe, not-reading default the switch itself
                // was already showing, never an implicit "yes".
                const checkoutReadingEnabled = localChecked;
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
