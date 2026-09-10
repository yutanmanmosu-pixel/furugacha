// @ts-check
// サブ機能「予算おまかせガチャ」画面。
// シミュレーターからの金額引き継ぎ(URL ?budget= & sessionStorage)に対応(指示書57-60)。

import { parseBudget, parseSource, BUDGET_MIN, BUDGET_MAX } from "../lib/validate.js";
import { generateBudgetSet, normalizeBudgetCount, BUDGET_MAX_ITEMS, BUDGET_COUNT_MIN_BUDGET } from "../lib/budget.js";
import { CATEGORIES, categoryById } from "../lib/categories.js";
import { getProvider, fetchStatus } from "../providers/index.js";
import { yen } from "../lib/format.js";
import { pushBudgetHistory } from "../lib/storage.js";
import { productCard } from "./product-card.js";
import { budgetShareQuery, shareStamp, isValidItemCode, SHARE_MAX_ITEMS } from "../lib/share-state.js";
import { budgetTweet, xIntentUrl } from "../lib/share-text.js";
import { bindXShare } from "./x-share.js";

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
  countField: /** @type {HTMLElement} */ (must("#budget-count-field")),
  count: /** @type {HTMLSelectElement} */ (must("#budget-count")),
  countNote: /** @type {HTMLElement} */ (must("#budget-count-note")),
  prBadge: must("#budget-pr-badge"),
  note: must("#budget-note"),
  grid: must("#budget-grid"),
  again: /** @type {HTMLButtonElement} */ (must("#budget-again")),
  shareRoot: must("#budget-share"),
  shareLink: /** @type {HTMLAnchorElement} */ (must("#budget-share-x")),
  shareText: /** @type {HTMLTextAreaElement} */ (must("#budget-share-text")),
  shareCopy: /** @type {HTMLButtonElement} */ (must("#budget-share-copy")),
  shareCopied: must("#budget-share-copied"),
  shareNote: must("#budget-share-note"),
  shareDetails: /** @type {HTMLDetailsElement} */ (must("#budget-share-details"))
};

/** Xで共有ウィジェット(投稿はユーザー本人がXの画面で確定する) */
const xShare = bindXShare({
  root: els.shareRoot, link: els.shareLink, textarea: els.shareText,
  copyBtn: els.shareCopy, copied: els.shareCopied, note: els.shareNote, details: els.shareDetails
});

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

  // 点数選択は予算10,000円以上でのみ表示(それ未満はおまかせ・最大5点)
  const syncCountField = () => {
    const b = parseBudget(els.input.value);
    els.countField.hidden = !(b != null && b >= BUDGET_COUNT_MIN_BUDGET);
  };
  els.input.addEventListener("input", syncCountField);
  syncCountField();

  els.form.addEventListener("submit", (e) => {
    e.preventDefault();
    void run();
  });
  els.again.addEventListener("click", () => void run());
}

/**
 * 表示中の組み合わせから、共有結果ページURLとXの投稿文を組み立てる。
 * ・サンプル(モック)商品は実商品として公開共有しないので、理由を出して無効にする。
 * ・共有はおまけの導線なので、失敗しても予算ガチャ本体は止めない。
 * @param {{budget:number, category:string, set:{items:import("../lib/types.js").Product[], total:number, remaining:number}, isMock:boolean}} r
 */
function updateXShare(r) {
  try {
    if (r.isMock || r.set.items.some((p) => p.isMock)) {
      xShare.disable("いまはサンプル表示のため、Xでの共有は使えません(実在の返礼品ではないため)。");
      return;
    }
    const items = r.set.items.slice(0, SHARE_MAX_ITEMS);
    if (!items.every((p) => isValidItemCode(p.id))) {
      xShare.disable("この組み合わせは共有用の情報が揃わないため、Xでの共有は使えません。");
      return;
    }
    const shareUrl = `${location.origin}/share/budget/${budgetShareQuery({
      budget: r.budget, category: r.category,
      items: items.map((p) => ({ code: p.id, amount: p.amount })),
      stamp: shareStamp()
    })}`;
    const text = budgetTweet({
      budget: r.budget, total: r.set.total, remaining: r.set.remaining,
      items: items.map((p) => ({ title: p.title })), url: shareUrl
    });
    xShare.show({ text, intentUrl: xIntentUrl(text), shareUrl });
  } catch (e) {
    console.error(e);
    xShare.disable("共有リンクを作れませんでした。もう一度ガチャを回してお試しください。");
  }
}

