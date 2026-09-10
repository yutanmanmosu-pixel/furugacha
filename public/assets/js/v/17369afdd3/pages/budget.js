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
  pinHint: must("#budget-pin-hint"),
  pinBar: must("#budget-pin-bar"),
  pinCount: must("#budget-pin-count"),
  pinClear: /** @type {HTMLButtonElement} */ (must("#budget-pin-clear")),
  pinAll: must("#budget-pin-all"),
  notice: must("#budget-notice"),
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
/** 「残す」で固定中の返礼品(このページを開いている間だけの状態。保存も同期もしない) @type {Map<string, import("../lib/types.js").Product>} */
const pinned = new Map();
/** いま表示している結果の商品(固定の対象。表示順のまま) @type {import("../lib/types.js").Product[]} */
let shownItems = [];
/** 直近に【表示している結果】の条件。これが変わったら固定を解除し、結果を無効化する。 */
let lastConditionKey = "";
/** いま実行中(await待ち)の条件。取得中に条件を変えられても新旧が混ざらないようにする。 */
let activeConditionKey = "";
/** 抽選の世代トークン(古い応答が新しい結果・共有内容を上書きしないように) */
let runSeq = 0;

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
      onConditionInput();
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
  els.input.addEventListener("input", () => {
    syncCountField();      // 点数UIの出し入れを先に反映してから条件を比較する
    onConditionInput();
  });
  els.count.addEventListener("change", onConditionInput);
  syncCountField();

  els.form.addEventListener("submit", (e) => {
    e.preventDefault();
    void run();
  });
  els.again.addEventListener("click", () => void run());
  els.pinClear.addEventListener("click", () => {
    pinned.clear();
    // 解除だけでは引き直さない(意図しない再抽選を起こさないため)
    for (const btn of els.grid.querySelectorAll(".pin-btn")) {
      btn.setAttribute("aria-pressed", "false");
      btn.textContent = "この返礼品を残す";
      btn.classList.remove("is-pinned");
      btn.closest(".product-card")?.classList.remove("product-card--pinned");
    }
    setNotice(""); // 解除したので、全件固定の案内は下げる
    refreshPinUi();
  });
  refreshPinUi();
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
  pinned.clear();
  shownItems = [];
  refreshPinUi();
  xShare.hide(); // 古い組み合わせの共有リンク・投稿文を残さない
}

/**
 * 実効条件のキー。上のフォームからでも結果下の再ガチャからでも同じ値になり、
 * 監視処理(onConditionInput)と run() の判定でこれ1つだけを使う。
 * 表示用の文字列ではなく【正規化した値】で作るので、"50000" と "50,000" は同じ条件になる。
 * 予算が空欄・無効なら "-"(= 直前の結果とは別条件)として扱う。
 */
function conditionKey() {
  const b = parseBudget(els.input.value);
  const c = els.countField.hidden ? null : normalizeBudgetCount(els.count.value, b ?? 0);
  return `${b ?? "-"}:${category}:${c ?? "auto"}`;
}

/** 表示中の結果がすべて固定されている(= 引き直す対象がない) */
function isAllPinned() {
  return shownItems.length > 0 && shownItems.every((p) => pinned.has(p.id));
}

/** @param {string} text 空文字で非表示 */
function setNotice(text) {
  els.notice.textContent = text;
  els.notice.hidden = text === "";
}

/**
 * 条件が変わった時点で、古い結果・固定・共有をまとめて無効化する。
 * 次の実行を待たずにここで消すので、古い商品カードを新条件の結果と誤認しない。
 * 自動再抽選・履歴追加・共有結果の作成はしない。
 */
function invalidateForConditionChange() {
  const hadPins = pinned.size > 0;
  // 進行中の取得・抽選の応答を破棄する。あわせてロックを解いて操作不能を防ぐ。
  runSeq++;
  busy = false;
  activeConditionKey = "";
  els.run.disabled = false;
  els.again.disabled = false;
  els.grid.setAttribute("aria-busy", "false");
  els.error.hidden = true;          // 入力途中でエラーを強く出さない(検証は実行時)
  clearResult();                    // 結果・サマリー・固定・共有をまとめて消す
  lastConditionKey = "";            // 条件を戻しても古い結果を復活させない
  setNotice("条件を変更しました。もう一度ガチャを回してください。"
    + (hadPins ? "(残す設定も解除しました)" : ""));
}

