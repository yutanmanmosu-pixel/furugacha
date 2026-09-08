// @ts-check
// 自治体ガチャの返礼品取得結果(2026-09-08 再実装)。
//
// 方針:
//  ・取得結果(items)と取得状態(status)を「同一requestの戻り値」として1つのオブジェクトで返す。
//    直前の取得結果をmodule-levelの可変stateに保持する旧方式は使わない。
//    非同期リクエストが連続しても、stale stateやitems/statusの取り違えが起きないため。
//  ・楽天APIが正常応答した0件("empty")と、通信・上流エラー("error")を必ず区別する。
//  ・文言は「楽天ふるさと納税で確認できなかった」範囲に限定し、
//    「この自治体には返礼品がない」等の断定はしない(他ポータル・一時停止・入替中の可能性があるため)。

/** @typedef {import("./types.js").Product} Product */
/** @typedef {"ok"|"empty"|"error"} MunicipalityFetchStatus */
/** @typedef {{items: Product[], status: MunicipalityFetchStatus}} MunicipalityFetchResult */

/**
 * 1回分の取得を実行し、その回のitemsとstatusを一緒に返す。
 * 例外はここで status:"error" に畳み込むため、呼び出し側で状態を保持する必要がない。
 * @param {() => Promise<Product[]>} run 実際の取得処理(既存Providerをそのまま使う)
 * @returns {Promise<MunicipalityFetchResult>}
 */
export async function fetchMunicipalityProducts(run) {
  try {
    const raw = await run();
    const items = Array.isArray(raw) ? raw : [];
    return { items, status: items.length > 0 ? "ok" : "empty" };
  } catch (e) {
    console.warn("返礼品の取得に失敗しました", e);
    return { items: [], status: "error" };
  }
}

/**
 * 0件(A) / 取得エラー(B) の案内文言。
 * @param {MunicipalityFetchStatus} status
 * @returns {{kind:"empty"|"error", title:string, sub:string}}
 */
export function productsEmptyState(status) {
  if (status === "error") {
    return {
      kind: "error",
      title: "返礼品を取得できませんでした。",
      sub: "時間をおいてもう一度お試しください。"
    };
  }
  return {
    kind: "empty",
    title: "現在、楽天ふるさと納税でこの自治体の返礼品を確認できませんでした。",
    sub: "掲載状況は変更される場合があります。"
  };
}
