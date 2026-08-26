/**
 * The shared consent-switch row (first-run UX spec §1.5): the ONE
 * `role="switch"` control used by BOTH the onboarding screen and the
 * Settings screen, so a first-run user recognizes the exact control they
 * are shown later (§1.2's consistency argument) instead of meeting a
 * second, differently-shaped one for the same choice.
 *
 * Why a switch replaces the old "Turn this on" / "No thanks" button pair
 * (D1): a pair of buttons is a question, and gold-filling one of them
 * answers it in the permissive direction before the user touches
 * anything — while Continue-without-clicking actually persisted the
 * opposite value. A switch is a state display; rendering it off before
 * Continue is a true statement about the system (nothing is read yet),
 * not an answer put in the user's mouth.
 *
 * `aria-labelledby`/`aria-describedby` bind to the visible label and
 * description text that already sit beside the switch, so the accessible
 * name/description cannot drift from what a sighted user reads (WCAG
 * 2.5.3), and a screen-reader user hears the same thing sighted users see.
 *
 * `setChecked()` updates the mounted DOM node in place — attribute, class,
 * and text, never a rebuild — which is what X2 (a state change inside a
 * screen must not rebuild the screen) requires: a click handler can flip
 * the switch's own visual state without ever losing keyboard focus on it.
 */
import { el } from "../overlay/dom";
import { SETTINGS_CHECKOUT_READING_LABEL } from "./copy";

export interface ConsentSwitchOptions {
  /**
   * Must be unique per mounted instance (e.g. "ppc-onboard-consent" vs.
   * "ppc-settings-consent") so the generated label/description element
   * ids never collide between the onboarding screen and Settings.
   */
  readonly idPrefix: string;
  readonly checked: boolean;
  readonly descriptionFor: (checked: boolean) => string;
  /**
   * Caller decides what "toggled" means: local UI state only until a
   * later Continue (onboarding, §1.4), or an immediate, pessimistic
   * ledger write (Settings, §1.6). This builder never writes to storage
   * itself.
   */
  readonly onToggle: (next: boolean) => void;
}

export interface ConsentSwitchHandle {
  readonly row: HTMLDivElement;
  /**
   * In-place update: `aria-checked`, the knob's class, and the
   * description text. Never rebuilds the row — see X2 and the module
   * doc comment above.
   */
  setChecked(next: boolean): void;
  focus(): void;
}

export function buildConsentSwitchRow(opts: ConsentSwitchOptions): ConsentSwitchHandle {
  const labelId = `${opts.idPrefix}-label`;
  const descId = `${opts.idPrefix}-desc`;
  let checked = opts.checked;

  const knob = el("span", {
    className: checked ? "switch" : "switch switch--off",
    attrs: { "aria-hidden": "true" },
  });

  const button = el("button", {
    className: "switchbtn",
    attrs: {
      type: "button",
      role: "switch",
      "aria-checked": String(checked),
      "aria-labelledby": labelId,
      "aria-describedby": descId,
    },
    children: [knob],
    on: {
      // The button (not this builder) is the source of truth for
      // "checked" between clicks; `!checked` here always reflects
      // whatever setChecked() most recently applied.
      click: () => opts.onToggle(!checked),
    },
  });

  const descEl = el("div", {
    className: "popup__row-desc",
    attrs: { id: descId },
    text: opts.descriptionFor(checked),
  });

  const row = el("div", {
    className: "popup__row",
    attrs: { "data-consent-switch": "" },
    children: [
      el("div", {
        className: "popup__row-text",
        children: [el("div", { attrs: { id: labelId }, text: SETTINGS_CHECKOUT_READING_LABEL }), descEl],
      }),
      button,
    ],
  });

  return {
    row,
    setChecked(next: boolean): void {
      checked = next;
      button.setAttribute("aria-checked", String(checked));
      knob.className = checked ? "switch" : "switch switch--off";
      descEl.textContent = opts.descriptionFor(checked);
    },
    focus(): void {
      button.focus();
    },
  };
}
