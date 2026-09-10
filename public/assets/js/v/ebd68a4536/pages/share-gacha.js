// @ts-check
// 共有された自治体ガチャ結果ページ。
// URLに入っているのは「抽選時の範囲 + 自治体コード + 共有日」だけ。自治体名は同梱の
// マスタから引くので、別端末・未ログインでも同じ結果が開ける(端末内保存に依存しない)。
//
// 大事な点: 抽選時の範囲を当選県で【上書きしない】。全国抽選なら「全国」、地方抽選なら
// その地方をそのまま表示する。

import { loadMunicipalities } from "../lib/data.js";
import { scopeLabel } from "../lib/gacha.js";
import { PREFECTURES, prefByName } from "../lib/regions.js";
import { renderTileMap } from "../lib/japan-map.js";
import { muniNote } from "../lib/muni-notes.js";
import { parseGachaShare, stampToDate, SHARE_TTL_DAYS } from "../lib/share-state.js";
import { getProvider, fetchStatus } from "../providers/index.js";
import { productCard, loadingEl } from "./product-card.js";
import { PRODUCT_FETCH_LIMIT } from "../lib/product-paging.js";

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
  scope: must("#share-scope"),
  pref: must("#share-pref"),
  muni: must("#share-muni"),
  note: must("#share-note"),
  date: must("#share-date"),
  rakuten: /** @type {HTMLAnchorElement} */ (must("#share-rakuten")),
  map: must("#share-map"),
  products: must("#share-products"),
  productsName: must("#share-products-name"),
  productsNote: must("#share-products-note"),
  productsEmpty: must("#share-products-empty"),
  productsGrid: must("#share-products-grid"),
  prBadge: must("#share-pr-badge")
};

const PREF_NAME_BY_CODE = Object.fromEntries(PREFECTURES.map((p) => [p.code, p.name]));

/** @param {string} title @param {string} msg */
function showError(title, msg) {
  els.loading.hidden = true;
  els.main.hidden = true;
  els.products.hidden = true;
  els.errorTitle.textContent = title;
  els.errorMsg.textContent = msg;
  els.error.hidden = false;
}

void main();

async function main() {
  const parsed = parseGachaShare(new URLSearchParams(location.search));
  if (!parsed.ok) {
    if (parsed.reason === "expired") {
      showError("共有リンクの有効期限が切れました",
        `共有リンクは${SHARE_TTL_DAYS}日で期限切れになります。返礼品の内容や寄附額は変わるためです。よければご自身でガチャを回してみてください。`);
    } else {
      showError("結果が見つかりませんでした",
        "共有リンクが正しくないか、古い形式のようです。ふるガチャでもう一度ガチャを回してみてください。");
    }
    return;
  }

  /** @type {import("../lib/types.js").Municipality | undefined} */
  let m;
  try {
    const { municipalities } = await loadMunicipalities();
    m = municipalities.find((x) => x.municipalityCode === parsed.municipalityCode);
  } catch (e) {
    console.error(e);
    showError("結果を読み込めませんでした", "通信状況をご確認のうえ、ページを再読み込みしてください。");
    return;
  }
  if (!m) {
    showError("結果が見つかりませんでした", "この自治体は現在ふるガチャに掲載されていません。ふるガチャでもう一度ガチャを回してみてください。");
    return;
  }

  els.scope.textContent = `${scopeLabel(parsed.scope)}から抽選`;
  els.pref.textContent = m.prefecture;
  els.muni.textContent = m.municipality;
  els.note.textContent = muniNote(m.municipalityCode) ??
    `${m.prefecture}のまち、${m.municipality}。どんな返礼品があるか、のぞいてみてください。`;
  els.date.textContent = `共有日: ${stampToDate(parsed.stamp)}(共有リンクの有効期限は${SHARE_TTL_DAYS}日です)`;
  els.rakuten.href = `https://search.rakuten.co.jp/search/mall/${encodeURIComponent(`ふるさと納税 ${m.municipality}`)}/`;
  renderTileMap(els.map, {
    activeCodes: new Set([prefByName(m.prefecture)?.code ?? ""]),
    prefNames: PREF_NAME_BY_CODE
  });
  document.title = `${m.prefecture}${m.municipality}｜ふるガチャの結果`;

  els.loading.hidden = true;
  els.main.hidden = false;

  await loadCurrentProducts(m);
}

/**
 * 「いまの」返礼品候補。共有時点の一覧ではないことを画面にも明記してある。
 * @param {import("../lib/types.js").Municipality} m
 */
async function loadCurrentProducts(m) {
  els.products.hidden = false;
  els.productsName.textContent = m.municipality;
  els.productsGrid.replaceChildren(loadingEl());
  try {
    const [{ provider, mode }, status] = await Promise.all([getProvider(), fetchStatus()]);
    const result = await provider.searchByMunicipalityDetailed({
      municipality: m.municipality, prefecture: m.prefecture,
      municipalityCode: m.municipalityCode, limit: PRODUCT_FETCH_LIMIT
    });
    if (result.status !== "ok" || result.items.length === 0) {
      els.productsGrid.replaceChildren();
      els.productsEmpty.hidden = false;
      els.productsNote.textContent = "";
      return;
    }
    const isMock = mode === "mock" || result.items.every((p) => p.isMock);
    els.prBadge.hidden = !(status.hasAffiliate && !isMock);
    els.productsNote.textContent = isMock
      ? "※現在はサンプル表示です(実在の商品ではありません)。実際の返礼品はリンク先の楽天ふるさと納税でご確認ください。"
      : status.hasAffiliate
        ? "※以下には広告(楽天アフィリエイトのリンク)を含みます。寄附額・内容は必ずリンク先でご確認ください。"
        : "※楽天市場の検索結果をもとに表示しています。寄附額・内容は必ずリンク先でご確認ください。";
    const frag = document.createDocumentFragment();
    for (const p of result.items.slice(0, 6)) frag.append(productCard(p));
    els.productsGrid.replaceChildren(frag);
  } catch (e) {
    console.error(e);
    els.productsGrid.replaceChildren();
    els.productsEmpty.hidden = false;
  }
}
