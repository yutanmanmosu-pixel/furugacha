// @ts-check
/** @typedef {import("./types.js").Product} Product */

/** URL欠落・不正時の最終フォールバック(楽天ふるさと納税トップ) */
export const FALLBACK_PRODUCT_URL = "https://event.rakuten.co.jp/furusato/";

/**
 * 商品CTAの遷移先URLを決める唯一の場所。
 * - 楽天APIが返した正規のaffiliateUrlがあればそれを使う。
 * - なければ通常のproductUrlをそのまま使う。
 * - 疑似的なアフィリエイトパラメータを勝手に付加することは絶対にしない(楽天規約遵守)。
 * @param {Product} p
 * @returns {string}
 */
export function getProductDestinationUrl(p) {
  if (p.affiliateUrl && /^https:\/\//.test(p.affiliateUrl)) return p.affiliateUrl;
  if (p.productUrl && /^https?:\/\//.test(p.productUrl)) return p.productUrl;
  return FALLBACK_PRODUCT_URL; // javascript:等の不正スキームや欠落はここで遮断
}

/** CTAラベル @param {Product} p */
export function ctaLabel(p) {
  return p.isMock ? "楽天ふるさと納税で探す" : "楽天ふるさと納税で見る";
}
