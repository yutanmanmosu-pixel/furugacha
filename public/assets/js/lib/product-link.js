// @ts-check
/** @typedef {import("./types.js").Product} Product */

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
  return p.productUrl;
}

/** CTAラベル @param {Product} p */
export function ctaLabel(p) {
  return p.isMock ? "楽天ふるさと納税で探す" : "楽天ふるさと納税で見る";
}
