// @ts-check
// 返礼品の「6件+さらに◯件」表示の純ロジック(2026-08-18)。
// 楽天APIへは1回で最大12件を要求し、追加表示は取得済みデータの描画のみで行う
// (=ボタン押下で再通信しない設計を、fetchを持たない純関数として保証する)。

/** 1回のAPI呼び出しで要求する最大件数 */
export const PRODUCT_FETCH_LIMIT = 12;
/** 初期表示件数 */
export const PRODUCT_INITIAL_COUNT = 6;

/**
 * 取得済み商品を「初期表示分」と「追加表示分」に分割する(重複なし・順序維持)。
 * @template T
 * @param {T[]} list
 * @returns {{ first: T[], rest: T[] }}
 */
export function splitProducts(list) {
  const all = Array.isArray(list) ? list.slice(0, PRODUCT_FETCH_LIMIT) : [];
  return { first: all.slice(0, PRODUCT_INITIAL_COUNT), rest: all.slice(PRODUCT_INITIAL_COUNT) };
}

/**
 * 追加表示ボタンのラベル。restが0件なら空文字(=ボタン非表示)。
 * @param {number} restCount
 */
export function moreLabel(restCount) {
  return restCount > 0 ? `返礼品をさらに${restCount}件見る` : "";
}
