// @ts-nocheck
// テスト専用の極小DOMスタブ(依存追加なし)。
//
// 目的: 画面モジュール(pages/*.js)を node:test の中で【実際に動かして】
// 状態遷移を検証する。文字列一致では「入力エラー時に古い結果が残る」ような
// 表示状態の不具合を捕まえられないため。
//
// 実装しているのは対象モジュールが使うAPIだけ:
//   querySelector / createElement / append / replaceChildren / addEventListener
//   hidden(属性と同期)/ textContent / value / focus / classList / dataset
// レイアウトやCSSは扱わない(それはブラウザ検証の担当)。

export class StubElement {
  /** @param {string} tag */
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.attrs = Object.create(null);
    this.listeners = Object.create(null);
    this.parentElement = null;
    this.value = "";
    this.open = false;
    this.disabled = false;
    this.checked = false;
    this.focused = false;
    this.dataset = Object.create(null);
    this._text = "";
    const classes = new Set();
    this.classList = {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      toggle: (c, on) => { if (on === undefined) { classes.has(c) ? classes.delete(c) : classes.add(c); } else if (on) classes.add(c); else classes.delete(c); },
      contains: (c) => classes.has(c)
    };
  }

  get hidden() { return "hidden" in this.attrs; }
  set hidden(v) { if (v) this.attrs.hidden = ""; else delete this.attrs.hidden; }

  // 実DOMのaタグと同じく href はプロパティと属性が連動する
  // (removeAttribute("href") でリンクが無効になることをテストで再現するため)
  get href() { return this.attrs.href ?? ""; }
  set href(v) { this.attrs.href = String(v); }

  setAttribute(k, v) { if (k === "hidden") { this.hidden = true; return; } this.attrs[k] = String(v); }
  removeAttribute(k) { if (k === "hidden") { this.hidden = false; return; } delete this.attrs[k]; }
  getAttribute(k) { return k === "hidden" ? (this.hidden ? "" : null) : (this.attrs[k] ?? null); }
  hasAttribute(k) { return k === "hidden" ? this.hidden : k in this.attrs; }

  get textContent() {
    return this.children.length ? this.children.map((c) => c.textContent).join("") : this._text;
  }
  set textContent(v) { this._text = String(v); this.children = []; }
  set innerHTML(v) { this._text = String(v).replace(/<[^>]+>/g, ""); this.children = []; }
  get innerHTML() { return this._text; }

  append(...nodes) {
    for (const n of nodes) {
      if (typeof n === "string" || typeof n === "number") {
        const t = new StubElement("#text");
        t._text = String(n);
        t.parentElement = this;
        this.children.push(t);
        this._text = "";
        continue;
      }
      if (n && n.__fragment) { this.append(...n.children); continue; }
      n.parentElement = this;
      this.children.push(n);
      this._text = "";
    }
  }
  /** 子孫を単純セレクタで拾う簡易実装(".cls" / "tag" のみ) */
  querySelectorAll(sel) {
    const all = this.descendants();
    if (sel.startsWith(".")) {
      const cls = sel.slice(1);
      return all.filter((e) => e.classList.contains(cls) || String(e.className ?? "").split(/\s+/).includes(cls));
    }
    const tag = sel.toUpperCase();
    return all.filter((e) => e.tagName === tag);
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] ?? null; }
  /** ".cls" / "tag" / "tag[attr]" だけを解する簡易マッチャ */
  matches(sel) {
    const m = /^([a-zA-Z#]*)(?:\[([\w-]+)\])?$/.exec(sel);
    if (sel.startsWith(".")) {
      const cls = sel.slice(1);
      return this.classList.contains(cls) || String(this.className ?? "").split(/\s+/).includes(cls);
    }
    if (!m) return false;
    const [, tag, attr] = m;
    if (tag && this.tagName !== tag.toUpperCase()) return false;
    if (attr && !(attr.replace(/^data-/, "") in this.dataset) && !(attr in this.attrs)) return false;
    return true;
  }
  closest(sel) {
    for (let n = this; n; n = n.parentElement) if (n.matches?.(sel)) return n;
    return null;
  }
  appendChild(node) { this.append(node); return node; }
  replaceChildren(...nodes) { this.children = []; this._text = ""; this.append(...nodes); }
  remove() {
    if (!this.parentElement) return;
    this.parentElement.children = this.parentElement.children.filter((c) => c !== this);
    this.parentElement = null;
  }

  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] ?? []).filter((f) => f !== fn); }
  /** イベント発火(preventDefaultは記録のみ) */
  fire(type, event = {}) {
    const e = { type, target: this, preventDefault() { e.defaultPrevented = true; }, defaultPrevented: false, ...event };
    for (const fn of this.listeners[type] ?? []) fn(e);
    return e;
  }
  click() { this.fire("click"); }
  focus() { this.focused = true; }
  scrollIntoView() { this.scrolledIntoView = true; }

  /** テスト用: 子孫を平坦化 */
  descendants() {
    return this.children.flatMap((c) => [c, ...c.descendants()]);
  }
}

class StubFragment extends StubElement {
  constructor() { super("#fragment"); this.__fragment = true; }
}

/**
 * セレクタ→要素の対応表からDOMスタブを組み立て、グローバルへ載せる。
 * @param {Record<string, {tag?: string, [k: string]: any}>} spec
 */
export function installDom(spec) {
  /** @type {Record<string, StubElement>} */
  const byselector = Object.create(null);
  /** @type {Record<string, StubElement[]>} */
  const listBySelector = Object.create(null);
  const build = (opts) => {
    const el = new StubElement(opts.tag ?? "div");
    for (const [k, v] of Object.entries(opts)) if (k !== "tag") el[k] = v;
    return el;
  };
  for (const [sel, opts] of Object.entries(spec)) {
    // 配列を渡すと同一セレクタで複数要素(ラジオ群など)を作れる
    const list = Array.isArray(opts) ? opts.map(build) : [build(opts)];
    listBySelector[sel] = list;
    byselector[sel] = list[0];
  }
  const document = {
    querySelector: (sel) => byselector[sel] ?? null,
    querySelectorAll: (sel) => listBySelector[sel] ?? [],
    createElement: (tag) => new StubElement(tag),
    createElementNS: (_ns, tag) => new StubElement(tag),
    createTextNode: (text) => { const t = new StubElement("#text"); t._text = String(text); return t; },
    createDocumentFragment: () => new StubFragment(),
    addEventListener() {},
    documentElement: new StubElement("html")
  };
  const store = new Map();
  const storage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear()
  };
  globalThis.HTMLElement = StubElement;
  globalThis.document = document;
  globalThis.sessionStorage = storage;
  globalThis.localStorage = storage;
  globalThis.location = {
    search: "", pathname: "/", origin: "https://furugacha.jp", href: "https://furugacha.jp/"
  };
  return { el: byselector, all: listBySelector, document, storage };
}
