// @ts-check
// データ取得層とUIの分離(指示書34-35)。
// FurusatoProductProvider インターフェース:
//   searchByMunicipality({municipality, prefecture, municipalityCode, limit}) => Promise<Product[]>
//   searchByBudget({budget, category, limit}) => Promise<Product[]>
// 実装は MockFurusatoProductProvider / RakutenFurusatoProductProvider の2種。
// /api/status の mode に応じて自動選択し、楽天側の障害時はモックへフォールバックする。

import { MockFurusatoProductProvider } from "./mock-provider.js";
import { RakutenFurusatoProductProvider } from "./rakuten-provider.js";

/** @typedef {import("../lib/types.js").Product} Product */
/**
 * @typedef {Object} FurusatoProductProvider
 * @property {(q:{municipality:string, prefecture:string, municipalityCode:string, limit?:number}) => Promise<Product[]>} searchByMunicipality
 * @property {(q:{budget:number, category:string, limit?:number}) => Promise<Product[]>} searchByBudget
 */

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
 * @returns {Promise<{provider: FurusatoProductProvider, mode:"mock"|"rakuten"}>}
 */
export async function getProvider() {
  const forceMock = typeof location !== "undefined" && new URLSearchParams(location.search).get("mock") === "1";
  const s = await fetchStatus();
  if (forceMock || s.mode === "mock") {
    return { provider: new MockFurusatoProductProvider(), mode: "mock" };
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
  return { provider: withFallback, mode: "rakuten" };
}
