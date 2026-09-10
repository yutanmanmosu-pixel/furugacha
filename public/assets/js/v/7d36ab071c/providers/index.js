// @ts-check
// データ取得層とUIの分離(指示書34-35)。
// FurusatoProductProvider インターフェース:
//   searchByMunicipality({municipality, prefecture, municipalityCode, limit}) => Promise<Product[]>
//   searchByBudget({budget, category, limit}) => Promise<Product[]>
// 実装は MockFurusatoProductProvider / RakutenFurusatoProductProvider の2種。
// /api/status の mode に応じて自動選択し、楽天側の障害時はモックへフォールバックする。

import { MockFurusatoProductProvider } from "./mock-provider.js";
import { RakutenFurusatoProductProvider } from "./rakuten-provider.js";
import { fetchMunicipalityProducts } from "../lib/municipality-products.js";

/** @typedef {import("../lib/types.js").Product} Product */
/** @typedef {import("../lib/municipality-products.js").MunicipalityFetchResult} MunicipalityFetchResult */
/**
 * @typedef {Object} FurusatoProductProvider
 * @property {(q:{municipality:string, prefecture:string, municipalityCode:string, limit?:number}) => Promise<Product[]>} searchByMunicipality
 * @property {(q:{budget:number, category:string, limit?:number}) => Promise<Product[]>} searchByBudget
 */
/**
 * 自治体ガチャ用に、同一requestのitemsとstatusをまとめて返す口を足したProvider。
 * @typedef {FurusatoProductProvider & {searchByMunicipalityDetailed: (q:{municipality:string, prefecture:string, municipalityCode:string, limit?:number}) => Promise<MunicipalityFetchResult>}} DetailedProductProvider
 */

/**
 * 既存Providerに自治体ガチャ専用の詳細取得を足す(既存メソッドの挙動は一切変えない)。
 * detailSource には「mockへフォールバックしない実データ源」を渡すこと。楽天モードで
 * サンプル商品をその自治体の実返礼品のように見せないため、詳細取得はフォールバックしない。
 * @param {FurusatoProductProvider} base 既存の呼び出し口(従来どおりフォールバックあり)
 * @param {FurusatoProductProvider} detailSource 詳細取得に使う実データ源
 * @returns {DetailedProductProvider}
 */
function withMunicipalityDetail(base, detailSource) {
  return {
    searchByMunicipality: (q) => base.searchByMunicipality(q),
    searchByBudget: (q) => base.searchByBudget(q),
    searchByMunicipalityDetailed: (q) => fetchMunicipalityProducts(() => detailSource.searchByMunicipality(q))
  };
}

/** @type {{mode:"mock"|"rakuten", hasAffiliate:boolean} | null} */
let status = null;

/** サーバー設定を確認(失敗時はモック扱い)。 */
export async function fetchStatus() {
  if (status) return status;
  try {
    const res = await fetch("/api/status", { headers: { accept: "application/json" } });
    if (res.ok) {
      const json = await res.json();
      status = { mode: json.mode === "rakuten" ? "rakuten" : "mock", hasAffiliate: !!json.hasAffiliate };
      return status;
    }
  } catch { /* 静的プレビュー等、Functionsが無い環境 */ }
  status = { mode: "mock", hasAffiliate: false };
  return status;
}

/**
 * 現在の設定に合ったProviderを返す。
 * URLに ?mock=1 を付けると常にモック(動作検証用)。
 * @returns {Promise<{provider: DetailedProductProvider, mode:"mock"|"rakuten"}>}
 */
export async function getProvider() {
  const forceMock = typeof location !== "undefined" && new URLSearchParams(location.search).get("mock") === "1";
  const s = await fetchStatus();
  if (forceMock || s.mode === "mock") {
    const mockOnly = new MockFurusatoProductProvider();
    return { provider: withMunicipalityDetail(mockOnly, mockOnly), mode: "mock" };
  }
  // 楽天モード: 失敗時にモックへ切り替えるラッパー
  const rakuten = new RakutenFurusatoProductProvider();
  const mock = new MockFurusatoProductProvider();
  /** @type {FurusatoProductProvider} */
  const withFallback = {
    async searchByMunicipality(q) {
      try {
        const items = await rakuten.searchByMunicipality(q);
        if (items.length > 0) return items;
      } catch (e) { console.warn("Rakuten API error → mockへフォールバック", e); }
      return mock.searchByMunicipality(q);
    },
    async searchByBudget(q) {
      try {
        const items = await rakuten.searchByBudget(q);
        if (items.length > 0) return items;
      } catch (e) { console.warn("Rakuten API error → mockへフォールバック", e); }
      return mock.searchByBudget(q);
    }
  };
  // 自治体ガチャの詳細取得だけは楽天の応答をそのまま扱う(0件と障害を区別するため)。
  // 予算ガチャ・その他の既存呼び出しは withFallback のまま = 従来仕様を変更しない。
  return { provider: withMunicipalityDetail(withFallback, rakuten), mode: "rakuten" };
}
