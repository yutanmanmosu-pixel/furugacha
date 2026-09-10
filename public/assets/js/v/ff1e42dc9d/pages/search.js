// @ts-check
// 返礼品キーワード検索ページ(/search/)。
// 既存資産の再利用: productCard(カードUI) / splitProducts・moreLabel(6件+追加表示) /
// /api/products の mode=keyword(楽天APIクライアント・キャッシュ・秘密管理は既存共通処理)。
// 方針: Mockフォールバックはしない(検索語と無関係な商品を表示しないため)。
import { productCard, msgEl } from "./product-card.js";
import { PRODUCT_FETCH_LIMIT, splitProducts, moreLabel } from "../lib/product-paging.js";
import { normalizeSearchQuery, SEARCH_QUERY_MAX } from "../lib/search-query.js";

/** @param {string} sel */
function must(sel) {
  const el = document.querySelector(sel);
  if (!el) throw new Error(`element not found: ${sel}`);
  return el;
}

const els = {
  form: /** @type {HTMLFormElement} */ (must("#search-form")),
  input: /** @type {HTMLInputElement} */ (must("#search-q")),
  run: /** @type {HTMLButtonElement} */ (must("#search-run")),
  results: /** @type {HTMLElement} */ (must("#search-results")),
  head: /** @type {HTMLElement} */ (must("#search-head")),
  term: /** @type {HTMLElement} */ (must("#search-term")),
  prBadge: /** @type {HTMLElement} */ (must("#search-pr-badge")),
  note: /** @type {HTMLElement} */ (must("#search-note")),
  grid: /** @type {HTMLElement} */ (must("#search-grid")),
  moreBtn: /** @type {HTMLButtonElement} */ (must("#search-more-btn"))
};

let busy = false;
/** @type {import("../lib/types.js").Product[]} */
let pendingRest = [];

/** @param {string} text */
function showMessage(text) {
  els.head.hidden = true;
  els.prBadge.hidden = true;
  els.note.textContent = "";
  els.moreBtn.hidden = true;
  pendingRest = [];
  els.grid.replaceChildren(msgEl(text));
}

async function run() {
  if (busy) return; // 連打による同一リクエストの多重発行を防止
  const r = normalizeSearchQuery(els.input.value);
  els.results.hidden = false;
  if (!r.ok) {
    showMessage(r.reason === "too_long"
      ? `キーワードは${SEARCH_QUERY_MAX}文字以内で入力してください。`
      : "キーワードを入力してください。");
    return;
  }
  const q = r.q;
  busy = true;
  els.run.disabled = true;
  els.moreBtn.hidden = true;
  pendingRest = [];
  els.head.hidden = false;
  els.term.textContent = q; // textContentで安全に描画(innerHTMLは使わない)
  els.prBadge.hidden = true;
  els.note.textContent = "";
  els.grid.setAttribute("aria-busy", "true");
  els.grid.replaceChildren(msgEl("返礼品を検索しています…"));
  try {
    const res = await fetch(
      `/api/products?mode=keyword&limit=${PRODUCT_FETCH_LIMIT}&q=${encodeURIComponent(q)}`,
      { headers: { accept: "application/json" } }
    );
    if (!res.ok) {
      showMessage("商品を取得できませんでした。時間をおいてもう一度お試しください。");
      return;
    }
    const data = await res.json();
    const products = Array.isArray(data?.products) ? data.products : [];
    if (products.length === 0) {
      els.head.hidden = false;
      els.grid.replaceChildren(msgEl(`「${q}」に一致する返礼品が見つかりませんでした。別のキーワードでもお試しください。`));
      return;
    }
    const { first, rest } = splitProducts(products);
    const frag = document.createDocumentFragment();
    for (const p of first) frag.append(productCard(p));
    els.grid.replaceChildren(frag);
    pendingRest = rest;
    if (rest.length > 0) {
      els.moreBtn.textContent = moreLabel(rest.length);
      els.moreBtn.hidden = false;
    }
    els.prBadge.hidden = false;
    els.note.textContent = "※以下には広告(楽天アフィリエイトのリンク)を含みます。寄附額・内容は必ずリンク先でご確認ください。";
    // 検索状態はフラグメントで保持(SEO: /search/ は1ページとして扱い、クエリURLを量産しない)
    try { history.replaceState(null, "", `#q=${encodeURIComponent(q)}`); } catch { /* noop */ }
  } catch {
    showMessage("商品を取得できませんでした。時間をおいてもう一度お試しください。");
  } finally {
    busy = false;
    els.run.disabled = false;
    els.grid.setAttribute("aria-busy", "false");
  }
}

els.form.addEventListener("submit", (e) => {
  e.preventDefault(); // Enterキーでも検索
  void run();
});

els.moreBtn.addEventListener("click", () => {
  if (pendingRest.length === 0) return;
  const frag = document.createDocumentFragment();
  for (const p of pendingRest) frag.append(productCard(p));
  els.grid.append(frag);
  pendingRest = [];
  els.moreBtn.hidden = true;
});

// #q=... 付きで開かれた場合は復元して自動検索
(() => {
  const m = location.hash.match(/^#q=(.+)$/);
  if (!m || !m[1]) return;
  try { els.input.value = decodeURIComponent(m[1]); } catch { return; }
  void run();
})();