/**
 * 入力・カテゴリ・点数のどれかが変わったときの共通処理。
 * 比較の基準は「実行中ならその実行の条件」「そうでなければ表示中の結果の条件」。
 * 取得待ちの最中に条件を変えた場合もここで検出し、古い応答を捨てる
 * (実行中の操作をロックせず、後から届いた古い結果を無効化する方式)。
 */
function onConditionInput() {
  const baseline = busy ? activeConditionKey : lastConditionKey;
  if (baseline === "") return;                 // まだ結果も実行も無い(初回入力中)
  if (conditionKey() === baseline) return;     // 表記だけの変更では解除しない
  invalidateForConditionChange();
}

/** 固定まわりの表示(件数・合計・ボタン文言・全件固定の案内)をまとめて更新する */
function refreshPinUi() {
  const list = [...pinned.values()];
  const total = list.reduce((sum, p) => sum + p.amount, 0);
  const hasResult = shownItems.length > 0;
  els.pinHint.hidden = !hasResult;
  els.pinBar.hidden = !hasResult || list.length === 0;
  els.pinCount.replaceChildren(
    nobr(`🔒 残す設定: ${list.length}品`),
    document.createTextNode(" "),
    nobr(`合計 ${yen(total)}`)
  );
  // 表示中の全商品が固定されている = 引き直す対象がない
  const allPinned = hasResult && shownItems.every((p) => pinned.has(p.id));
  els.pinAll.hidden = !allPinned;
  els.again.disabled = busy || allPinned;
  els.again.textContent = list.length > 0 ? "🎰 残した返礼品以外を引き直す" : "🎰 同じ条件でもう一回";
}

/** 金額などを折り返させない小さなラッパ(360pxで「0」と「円」が分かれないように) @param {string} text */
function nobr(text) {
  const el = document.createElement("span");
  el.className = "nobr";
  el.textContent = text;
  return el;
}

