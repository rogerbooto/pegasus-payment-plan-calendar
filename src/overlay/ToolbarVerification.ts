/**
 * The toolbar popup is the ONLY genuineness affordance: a page can draw a
 * pixel-perfect copy of the in-page overlay, but it cannot draw inside the
 * browser toolbar. No verification claim (checkmark, lock, "verified")
 * appears in the in-page panel — genuineness language is allowed in this
 * module and nowhere else (T14).
 *
 * T14 structural guard: this module contains no `input` element of any
 * kind — nothing here ever asks for a password, an account, or any other
 * credential. It only ever renders static, developer-authored text (via
 * .textContent, never innerHTML) describing how the toolbar surface itself
 * proves it opened from the browser's own chrome, not from a page.
 */
import { el } from "./dom";

const VERIFY_TITLE = "How to know it's genuine";
const VERIFY_NAME = "Payment Plan Calendar";
const VERIFY_BY = "This screen, and this screen only.";
const VERIFY_EXPLAIN =
  "This opened because you clicked this extension's own icon in your browser's toolbar. A page cannot make that happen, and it cannot put anything inside what opens when it does.";
const VERIFY_POINTS: readonly string[] = [
  "This screen only opens from your browser's toolbar — never by itself, and never from a page.",
  "Nothing in this extension ever asks for a password, a card number, or an account.",
  "The panel on a checkout page shows dates and amounts — and the only thing you ever type into it is a plan's own numbers and dates.",
];
const VERIFY_CAVEAT =
  "None of this proves a panel on a checkout page is ours — a page can still copy how one looks. What it can't copy is your browser's own toolbar, or the fact that this extension never asks you to type anything beyond a plan's own numbers and dates.";
const BACK_LABEL = "Back to settings";

export interface ToolbarVerificationProps {
  readonly onBack: () => void;
}

export function renderToolbarVerification(container: HTMLElement, props: ToolbarVerificationProps): void {
  const head = el("div", {
    className: "panel__head",
    children: [
      el("h2", { className: "panel__title", text: VERIFY_TITLE }),
      el("button", {
        className: "iconbtn",
        attrs: { type: "button", "aria-label": BACK_LABEL },
        text: "‹",
        on: { click: () => props.onBack() },
      }),
    ],
  });

  const mark = el("div", {
    className: "verify__mark",
    children: [
      el("div", { className: "verify__name", text: VERIFY_NAME }),
      el("div", { className: "verify__by", text: VERIFY_BY }),
    ],
  });

  const list = el("ul", { className: "verify__list" });
  for (const point of VERIFY_POINTS) {
    list.appendChild(el("li", { text: point }));
  }

  const body = el("div", {
    className: "panel__body",
    children: [
      mark,
      el("p", { className: "plain", attrs: { style: "font-size:13.5px;margin-top:10px" }, text: VERIFY_EXPLAIN }),
      list,
      el("p", { className: "verify__caveat", text: VERIFY_CAVEAT }),
    ],
  });

  container.appendChild(head);
  container.appendChild(body);
}
