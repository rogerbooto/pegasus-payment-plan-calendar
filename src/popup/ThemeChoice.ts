/**
 * The Settings-only appearance override (first-run UX spec §4): a native
 * three-position radio group -- "Follow system" / "Light" / "Dark" --
 * never a two-position switch (§4.3: a switch has no position that means
 * "follow the OS", so the first interaction would silently and
 * permanently destroy that behaviour with no way back). Native
 * `<input type="radio">` gives arrow-key roving and grouped announcement
 * for free (§4.8), so unlike ConsentSwitch.ts's `role="switch"` button,
 * this needs no custom key handling at all.
 *
 * Selecting a row is a plain DOM `change` event -- no re-render (X2):
 * the browser's own radio-group exclusivity keeps the three inputs in
 * sync, and the caller decides what "selected" means (an immediate,
 * pessimistic ledger write, mirroring the Settings consent switch's own
 * write-then-reflect pattern).
 *
 * `setValue()` exists only to REVERT a rejected write: it flips the
 * checked radio without firing `onSelect`, so calling it can never
 * recurse into another write -- the same shape as
 * ConsentSwitchHandle.setChecked(), just for three positions instead of two.
 */
import { el } from "../overlay/dom";
import { THEME_VALUES } from "../storage/ledger";
import type { Theme } from "../shared/types";
import * as copy from "./copy";

const THEME_LABELS: Readonly<Record<Theme, string>> = {
  system: copy.SETTINGS_THEME_SYSTEM,
  light: copy.SETTINGS_THEME_LIGHT,
  dark: copy.SETTINGS_THEME_DARK,
};

export interface ThemeChoiceOptions {
  /** Unique per mounted instance -- used as the radio group's `name`, so
   * two mounted instances on the same page (there is only ever one today)
   * could never cross-select each other's rows. */
  readonly idPrefix: string;
  readonly current: Theme;
  readonly onSelect: (next: Theme) => void;
}

export interface ThemeChoiceHandle {
  readonly fieldset: HTMLFieldSetElement;
  /** In-place revert only -- never fires onSelect (see module doc above). */
  setValue(next: Theme): void;
}

export function buildThemeChoiceGroup(opts: ThemeChoiceOptions): ThemeChoiceHandle {
  const inputs = new Map<Theme, HTMLInputElement>();

  const rows = THEME_VALUES.map((value) => {
    const inputId = `${opts.idPrefix}-${value}`;
    const input = el("input", {
      attrs: { type: "radio", name: opts.idPrefix, id: inputId, value },
      on: {
        change: () => {
          if (input.checked) opts.onSelect(value);
        },
      },
    });
    input.checked = value === opts.current;
    inputs.set(value, input);

    const label = el("label", { attrs: { for: inputId }, text: THEME_LABELS[value] });
    return el("div", { className: "radiorow", children: [input, label] });
  });

  const fieldset = el("fieldset", {
    className: "settings__group",
    attrs: { "data-theme-choice": "" },
    children: [el("legend", { className: "settings__h", text: copy.SETTINGS_GROUP_APPEARANCE }), ...rows],
  });

  return {
    fieldset,
    setValue(next: Theme): void {
      for (const [value, input] of inputs) input.checked = value === next;
    },
  };
}
