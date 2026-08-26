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
