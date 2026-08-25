/**
 * @vitest-environment jsdom
 *
 * T04 — the DOM-construction primitive itself. Every other overlay/popup
 * test relies on `el()`/`text()` never being an HTML sink; this file
 * proves that directly rather than assuming it.
 */
import { describe, expect, it } from "vitest";
import { el, text, clear, styleTag } from "../../../src/overlay/dom";

describe("overlay/dom — the only DOM-construction primitives (T04)", () => {
  it("renders a markup-shaped string as literal text, never as elements", () => {
    const malicious = '<img src=x onerror="window.__pwned = true">';
    const node = el("p", { text: malicious });
    // The exact guard: textContent round-trips exactly, and no element was
    // parsed out of it. RED when el() is changed to assign innerHTML.
    expect(node.textContent).toBe(malicious);
    expect(node.querySelector("img")).toBeNull();
    expect(node.children.length).toBe(0);
    expect((globalThis as { __pwned?: boolean }).__pwned).toBeUndefined();
  });

  it("text() produces a literal Text node, never parsed", () => {
    const node = text("<script>window.__pwned2 = true</script>");
    expect(node.nodeType).toBe(Node.TEXT_NODE);
    expect(node.textContent).toContain("<script>");
    expect((globalThis as { __pwned2?: boolean }).__pwned2).toBeUndefined();
  });

  it("el() appends children via appendChild, not innerHTML — attrs/className/on all apply without markup parsing", () => {
    let clicked = false;
    const child = el("span", { text: "child" });
    const node = el("div", {
      className: "wrap",
      attrs: { "data-x": "1" },
      children: [child, null, undefined, false],
      on: { click: () => (clicked = true) },
    });
    expect(node.className).toBe("wrap");
    expect(node.getAttribute("data-x")).toBe("1");
    expect(node.children.length).toBe(1);
    expect(node.firstElementChild).toBe(child);
    node.dispatchEvent(new Event("click"));
    expect(clicked).toBe(true);
  });

  it("clear() removes every child without ever touching innerHTML", () => {
    const node = el("div", { children: [el("span"), el("span")] });
    expect(node.childNodes.length).toBe(2);
    clear(node);
    expect(node.childNodes.length).toBe(0);
  });

  it("styleTag() assigns CSS via textContent, not innerHTML, and holds exactly the given text", () => {
    const style = styleTag(".x { color: red; }");
    expect(style.tagName).toBe("STYLE");
    expect(style.textContent).toBe(".x { color: red; }");
    expect(style.childNodes.length).toBe(1);
    expect(style.childNodes[0]?.nodeType).toBe(Node.TEXT_NODE);
  });
});
