// @ts-check
// 共有された予算おまかせガチャ結果ページ。
//
// URLに入っているのは「予算・カテゴリ・楽天のitemCode・共有時点の寄附額・共有日」だけ。
// 商品名・画像・リンクは /api/share-items がサーバー側で楽天APIに問い合わせて取得する
// (クライアントが渡したURLをそのまま楽天リンクとして出さないため)。
// 表示する金額は【共有時点】の寄附額。合計・残額も共有時点の値なので、投稿文と必ず一致する。

import { loadMunicipalities } from "../lib/data.js";
import { categoryById } from "../lib/categories.js";
import { yen } from "../lib/format.js";
import { parseBudgetShare, stampToDate, SHARE_TTL_DAYS } from "../lib/share-state.js";
import { fetchStatus } from "../providers/index.js";
import { productCard, loadingEl } from "./product-card.js";

/** @param {string} sel @returns {HTMLElement} */
function must(sel) {
  const el = document.querySelector(sel);
  if (!(el instanceof HTMLElement)) throw new Error(`要素が見つかりません: ${sel}`);
  return el;
}

const els = {
  loading: must("#share-loading"),
  error: must("#share-error"),
  errorTitle: must("#share-error-title"),
  errorMsg: must("#share-error-msg"),
  main: must("#share-main"),
  budget: must("#share-budget"),
  summary: must("#share-summary"),
  meta: must("#share-meta"),
  date: must("#share-date"),
  itemsNote: must("#share-items-note"),
  itemsMissing: must("#share-items-missing"),
  itemsGrid: must("#share-items-grid"),
  itemsError: must("#share-items-error"),
  itemsErrorMsg: must("#share-items-error-msg"),
  retry: /** @type {HTMLButtonElement} */ (must("#share-items-retry")),
  prBadge: must("#share-pr-badge"),
  again: /** @type {HTMLAnchorElement} */ (must("#share-again"))
};

/** @param {string} title @param {string} msg */
function showError(title, msg) {
  els.loading.hidden = true;
  els.main.hidden = true;
  els.errorTitle.textContent = title;
  els.errorMsg.textContent = msg;
  els.error.hidden = false;
}

/** @type {{ok:true, budget:number, category:string, items:{code:string,amount:number}[], total:number, remaining:number, stamp:number} | null} */
let shared = null;
/** 自治体コード → 自治体名(商品の自治体表示に使う) @type {Record<string,{municipality:string, prefecture:string}>} */
let muniByCode = {};
let loadingItems = false;

void main();

async function main() {
  const parsed = parseBudgetShare(new URLSearchParams(location.search));
  if (!parsed.ok) {
    if (parsed.reason === "expired") {
      showError("共有リンクの有効期限が切れました",
        `共有リンクは${SHARE_TTL_DAYS}日で期限切れになります。返礼品の寄附額・在庫は変わるためです。よければご自身で予算ガチャを回してみてください。`);
    } else {
      showError("結果が見つかりませんでした",
        "共有リンクが正しくないか、古い形式のようです。ふるガチャでもう一度ガチャを回してみてください。");
    }
    return;
  }
  shared = parsed;

  const catLabel = categoryById(parsed.category)?.label ?? parsed.category;
  els.budget.textContent = yen(parsed.budget);
  els.summary.innerHTML = "";
  els.summary.append(
    text(`予算 `), strong(yen(parsed.budget)), text(" → "), strong(`${parsed.items.length}品`),
    text(`(合計 `), strong(yen(parsed.total)), text(` / 残り ${yen(parsed.remaining)})`)
  );
  els.meta.textContent = `カテゴリ: ${catLabel}／返礼品 ${parsed.items.length}品`;
  els.date.textContent = `共有日: ${stampToDate(parsed.stamp)}(共有リンクの有効期限は${SHARE_TTL_DAYS}日です)`;
  els.again.href = `/budget-gacha/?budget=${parsed.budget}`;
  document.title = `予算${yen(parsed.budget)}のおまかせガチャ結果｜ふるガチャ`;

  els.loading.hidden = true;
  els.main.hidden = false;

  els.retry.addEventListener("click", () => { void loadItems(); });
  try {
    const { municipalities } = await loadMunicipalities();
    muniByCode = Object.fromEntries(municipalities.map((m) => [m.municipalityCode, m]));
  } catch { muniByCode = {}; }
  await loadItems();
}

/** 共有された商品を、サーバー経由で楽天から引き直して描画する */
async function loadItems() {
  if (!shared || loadingItems) return;
  loadingItems = true;
  els.itemsError.hidden = true;
  els.itemsMissing.hidden = true;
  els.itemsGrid.replaceChildren(loadingEl());
  try {
    const codes = shared.items.map((i) => i.code).join(",");
    const [res, status] = await Promise.all([
      fetch(`/api/share-items?codes=${encodeURIComponent(codes)}`, { headers: { accept: "application/json" } }),
      fetchStatus()
    ]);
    if (!res.ok) {
      const kind = res.status === 502 ? "provider" : "error";
      els.itemsGrid.replaceChildren();
      els.itemsErrorMsg.textContent = kind === "provider"
        ? "いまは返礼品情報を取得できません(サンプル表示中の可能性があります)。しばらくしてからお試しください。"
        : "返礼品情報の取得に失敗しました。通信状況をご確認ください。";
      els.itemsError.hidden = false;
      return;
    }
    const json = await res.json();
    /** @type {any[]} */
    const found = Array.isArray(json?.products) ? json.products : [];
    const byCode = new Map(found.map((p) => [p.id, p]));

    const frag = document.createDocumentFragment();
    let missing = 0;
    for (const it of shared.items) {
      const p = byCode.get(it.code);
      if (!p) { missing++; continue; }
      const muni = p.municipalityCode ? muniByCode[p.municipalityCode] : undefined;
      // 表示する寄附額は【共有時点】の値。合計・残額と一致させ、投稿文とも食い違わせない。
      frag.append(productCard({
        ...p,
        amount: it.amount,
        municipality: muni?.municipality ?? "",
        prefecture: muni?.prefecture ?? "",
        isMock: false
      }));
    }
    els.itemsGrid.replaceChildren(frag);
    if (missing > 0) {
      els.itemsMissing.hidden = false;
      els.itemsMissing.textContent = `※${missing}品は現在楽天で取得できませんでした(掲載終了などの可能性があります)。`;
    }
    els.prBadge.hidden = !status.hasAffiliate;
    els.itemsNote.textContent = (status.hasAffiliate
      ? "※以下には広告(楽天アフィリエイトのリンク)を含みます。"
      : "※楽天ふるさと納税の商品情報をもとに表示しています。")
      + `寄附額は共有時点(${stampToDate(shared.stamp)})のものです。現在の寄附額・在庫は必ずリンク先の楽天ふるさと納税でご確認ください。`;
  } catch (e) {
    console.error(e);
    els.itemsGrid.replaceChildren();
    els.itemsErrorMsg.textContent = "返礼品情報の取得に失敗しました。通信状況をご確認ください。";
    els.itemsError.hidden = false;
  } finally {
    loadingItems = false;
  }
}

/** @param {string} s */
function text(s) { return document.createTextNode(s); }
/** @param {string} s */
function strong(s) {
  const el = document.createElement("strong");
  el.textContent = s;
  return el;
}