/** 表示済みの結果を消す(入力エラー時に古い組み合わせを今回の結果と誤解させないため) */
function clearResult() {
  els.result.hidden = true;
  els.summary.textContent = "";
  els.note.textContent = "";
  els.countNote.hidden = true;
  els.countNote.textContent = "";
  els.prBadge.hidden = true;
  els.grid.replaceChildren();
  xShare.hide(); // 古い組み合わせの共有リンク・投稿文を残さない
}

async function run() {
  if (busy) return; // Enter連打・多重実行防止
  const budget = parseBudget(els.input.value);
  if (budget == null) {
    // 入力エラー時は前回の組み合わせを残さない(エラーと結果の同時表示を避ける / 2026-09-10)
    els.error.hidden = false;
    els.error.textContent = `予算は${BUDGET_MIN.toLocaleString("ja-JP")}円〜${BUDGET_MAX.toLocaleString("ja-JP")}円の範囲で数字のみ入力してください。`;
    clearResult();
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
  xShare.hide(); // 抽選中に前回の結果の共有リンクを押せないようにする

  try {
    const [{ provider, mode }, status] = await Promise.all([getProvider(), fetchStatus()]);
    const key = `${mode}:${category}:${budget}`;
    if (key !== poolKey || poolCache.length === 0) {
      poolCache = await provider.searchByBudget({ budget, category, limit: 120 });
      poolKey = key;
    }
    const count = els.countField.hidden ? null : normalizeBudgetCount(els.count.value, budget);
    const set = generateBudgetSet(poolCache, budget, { maxItems: BUDGET_MAX_ITEMS, count });
    els.countNote.hidden = true;
    els.countNote.textContent = "";

    if (set.items.length === 0) {
      els.summary.textContent = "この条件では組み合わせを作れませんでした。予算を増やすか、カテゴリを変えてお試しください。";
      els.note.textContent = "";
      els.prBadge.hidden = true;
      xShare.hide(); // 共有できる結果が無い
      return;
    }

    const munis = new Set(set.items.map((p) => p.municipality || p.shopName || p.id)).size;
    els.summary.innerHTML =
      `予算 <strong>${yen(budget)}</strong> → <strong>${set.items.length}品</strong>` +
      `(合計 <strong>${yen(set.total)}</strong> / 残り ${yen(set.remaining)})・${munis}自治体`;
    if (count != null && set.items.length < count) {
      els.countNote.hidden = false;
      els.countNote.textContent = `${count}点では予算内に収まる組み合わせがなかったため、条件に合う返礼品の中から${set.items.length}点を提案しました。`;
    }

    const isMock = mode === "mock" || set.items.every((p) => p.isMock);
    els.prBadge.hidden = !(status.hasAffiliate && !isMock);
    els.note.textContent = isMock
      ? "※現在はサンプル表示です(実在の商品ではありません)。実際の返礼品はリンク先の楽天ふるさと納税でご確認ください。"
      : "※寄附額・在庫は変動します。最終的な合計金額は必ずリンク先(楽天ふるさと納税)でご確認ください。" +
        (status.hasAffiliate ? " リンクには広告(楽天アフィリエイト)を含みます。" : "");

    const frag = document.createDocumentFragment();
    for (const p of set.items) frag.append(productCard(p));
    els.grid.replaceChildren(frag);

    updateXShare({ budget, category, set, isMock });

    pushBudgetHistory({
      budget, total: set.total, count: set.items.length,
      categoryLabel: categoryById(category)?.label ?? category
    });
    els.result.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (e) {
    console.error(e);
    els.summary.textContent = "取得に失敗しました。時間をおいて再度お試しください。";
    xShare.hide();
  } finally {
    busy = false;
    els.grid.setAttribute("aria-busy", "false");
    els.run.disabled = false;
    els.again.disabled = false;
  }
}
