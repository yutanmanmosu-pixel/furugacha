// @ts-check
// サブ機能「予算おまかせガチャ」画面。
// シミュレーターからの金額引き継ぎ(URL ?budget= & sessionStorage)に対応(指示書57-60)。

import { parseBudget, parseSource, BUDGET_MIN, BUDGET_MAX } from "../lib/validate.js";
import { generateBudgetSet } from "../lib/budget.js";
import { CATEGORIES, categoryById } from "../lib/categories.js";
import { getProvider, fetchStatus } from "../providers/index.js";
import { yen } from "../lib/format.js";
import { pushBudgetHistory } from "../lib/storage.js";
import { productCard } from "./product-card.js";

const HANDOFF_KEY = "furugacha:budget:handoff:v1";

/** @param {string} sel @returns {HTMLElement} */
function must(sel) {
  const el = document.querySelector(sel);
  if (!(el instanceof HTMLElement)) throw new Error(`要素が見つかりません: ${sel}`);
  return el;
}

const els = {
  form: must("#budget-form"),
  input: /** @type {HTMLInputElement} */ (must("#budget-input")),
  handoffNote: must("#budget-handoff-note"),
  catWrap: must("#budget-categories"),
  run: /** @type {HTMLButtonElement} */ (must("#budget-run")),
  error: must("#budget-error"),
  result: must("#budget-result"),
  summary: must("#budget-summary"),
  prBadge: must("#budget-pr-badge"),
  note: must("#budget-note"),
  grid: must("#budget-grid"),
  again: /** @type {HTMLButtonElement} */ (must("#budget-again"))
};

/** @type {"random"|"food"|"life"|"travel"} */
let category = "random";
/** @type {import("../lib/types.js").Product[]} */
let poolCache = [];
let poolKey = "";
let busy = false;

init();

function init() {
  // 金額の引き継ぎ: URLパラメータ(検証必須) > sessionStorage > 空欄
  const params = new URLSearchParams(location.search);
  const fromUrl = parseBudget(params.get("budget"));
  const source = parseSource(params.get("source"));
  let handoff = fromUrl;
  if (handoff == null) {
    try { handoff = parseBudget(sessionStorage.getItem(HANDOFF_KEY)); } catch { handoff = null; }
  }
  if (handoff != null) {
    els.input.value = String(handoff);
    if (source === "calculator" || fromUrl != null) {
      els.handoffNote.hidden = false;
      els.handoffNote.textContent = source === "calculator"
        ? `シミュレーターの結果(${yen(handoff)})を引き継ぎました。金額は自由に変更できます。`
        : `指定された予算 ${yen(handoff)} をセットしました。`;
    }
  }

  // カテゴリカード生成
  for (const c of CATEGORIES) {
    const label = document.createElement("label");
    label.className = `cat-card cat-card--${c.id}`;
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "budget-category";
    input.value = c.id;
    input.checked = c.id === "random";
    input.addEventListener("change", () => {
      category = /** @type {typeof category} */ (c.id);
      for (const l of els.catWrap.querySelectorAll(".cat-card")) l.classList.toggle("is-active", l === label);
    });
    const strong = document.createElement("strong");
    strong.textContent = c.label;
    const small = document.createElement("small");
    small.textContent = c.id === "random" ? "ジャンルもガチャにおまかせ"
      : c.id === "food" ? "お肉・海鮮・お米・果物など"
      : c.id === "life" ? "日用品・雑貨・キッチン用品など"
      : "宿泊・食事券・体験など";
    label.append(input, strong, small);
    if (c.id === "random") label.classList.add("is-active");
    els.catWrap.append(label);
  }

  els.form.addEventListener("submit", (e) => {
    e.preventDefault();
    void run();
  });
  els.again.addEventListener("click", () => void run());
}

async function run() {
  if (busy) return; // Enter連打・多重実行防止
  const budget = parseBudget(els.input.value);
  if (budget == null) {
    els.error.hidden = false;
    els.error.textContent = `予算は${BUDGET_MIN.toLocaleString("ja-JP")}円〜${BUDGET_MAX.toLocaleString("ja-JP")}円の範囲で数字のみ入力してください。`;
    els.input.focus();
    return;
  }
  els.error.hidden = true;
  try { sessionStorage.setItem(HANDOFF_KEY, String(budget)); } catch { /* 無効環境は無視 */ }

  busy = true;
  els.run.disabled = true;
  els.again.disabled = true;
  els.result.hidden = false;
  els.summary.textContent = "組み合わせを考えています…";
  els.grid.setAttribute("aria-busy", "true");
  els.grid.replaceChildren();

  try {
    const [{ provider, mode }, status] = await Promise.all([getProvider(), fetchStatus()]);
    const key = `${mode}:${category}:${budget}`;
    if (key !== poolKey || poolCache.length === 0) {
      poolCache = await provider.searchByBudget({ budget, category, limit: 120 });
      poolKey = key;
    }
    const set = generateBudgetSet(poolCache, budget, { maxItems: 6, attempts: 14 });

    if (set.items.length === 0) {
      els.summary.textContent = "この条件では組み合わせを作れませんでした。予算を増やすか、カテゴリを変えてお試しください。";
      els.note.textContent = "";
      els.prBadge.hidden = true;
      return;
    }

    const munis = new Set(set.items.map((p) => p.municipality || p.shopName || p.id)).size;
    els.summary.innerHTML =
      `予算 <strong>${yen(budget)}</strong> → <strong>${set.items.length}品</strong>` +
      `(合計 <strong>${yen(set.total)}</strong> / 残り ${yen(set.remaining)})・${munis}自治体`;

    const isMock = mode === "mock" || set.items.every((p) => p.isMock);
    els.prBadge.hidden = !(status.hasAffiliate && !isMock);
    els.note.textContent = isMock
      ? "※現在はサンプル表示です(実在の商品ではありません)。実際の返礼品はリンク先の楽天ふるさと納税でご確認ください。"
      : "※寄附額・在庫は変動します。最終的な合計金額は必ずリンク先(楽天ふるさと納税)でご確認ください。" +
        (status.hasAffiliate ? " リンクには広告(楽天アフィリエイト)を含みます。" : "");

    const frag = document.createDocumentFragment();
    for (const p of set.items) frag.append(productCard(p));
    els.grid.replaceChildren(frag);

    pushBudgetHistory({
      budget, total: set.total, count: set.items.length,
      categoryLabel: categoryById(category)?.label ?? category
    });
    els.result.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (e) {
    console.error(e);
    els.summary.textContent = "取得に失敗しました。時間をおいて再度お試しください。";
  } finally {
    busy = false;
    els.grid.setAttribute("aria-busy", "false");
    els.run.disabled = false;
    els.again.disabled = false;
  }
}
