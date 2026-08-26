/**
 * The only DOM-construction primitives used anywhere in src/overlay and
 * src/popup. Every node is built with document.createElement and every
 * string that reaches the DOM is assigned via .textContent — never
 * innerHTML/outerHTML/insertAdjacentHTML, which are additionally banned by
 * lint (eslint.config.mjs). This file exists so "no HTML sink, ever" (T04)
 * has exactly one place to hold the line rather than being a convention
 * every call site has to remember.
 *
 * Nothing here parses a string as markup. `el()`'s `text` option always
 * goes through `Node.textContent`, which the DOM spec defines as replacing
 * children with a single Text node — it is never run through an HTML
 * parser, so markup-shaped merchant text passed here renders as literal
 * characters, not elements.
 */

export interface ElementSpec {
  readonly attrs?: Readonly<Record<string, string>>;
  readonly text?: string;
  readonly children?: readonly (Node | null | undefined | false)[];
  readonly on?: Readonly<Record<string, EventListener>>;
  readonly className?: string;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  spec: ElementSpec = {},): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (spec.className) node.className = spec.className;
  if (spec.attrs) {
    for (const [k, v] of Object.entries(spec.attrs)) node.setAttribute(k, v);
  }
  if (spec.text !== undefined) node.textContent = spec.text;
  if (spec.children) {
    for (const child of spec.children) {
      if (child) node.appendChild(child);
    }
  }
  if (spec.on) {
    for (const [evt, handler] of Object.entries(spec.on)) node.addEventListener(evt, handler);
  }
  return node;
}

/** A single text node. Never parsed; always literal characters. */
export function text(value: string): Text {
  return document.createTextNode(value);
}

/** Removes every child of a node without ever touching innerHTML. */
export function clear(node: Element | ShadowRoot): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

/**
 * Builds a <style> element from a static, developer-authored CSS string
 * (never merchant/user data) via textContent. Assigning CSS text to a
 * style element's text node is not markup parsing and cannot execute
 * script; it is the standard, safe way to style a shadow root.
 */
export function styleTag(css: string): HTMLStyleElement {
  const node = document.createElement("style");
  node.textContent = css;
  return node;
}

/**
 * Moves focus to a screen's own heading on navigation, giving it
 * `tabindex="-1"` so it is programmatically focusable without joining the
 * tab order. Pointer users never see a focus ring here -- the existing
 * global `:focus-visible` rule already suppresses that for mouse/touch
 * activation, so this deliberately does not set `outline: none`.
 *
 * Formerly a private function in src/popup/PopupApp.ts; moved here (edit-
 * plan-spec §4.6) once the edit form gained a second consumer
 * (src/overlay/ConfirmationSheet.ts's `initialFocus: "heading"` option).
 * Behaviour is unchanged byte-for-byte from the original.
 */
export function moveFocusToHeading(root: HTMLElement, selector: string): void {
  const heading = root.querySelector(selector) as HTMLElement | null;
  if (!heading) return;
  heading.setAttribute("tabindex", "-1");
  heading.focus();
}

/**
 * Builds the "already-formatted labels as .d spans, comma-separated, final
 * period" pattern shared by three call sites (renderForm's own inline echo
 * in ConfirmationSheet.ts, OverlayHost's dateSpans, and the popup hero's
 * edit-saved notice) -- extracted here (edit-plan-spec §5.4) so the shape
 * exists once. Takes already-formatted strings, never raw dates or cents,
 * so this file stays domain-free.
 */
export function tokenList(labels: readonly string[]): Node[] {
  const nodes: Node[] = [];
  labels.forEach((label, i) => {
    nodes.push(el("span", { className: "d", text: label }));
    nodes.push(text(i < labels.length - 1 ? ", " : "."));
  });
  return nodes;
}