async function run() {
  if (busy) return; // Enter連打・多重実行防止

  const key = conditionKey();
  // 全件固定なら、上のボタン・下のボタン・Enter送信のどの経路でも実行しない。
  // ボタンのdisabledだけに頼らず、ここで止める(商品取得・履歴・共有も動かさない)。
  if (isAllPinned() && (lastConditionKey === "" || key === lastConditionKey)) {
    setNotice("引き直す返礼品がありません。変更したい返礼品の「残す」を解除してください。");
    refreshPinUi();
    return;
  }

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

  // 監視(onConditionInput)で取りこぼした場合の保険。判定は conditionKey() で共通化してある。
  let clearedNote = "";
  if (lastConditionKey !== "" && key !== lastConditionKey) {
    if (pinned.size > 0) clearedNote = "条件を変更したため、残す設定を解除しました。";
    invalidateForConditionChange();
  }
  setNotice(""); // これから実行するので、条件変更の案内は下げる

  // 実行開始時の条件と固定商品をスナップショットに固定する。
  // await をまたいで DOM を読み直さないので、新旧の条件が混ざらない。
  const snap = {
    budget, category,
    count: els.countField.hidden ? null : normalizeBudgetCount(els.count.value, budget),
    pinned: [...pinned.values()],
    key
  };
  const seq = ++runSeq;
  busy = true;
  activeConditionKey = snap.key;
  els.run.disabled = true;
  els.again.disabled = true;
  els.result.hidden = false;
  els.summary.textContent = "組み合わせを考えています…";
  els.grid.setAttribute("aria-busy", "true");
  els.grid.replaceChildren();
  xShare.hide(); // 抽選中に前回の結果の共有リンクを押せないようにする
  refreshPinUi();

  try {
    const [{ provider, mode }, status] = await Promise.all([getProvider(), fetchStatus()]);
    // 候補プールのキャッシュキー。上の条件キー(key)とは別物なので名前を分ける
    // (同名にすると lastConditionKey にプールキーが入り、毎回「条件が変わった」と誤判定する)。
    const poolCacheKey = `${mode}:${snap.category}:${snap.budget}`;
    if (poolCacheKey !== poolKey || poolCache.length === 0) {
      poolCache = await provider.searchByBudget({ budget: snap.budget, category: snap.category, limit: 120 });
      poolKey = poolCacheKey;
    }
    // 古い応答は捨てる(条件変更で無効化された場合も含む)。結果・共有・履歴を復活させない。
    if (seq !== runSeq) return;
    const count = snap.count;
    const set = generateBudgetSet(poolCache, snap.budget, { maxItems: BUDGET_MAX_ITEMS, count, pinned: snap.pinned });
    if (seq !== runSeq) return;
    els.countNote.hidden = true;
    els.countNote.textContent = "";

    if (set.items.length === 0) {
      els.summary.textContent = "この条件では組み合わせを作れませんでした。予算を増やすか、カテゴリを変えてお試しください。";
      els.note.textContent = "";
      els.prBadge.hidden = true;
      shownItems = [];
      refreshPinUi();
      xShare.hide(); // 共有できる結果が無い
      return;
    }

    const munis = new Set(set.items.map((p) => p.municipality || p.shopName || p.id)).size;
    const keptCount = set.pinnedCount ?? 0;
    // 金額は .nobr で包む(360pxで「0」と「円」が分かれないようにする)
    els.summary.replaceChildren(
      nobr(`予算 ${yen(snap.budget)}`), document.createTextNode(" → "),
      nobr(`${set.items.length}品`), document.createTextNode(" "),
      nobr(`(合計 ${yen(set.total)}`), document.createTextNode(" / "),
      nobr(`残り ${yen(set.remaining)})`), document.createTextNode(" "),
      nobr(`${munis}自治体`)
    );
    if (clearedNote) {
      els.countNote.hidden = false;
      els.countNote.textContent = clearedNote;
    } else if (keptCount > 0 && set.items.length === keptCount) {
      els.countNote.hidden = false;
      els.countNote.textContent = "残り予算では追加できる返礼品が見つかりませんでした。残した返礼品はそのままです。";
    } else if (keptCount > 0) {
      els.countNote.hidden = false;
      els.countNote.textContent = `残した${keptCount}品はそのままに、ほかの${set.items.length - keptCount}品を引き直しました。`;
    }
    if (count != null && set.items.length < count) {
      els.countNote.hidden = false;
      const why = keptCount > 0
        ? `残した${keptCount}品を含めて${count}点にできる組み合わせがなかったため、`
        : `${count}点では予算内に収まる組み合わせがなかったため、`;
      els.countNote.textContent = `${why}条件に合う返礼品の中から${set.items.length}点を提案しました。`;
    }

    const isMock = mode === "mock" || set.items.every((p) => p.isMock);
    els.prBadge.hidden = !(status.hasAffiliate && !isMock);
    els.note.textContent = isMock
      ? "※現在はサンプル表示です(実在の商品ではありません)。実際の返礼品はリンク先の楽天ふるさと納税でご確認ください。"
      : "※寄附額・在庫は変動します。最終的な合計金額は必ずリンク先(楽天ふるさと納税)でご確認ください。" +
        (status.hasAffiliate ? " リンクには広告(楽天アフィリエイト)を含みます。" : "");

    // 固定状態は「今回の結果に含まれる商品」だけに絞る(消えた商品の固定を残さない)
    const ids = new Set(set.items.map((p) => p.id));
    for (const id of [...pinned.keys()]) if (!ids.has(id)) pinned.delete(id);
    shownItems = set.items.slice();

    const frag = document.createDocumentFragment();
    for (const p of set.items) {
      frag.append(productCard(p, {
        pin: {
          pinned: pinned.has(p.id),
          onToggle: (on) => {
            if (on) pinned.set(p.id, p); else pinned.delete(p.id);
            // 商品セットは変わらないので、共有内容・履歴には触れない
            if (!on) setNotice(""); // 1件でも解除すれば引き直せる
            refreshPinUi();
          }
        }
      }));
    }
    els.grid.replaceChildren(frag);
    lastConditionKey = snap.key;
    refreshPinUi();

    updateXShare({ budget: snap.budget, category: snap.category, set, isMock });

    pushBudgetHistory({
      budget: snap.budget, total: set.total, count: set.items.length,
      categoryLabel: categoryById(snap.category)?.label ?? snap.category
    });
    els.result.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (e) {
    console.error(e);
    els.summary.textContent = "取得に失敗しました。時間をおいて再度お試しください。";
    xShare.hide();
  } finally {
    if (seq === runSeq) {
      busy = false;
      activeConditionKey = "";
      els.grid.setAttribute("aria-busy", "false");
      els.run.disabled = false;
      refreshPinUi(); // 全件固定なら「引き直す」は無効のまま
    }
  }
}
