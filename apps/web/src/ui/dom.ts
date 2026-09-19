/** Minimal DOM builder. No framework, no virtual DOM — just element creation with typed sugar. */

export type Child = Node | string | number | null | undefined | boolean | Child[];

export interface ElAttrs {
  class?: string;
  dataset?: Record<string, string>;
  [key: string]: unknown;
}

function appendChildren(node: Node, children: Child[]): void {
  for (const child of children) {
    if (child == null || typeof child === "boolean") continue;
    if (Array.isArray(child)) {
      appendChildren(node, child);
    } else if (typeof child === "string" || typeof child === "number") {
      node.appendChild(document.createTextNode(String(child)));
    } else {
      node.appendChild(child);
    }
  }
}

function applyAttrs(node: HTMLElement, attrs: ElAttrs): void {
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined) continue;
    if (key === "class") {
      node.className = String(value);
    } else if (key === "dataset") {
      Object.assign(node.dataset, value as Record<string, string>);
    } else if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
    } else if (typeof value === "function") {
      // Not an on<Event> handler — nothing sensible to do with it as an attribute.
      continue;
    } else if (typeof value === "boolean") {
      if (value) node.setAttribute(key, "");
    } else {
      node.setAttribute(key, String(value));
    }
  }
}

/** Creates an element. `attrs` covers plain string attributes, `class`, `dataset` and `on<Event>` handlers. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: ElAttrs | null,
  ...children: Child[]
): HTMLElementTagNameMap[K];
export function el(tag: string, attrs?: ElAttrs | null, ...children: Child[]): HTMLElement;
export function el(tag: string, attrs?: ElAttrs | null, ...children: Child[]): HTMLElement {
  const node = document.createElement(tag);
  if (attrs) applyAttrs(node, attrs);
  appendChildren(node, children);
  return node;
}

/** Removes every child of `node`. */
export function clear(node: Node): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

/** An anchor the router will intercept: same-tab client-side navigation via `data-link`. */
export function link(href: string, text: string, attrs?: ElAttrs | null): HTMLAnchorElement {
  return el(
    "a",
    { ...(attrs ?? {}), href, dataset: { ...(attrs?.dataset ?? {}), link: "" } },
    text,
  );
}
