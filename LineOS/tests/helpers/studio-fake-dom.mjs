const dataNameFor = (attribute) => attribute.slice(5).replace(
  /-([a-z])/g,
  (_, letter) => letter.toUpperCase()
);

const descendantsOf = (root) => {
  const result = [];
  const visit = (node) => {
    for (const child of node.children) {
      result.push(child);
      visit(child);
    }
  };
  visit(root);
  return result;
};

const matchesSimpleSelector = (element, selector) => {
  if (selector.startsWith(".")) {
    return element.className.split(/\s+/u).includes(selector.slice(1));
  }
  if (selector.startsWith("#")) return element.id === selector.slice(1);

  const attribute = selector.match(
    /^(?:([a-z][a-z0-9-]*))?\[([^\]=]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\]]+)))?\]$/iu
  );
  if (attribute) {
    const [, tag, name, doubleQuoted, singleQuoted, bare] = attribute;
    const expected = doubleQuoted ?? singleQuoted ?? bare;
    if (tag && element.tagName !== tag.toUpperCase()) return false;
    if (!element.hasAttribute(name)) return false;
    return expected === undefined || element.getAttribute(name) === expected;
  }
  return element.tagName === selector.toUpperCase();
};

const matchesSelector = (element, selector) => {
  const parts = selector.trim().split(/\s+/u);
  if (!matchesSimpleSelector(element, parts.at(-1))) return false;
  let ancestor = element.parentNode;
  for (let index = parts.length - 2; index >= 0; index -= 1) {
    while (ancestor && !matchesSimpleSelector(ancestor, parts[index])) {
      ancestor = ancestor.parentNode;
    }
    if (!ancestor) return false;
    ancestor = ancestor.parentNode;
  }
  return true;
};

class StudioTestElement {
  constructor(ownerDocument, tagName) {
    this.ownerDocument = ownerDocument;
    this.tagName = tagName.toUpperCase();
    this.parentNode = null;
    this.children = [];
    this.dataset = {};
    this.style = {};
    this.id = "";
    this.className = "";
    this.value = "";
    this.disabled = false;
    this.hidden = false;
    this.open = false;
    this.tabIndex = 0;
    this._textContent = "";
    this._attributes = new Map();
    this._listeners = new Map();
  }

  get textContent() {
    return this._textContent + this.children.map((child) => child.textContent).join("");
  }

  set textContent(value) {
    this._textContent = String(value);
    this.children = [];
  }

  setAttribute(name, value) {
    const stringValue = String(value);
    this._attributes.set(name, stringValue);
    if (name === "id") this.id = stringValue;
    if (name === "class") this.className = stringValue;
    if (name === "hidden") this.hidden = true;
    if (name.startsWith("data-")) this.dataset[dataNameFor(name)] = stringValue;
  }

  getAttribute(name) {
    if (name === "id") return this.id || null;
    if (name === "class") return this.className || null;
    return this._attributes.get(name) ?? null;
  }

  hasAttribute(name) {
    if (name === "id") return this.id.length > 0;
    if (name === "class") return this.className.length > 0;
    return this._attributes.has(name);
  }

  removeAttribute(name) {
    this._attributes.delete(name);
    if (name === "hidden") this.hidden = false;
    if (name.startsWith("data-")) delete this.dataset[dataNameFor(name)];
  }

  append(...nodes) {
    for (const node of nodes) {
      if (!(node instanceof StudioTestElement)) throw new Error("unsupported_test_node");
      node.remove();
      node.parentNode = this;
      this.children.push(node);
    }
  }

  appendChild(node) {
    this.append(node);
    return node;
  }

  replaceChildren(...nodes) {
    for (const child of this.children) child.parentNode = null;
    this.children = [];
    this._textContent = "";
    this.append(...nodes);
  }

  before(node) {
    if (!this.parentNode) return;
    node.remove();
    const index = this.parentNode.children.indexOf(this);
    node.parentNode = this.parentNode;
    this.parentNode.children.splice(index, 0, node);
  }

  remove() {
    if (!this.parentNode) return;
    const index = this.parentNode.children.indexOf(this);
    if (index >= 0) this.parentNode.children.splice(index, 1);
    this.parentNode = null;
  }

  addEventListener(type, listener) {
    const listeners = this._listeners.get(type) ?? [];
    listeners.push(listener);
    this._listeners.set(type, listeners);
  }

  async dispatchEvent(event) {
    const dispatched = typeof event === "string" ? { type: event } : event;
    dispatched.target ??= this;
    dispatched.currentTarget = this;
    dispatched.defaultPrevented ??= false;
    dispatched.preventDefault ??= () => {
      dispatched.defaultPrevented = true;
    };
    const results = [];
    for (const listener of this._listeners.get(dispatched.type) ?? []) {
      results.push(listener.call(this, dispatched));
    }
    await Promise.all(results);
    return !dispatched.defaultPrevented;
  }

  click() {
    if (this.disabled) return Promise.resolve();
    return this.dispatchEvent({ type: "click" });
  }

  focus() {
    this.ownerDocument.activeElement = this;
  }

  querySelectorAll(selector) {
    return descendantsOf(this).filter((element) => matchesSelector(element, selector));
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  showModal() {
    this.open = true;
  }

  close(returnValue = "") {
    if (!this.open) return;
    this.open = false;
    this.returnValue = returnValue;
    void this.dispatchEvent({ type: "close" });
  }
}

class StudioTestDocument {
  constructor() {
    this.documentElement = new StudioTestElement(this, "html");
    this.body = new StudioTestElement(this, "body");
    this.documentElement.append(this.body);
    this.activeElement = null;
    this.defaultView = {
      crypto: globalThis.crypto,
      navigator: { clipboard: { writeText: async () => {} } },
      Blob: globalThis.Blob,
      URL: {
        createObjectURL: () => "blob:studio-test",
        revokeObjectURL: () => {}
      },
      setTimeout: (callback) => {
        callback();
        return 1;
      },
      confirm: () => true,
      matchMedia: () => ({
        matches: false,
        addEventListener: () => {},
        addListener: () => {}
      })
    };
  }

  createElement(tagName) {
    return new StudioTestElement(this, tagName);
  }

  getElementById(id) {
    return descendantsOf(this.documentElement).find((element) => element.id === id) ?? null;
  }

  querySelectorAll(selector) {
    return descendantsOf(this.documentElement).filter(
      (element) => matchesSelector(element, selector)
    );
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }
}

const add = (doc, parent, tag, { id, className, text, attributes } = {}) => {
  const element = doc.createElement(tag);
  if (id) element.id = id;
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  for (const [name, value] of Object.entries(attributes ?? {})) {
    element.setAttribute(name, value);
  }
  parent.append(element);
  return element;
};

export function createStudioTestDocument() {
  const doc = new StudioTestDocument();
  const body = doc.body;
  add(doc, body, "a", { className: "skip-link" });
  for (const id of [
    "language-toggle", "tenant-context", "preset-list", "block-tabs", "field-panel",
    "phone-preview", "json-output", "validation-list", "payload-count", "copy-json",
    "download-json", "reset-draft", "run-journey", "toast-live", "editor-title",
    "preview-title", "json-title", "validation-title"
  ]) add(doc, body, "div", { id });

  const main = add(doc, body, "main", { id: "studio-main" });
  add(doc, main, "section", { className: "editor-pane" });
  add(doc, main, "section", { className: "preview-pane" });
  add(doc, main, "section", { className: "code-pane" });

  const liff = add(doc, body, "dialog", { id: "liff-dialog" });
  add(doc, liff, "h2", { id: "liff-title" });
  add(doc, liff, "p", { id: "liff-description" });
  add(doc, liff, "dd", { attributes: { "data-review-mode": "" } });
  add(doc, liff, "dd", { attributes: { "data-business-effect": "" } });
  add(doc, liff, "dd", { attributes: { "data-review-expiry": "" } });
  add(doc, liff, "dd", { attributes: { "data-artifact-manifest-sha256": "" } });
  add(doc, liff, "section", { attributes: { "data-liff-review": "" } });
  const outcome = add(doc, liff, "div", { attributes: { "data-review-outcome": "" } });
  add(doc, outcome, "strong");
  add(doc, outcome, "span");
  add(doc, liff, "button", {
    id: "cancel-journey",
    attributes: { value: "cancel" }
  });
  add(doc, liff, "button", {
    id: "confirm-journey",
    attributes: { "data-confirm-demo": "", value: "confirm" }
  });

  const receipt = add(doc, body, "dialog", { id: "receipt-dialog" });
  add(doc, receipt, "h2", { id: "receipt-title" });
  add(doc, receipt, "p", { id: "receipt-description" });
  add(doc, receipt, "p", { id: "receipt-digest-disclosure" });
  add(doc, receipt, "div", { attributes: { "data-receipt": "" } });
  add(doc, receipt, "button", {
    id: "close-receipt",
    attributes: { "data-close-receipt": "" }
  });
  return doc;
}

export function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}
